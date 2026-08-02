"use server";

import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { dhakaRangeBounds } from "@/lib/dhakaDate";
import { SaleModel, type SaleDoc } from "@/models/Sale";

export type SalesReportRow = {
  saleId: string;
  createdAt: string;
  type: "retail" | "wholesale";
  invoiceNo: string | null;
  buyerName: string;
  buyerPhone: string;
  totalPaisa: number;
  paidPaisa: number;
  duePaisa: number;
  status: "active" | "cancelled";
  cancelled: boolean;
};

export type SalesReportTotals = {
  count: number;
  totalPaisa: number;
};

export type SalesReport = {
  fromDate: string;
  toDate: string;
  rows: SalesReportRow[];
  retail: SalesReportTotals & { duePaisa: number };
  wholesale: SalesReportTotals & { duePaisa: number };
  grandTotalPaisa: number;
  cancelledCount: number;
};

/**
 * Sales in a Dhaka date range, with retail and wholesale totalled separately.
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

  const rows: SalesReportRow[] = sales.map((sale) => ({
    saleId: sale._id.toString(),
    createdAt: sale.createdAt.toISOString(),
    type: sale.type as "retail" | "wholesale",
    invoiceNo: sale.invoiceNo ?? null,
    buyerName: sale.buyerName,
    buyerPhone: sale.buyerPhone ?? "",
    totalPaisa: sale.totalPaisa,
    paidPaisa: sale.paidPaisa,
    duePaisa: sale.duePaisa,
    status: sale.status as "active" | "cancelled",
    cancelled: sale.status === "cancelled",
  }));

  // Totals count only sales that are actually "active" — a whitelist, not a
  // "not cancelled" blacklist. If a third status (e.g. a future "draft" or
  // "void") were ever added, a blacklist would silently let it into the
  // day's takings; a whitelist keeps a new status out of the totals until
  // someone deliberately includes it. The rows above still list every sale.
  const active = rows.filter((row) => row.status === "active");
  const retailRows = active.filter((row) => row.type === "retail");
  const wholesaleRows = active.filter((row) => row.type === "wholesale");

  const sum = (list: SalesReportRow[], field: "totalPaisa" | "duePaisa") =>
    list.reduce((total, row) => total + row[field], 0);

  const retail: SalesReportTotals & { duePaisa: number } = {
    count: retailRows.length,
    totalPaisa: sum(retailRows, "totalPaisa"),
    duePaisa: sum(retailRows, "duePaisa"),
  };
  const wholesale = {
    count: wholesaleRows.length,
    totalPaisa: sum(wholesaleRows, "totalPaisa"),
    duePaisa: sum(wholesaleRows, "duePaisa"),
  };

  return {
    fromDate,
    toDate,
    rows,
    retail,
    wholesale,
    grandTotalPaisa: retail.totalPaisa + wholesale.totalPaisa,
    cancelledCount: rows.length - active.length,
  };
}
