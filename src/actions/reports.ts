"use server";

import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { dhakaRangeBounds } from "@/lib/dhakaDate";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import {
  REPORT_PAGE_SIZE,
  normalizePage,
  pageCount,
  skipFor,
} from "@/lib/pagination";

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
  /**
   * False when a line sold something whose buying rate had not been entered
   * yet, so this row's cost — and the profit derived from it — is missing a
   * piece rather than being zero.
   */
  costKnown: boolean;
};

export type SalesReportTotals = {
  count: number;
  totalPaisa: number;
  costPaisa: number;
  profitPaisa: number;
  duePaisa: number;
};

export type SalesReportChannel = "all" | "retail" | "wholesale";
export type SalesReportStatus = "all" | "due" | "paid" | "cancelled";
export type SalesReportSort =
  | "newest"
  | "oldest"
  | "amount_desc"
  | "profit_desc"
  | "due_desc";

export type SalesReportInput = {
  fromDate: string;
  toDate: string;
  channel?: SalesReportChannel;
  status?: SalesReportStatus;
  /** Matches buyer name, phone or invoice number. */
  search?: string;
  sortBy?: SalesReportSort;
  page?: number;
};

export type SalesReport = {
  fromDate: string;
  toDate: string;
  /** One page of rows, already filtered and sorted. */
  rows: SalesReportRow[];
  page: number;
  pageSize: number;
  /** Rows matching the filter across every page. */
  totalRows: number;
  retail: SalesReportTotals;
  wholesale: SalesReportTotals;
  grandTotalPaisa: number;
  grandCostPaisa: number;
  grandProfitPaisa: number;
  grandDuePaisa: number;
  cancelledCount: number;
  /**
   * Active sales in the range carrying at least one line with no recorded
   * cost. Above zero, every profit figure here is an over-estimate, and the
   * screen says so.
   */
  unknownCostCount: number;
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
 *
 * Rows come back one page at a time, and the channel/status/search filters
 * and the sort are applied here rather than in the browser. They had to move
 * together: a page is a slice, so filtering or sorting one in the browser
 * would rank and count only the rows that happened to land on it. Before
 * this, a full-year range assembled every sale in it — items included — and
 * serialised the lot to a phone over mobile data.
 *
 * Cost comes only from what each line snapshotted at sale time. Where a line
 * has none, the cost is not guessed and the row is flagged instead — see
 * costKnown.
 *
 * What is still O(range) is this function's own scan: the summary totals need
 * every sale in it, not just the page. Now that cost is a plain sum of
 * per-line numbers, moving those totals into an aggregation is a small change
 * whenever the range sizes justify it.
 */
export async function salesReport(input: SalesReportInput): Promise<SalesReport> {
  await requireAdminAction();
  await connectDb();

  const { fromDate, toDate } = input;
  // Throws a clean domain error on a malformed or reversed range.
  const { start, end } = dhakaRangeBounds(fromDate, toDate);

  const channel: SalesReportChannel = input.channel ?? "all";
  const status: SalesReportStatus = input.status ?? "all";
  const sortBy: SalesReportSort = input.sortBy ?? "newest";
  const search = typeof input.search === "string" ? input.search.trim() : "";
  const page = normalizePage(input.page);

  // Only the fields the report actually reads. The item list dominates a
  // sale document, and of it this needs four numbers per line — dropping the
  // names, rates and unit labels is most of the weight of a year's sales.
  const sales = await SaleModel.find({
    createdAt: { $gte: start, $lt: end },
  })
    .select(
      "orderId createdAt type invoiceNo buyerName buyerPhone totalPaisa paidPaisa duePaisa status items.costPaisa items.quantity items.leftoverPatas",
    )
    .sort({ createdAt: -1 })
    .lean<SaleDoc[]>();

  const rows: SalesReportRow[] = sales.map((sale) => {
    const totalPaisa = Number(sale.totalPaisa) || 0;
    const paidPaisa = Number(sale.paidPaisa) || 0;
    const duePaisa = Number(sale.duePaisa) || 0;

    // Only what the line recorded at the time. This used to fall back to the
    // medicine's *current* purchase price whenever a line had no cost of its
    // own, which meant correcting a cost price today silently rewrote what
    // last year's sales were reported to have earned. A figure that changes
    // retroactively is worse than one that is plainly incomplete.
    let costPaisa = 0;
    let linesWithoutCost = 0;
    for (const item of sale.items || []) {
      const snapshotted = Number(item.costPaisa);
      if (Number.isFinite(snapshotted) && snapshotted > 0) {
        costPaisa += snapshotted;
      } else if ((Number(item.quantity) || 0) > 0 || (Number(item.leftoverPatas) || 0) > 0) {
        // A line that sold something but recorded no cost — the medicine's
        // buying rate had not been entered when it was sold. A zero-quantity
        // line costing nothing is not the same thing and is not counted.
        linesWithoutCost += 1;
      }
    }

    const safeCost = Number.isFinite(costPaisa) ? costPaisa : 0;
    // Unknown cost counts as zero, so profit on such a line is its whole
    // revenue. That overstates it, which is why costKnown travels with the
    // row: the screen has to be able to say the number is incomplete rather
    // than let it be read as fact.
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
      costKnown: linesWithoutCost === 0,
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

  // Filtering, sorting and paging happen after the totals, deliberately: the
  // summary cards answer "what did this date range do", which the search box
  // and the status tabs must not silently narrow. That is also how the screen
  // behaved when it filtered a fully-loaded range in the browser.
  const matching = rows.filter((row) => {
    if (channel !== "all" && row.type !== channel) return false;

    if (status === "due" && (row.duePaisa <= 0 || row.cancelled)) return false;
    if (status === "paid" && (row.duePaisa > 0 || row.cancelled)) return false;
    if (status === "cancelled" && !row.cancelled) return false;

    if (search) {
      const term = search.toLowerCase();
      const hit =
        (row.buyerName || "").toLowerCase().includes(term) ||
        (row.buyerPhone || "").toLowerCase().includes(term) ||
        (row.invoiceNo || "").toLowerCase().includes(term);
      if (!hit) return false;
    }

    return true;
  });

  const sorted = [...matching].sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "amount_desc":
        return b.totalPaisa - a.totalPaisa;
      case "profit_desc":
        return b.profitPaisa - a.profitPaisa;
      case "due_desc":
        return b.duePaisa - a.duePaisa;
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  const totalRows = sorted.length;
  const skip = skipFor(page, REPORT_PAGE_SIZE, totalRows);

  return {
    fromDate,
    toDate,
    rows: sorted.slice(skip, skip + REPORT_PAGE_SIZE),
    page: Math.min(page, pageCount(totalRows, REPORT_PAGE_SIZE)),
    pageSize: REPORT_PAGE_SIZE,
    totalRows,
    retail,
    wholesale,
    grandTotalPaisa: (retail.totalPaisa || 0) + (wholesale.totalPaisa || 0),
    grandCostPaisa: (retail.costPaisa || 0) + (wholesale.costPaisa || 0),
    grandProfitPaisa: (retail.profitPaisa || 0) + (wholesale.profitPaisa || 0),
    grandDuePaisa: (retail.duePaisa || 0) + (wholesale.duePaisa || 0),
    cancelledCount: rows.length - active.length,
    unknownCostCount: active.filter((row) => !row.costKnown).length,
  };
}
