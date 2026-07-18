"use server";

import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { dhakaToday, dhakaDayBounds } from "@/lib/dhakaDate";
import { listBuyerDues } from "@/actions/due";
import { splitDueTotals } from "@/lib/dueDisplay";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { MedicineModel, type MedicineDoc } from "@/models/Medicine";
import { OrderModel } from "@/models/Order";

export type LowStockRow = {
  medicineId: string;
  name: string;
  stockPatas: number;
  patasPerBox: number;
  lowStockThreshold: number;
};

export type DashboardSummary = {
  today: string;
  todayTotalPaisa: number;
  todayRetailPaisa: number;
  todayWholesalePaisa: number;
  todaySaleCount: number;
  /** Sum of what buyers owe. Buyers in credit are excluded — see below. */
  totalDuePaisa: number;
  /** Sum of credit the pharmacy owes buyers, as a positive number. */
  totalCreditPaisa: number;
  lowStock: LowStockRow[];
  /** Orders awaiting the owner's approval or rejection. */
  pendingOrderCount: number;
};

/**
 * The owner's business at a glance: what sold today, what he is owed, and
 * what is running out.
 *
 * "Today" is a Dhaka day, not a UTC one — a sale rung up at 00:30 Dhaka is
 * stored as 18:30 UTC the previous day, and a UTC-bounded query would file
 * it under yesterday. See src/lib/dhakaDate.ts.
 *
 * Cancelled sales are excluded from today's takings, matching salesReport,
 * buyerLedger, and listBuyerDues.
 */
export async function dashboardSummary(): Promise<DashboardSummary> {
  await requireAdminAction();
  await connectDb();

  const today = dhakaToday();
  const { start, end } = dhakaDayBounds(today);

  const [todaySales, dues, lowStockDocs, pendingOrderCount] = await Promise.all([
    SaleModel.find({
      createdAt: { $gte: start, $lt: end },
      status: "active",
    }).lean<SaleDoc[]>(),
    listBuyerDues(),
    // A threshold of 0 means the owner set no alert for that medicine, so an
    // empty one must not nag him forever — hence $gt: 0 rather than $gte.
    MedicineModel.find({
      active: true,
      lowStockThreshold: { $gt: 0 },
      $expr: { $lte: ["$stockPatas", "$lowStockThreshold"] },
    })
      .sort({ stockPatas: 1 })
      .lean<MedicineDoc[]>(),
    OrderModel.countDocuments({ status: "pending" }),
  ]);

  const sumBy = (type: "retail" | "wholesale") =>
    todaySales
      .filter((sale) => sale.type === type)
      .reduce((total, sale) => total + sale.totalPaisa, 0);

  const todayRetailPaisa = sumBy("retail");
  const todayWholesalePaisa = sumBy("wholesale");

  // Shared with DueTable via splitDueTotals so the two screens cannot drift
  // into reporting different figures for the same money.
  const { totalDuePaisa, totalCreditPaisa } = splitDueTotals(dues);

  return {
    today,
    todayTotalPaisa: todayRetailPaisa + todayWholesalePaisa,
    todayRetailPaisa,
    todayWholesalePaisa,
    todaySaleCount: todaySales.length,
    totalDuePaisa,
    totalCreditPaisa,
    lowStock: lowStockDocs.map((medicine) => ({
      medicineId: medicine._id.toString(),
      name: medicine.name,
      stockPatas: medicine.stockPatas,
      patasPerBox: medicine.patasPerBox,
      lowStockThreshold: medicine.lowStockThreshold,
    })),
    pendingOrderCount,
  };
}
