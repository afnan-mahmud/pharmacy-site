"use server";

import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { dhakaRangeBounds } from "@/lib/dhakaDate";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { MedicineModel, type MedicineDoc } from "@/models/Medicine";

export type SalesReportRow = {
  saleId: string;
  orderId?: string | null;
  createdAt: string;
  type: "retail" | "wholesale";
  invoiceNo: string | null;
  buyerName: string;
  buyerPhone: string;
  totalPaisa: number;
  costPaisa: number;
  profitPaisa: number;
  paidPaisa: number;
  duePaisa: number;
  status: "active" | "cancelled";
  cancelled: boolean;
};

export type SalesReportTotals = {
  count: number;
  totalPaisa: number;
  costPaisa: number;
  profitPaisa: number;
  duePaisa: number;
};

export type SalesReport = {
  fromDate: string;
  toDate: string;
  rows: SalesReportRow[];
  retail: SalesReportTotals;
  wholesale: SalesReportTotals;
  grandTotalPaisa: number;
  grandCostPaisa: number;
  grandProfitPaisa: number;
  grandDuePaisa: number;
  cancelledCount: number;
};

/**
 * Sales in a Dhaka date range, with retail and wholesale totalled separately,
 * including buying cost and profit calculations.
 *
 * Cancelled sales are listed but excluded from every total — the same rule
 * buyerLedger and listBuyerDues follow. A report that hid them would make a
 * cancellation look like a sale that never happened; one that counted them
 * would overstate the day's takings.
 *
 * The range is bounded by Dhaka midnights, not UTC ones. See
 * src/lib/dhakaDate.ts for why that distinction is load-bearing.
 */
export async function salesReport(
  fromDate: string,
  toDate: string,
): Promise<SalesReport> {
  await requireAdminAction();
  await connectDb();

  // Throws a clean domain error on a malformed or reversed range.
  const { start, end } = dhakaRangeBounds(fromDate, toDate);

  const sales = await SaleModel.find({
    createdAt: { $gte: start, $lt: end },
  })
    .sort({ createdAt: -1 })
    .lean<SaleDoc[]>();

  // Collect medicine IDs for medicines whose cost wasn't snapshotted
  const medicineIdsToFetch = new Set<string>();
  for (const sale of sales) {
    for (const item of sale.items) {
      if (item.medicineId && (item.costPaisa === undefined || item.costPaisa === 0)) {
        medicineIdsToFetch.add(item.medicineId.toString());
      }
    }
  }

  const medicineMap = new Map<string, MedicineDoc>();
  if (medicineIdsToFetch.size > 0) {
    const meds = await MedicineModel.find({
      _id: { $in: Array.from(medicineIdsToFetch) },
    }).lean<MedicineDoc[]>();
    for (const med of meds) {
      medicineMap.set(med._id.toString(), med);
    }
  }

  const rows: SalesReportRow[] = sales.map((sale) => {
    const totalPaisa = Number(sale.totalPaisa) || 0;
    const paidPaisa = Number(sale.paidPaisa) || 0;
    const duePaisa = Number(sale.duePaisa) || 0;

    const costPaisa = (sale.items || []).reduce((total, item) => {
      const snapshottedCost = Number(item.costPaisa);
      if (Number.isFinite(snapshottedCost) && snapshottedCost > 0) {
        return total + snapshottedCost;
      }
      if (item.medicineId) {
        const med = medicineMap.get(item.medicineId.toString());
        if (med) {
          const purchasePrice = Number(med.purchasePricePaisa) || 0;
          if (purchasePrice > 0) {
            const patasPerBox = Number(med.patasPerBox) > 0 ? Number(med.patasPerBox) : 10;
            const boxes = Number(item.quantity) || 0;
            const leftoverPatas = Number(item.leftoverPatas) || 0;
            const itemCost =
              boxes * purchasePrice +
              Math.round((leftoverPatas * purchasePrice) / patasPerBox);
            return total + (Number.isFinite(itemCost) ? itemCost : 0);
          }
        }
      }
      return total;
    }, 0);

    const safeCost = Number.isFinite(costPaisa) ? costPaisa : 0;
    const profitPaisa = totalPaisa - safeCost;

    return {
      saleId: sale._id.toString(),
      orderId: sale.orderId ? sale.orderId.toString() : null,
      createdAt: sale.createdAt ? new Date(sale.createdAt).toISOString() : new Date().toISOString(),
      type: (sale.type === "wholesale" ? "wholesale" : "retail") as "retail" | "wholesale",
      invoiceNo: sale.invoiceNo ?? null,
      buyerName: sale.buyerName || "",
      buyerPhone: sale.buyerPhone ?? "",
      totalPaisa,
      costPaisa: safeCost,
      profitPaisa: Number.isFinite(profitPaisa) ? profitPaisa : 0,
      paidPaisa,
      duePaisa,
      status: sale.status as "active" | "cancelled",
      cancelled: sale.status === "cancelled",
    };
  });

  // Totals count only sales that are actually "active"
  const active = rows.filter((row) => row.status === "active");
  const retailRows = active.filter((row) => row.type === "retail");
  const wholesaleRows = active.filter((row) => row.type === "wholesale");

  const sum = (
    list: SalesReportRow[],
    field: "totalPaisa" | "costPaisa" | "profitPaisa" | "duePaisa",
  ) => list.reduce((total, row) => total + (Number(row[field]) || 0), 0);

  const retail: SalesReportTotals = {
    count: retailRows.length,
    totalPaisa: sum(retailRows, "totalPaisa"),
    costPaisa: sum(retailRows, "costPaisa"),
    profitPaisa: sum(retailRows, "profitPaisa"),
    duePaisa: sum(retailRows, "duePaisa"),
  };

  const wholesale: SalesReportTotals = {
    count: wholesaleRows.length,
    totalPaisa: sum(wholesaleRows, "totalPaisa"),
    costPaisa: sum(wholesaleRows, "costPaisa"),
    profitPaisa: sum(wholesaleRows, "profitPaisa"),
    duePaisa: sum(wholesaleRows, "duePaisa"),
  };

  return {
    fromDate,
    toDate,
    rows,
    retail,
    wholesale,
    grandTotalPaisa: (retail.totalPaisa || 0) + (wholesale.totalPaisa || 0),
    grandCostPaisa: (retail.costPaisa || 0) + (wholesale.costPaisa || 0),
    grandProfitPaisa: (retail.profitPaisa || 0) + (wholesale.profitPaisa || 0),
    grandDuePaisa: (retail.duePaisa || 0) + (wholesale.duePaisa || 0),
    cancelledCount: rows.length - active.length,
  };
}
