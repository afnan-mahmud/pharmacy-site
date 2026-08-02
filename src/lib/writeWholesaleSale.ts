import mongoose, { type ClientSession } from "mongoose";
import { buildSaleLines, type SaleItemInput } from "@/lib/saleLines";
import { computeTotals } from "@/lib/saleTotals";
import { nextInvoiceSeq, formatInvoiceNo } from "@/lib/invoiceNumber";
import { SettingsModel } from "@/models/Settings";
import { SaleModel, type SaleDoc } from "@/models/Sale";

export type WriteWholesaleSaleParams = {
  session: ClientSession;
  buyer: {
    id: mongoose.Types.ObjectId;
    name: string;
    shopName: string;
    phone: string;
  };
  items: SaleItemInput[];
  /** A percentage of the subtotal, 0-100. May be fractional. */
  discountPercent: number;
  paidPaisa: number;
  createdBy: string;
  orderId?: string | null;
};

/**
 * The single definition of "make a wholesale sale". Both the wholesale form
 * (recordWholesaleSale) and order approval (approveOrder) call this, so the
 * two paths cannot drift into different stock, invoice, or totalling rules.
 *
 * MUST be called from inside an already-open transaction (`session`). Every
 * read and write here uses that session, and stock goes through
 * buildSaleLines -> applyStockDelta. A sale always succeeds once every
 * line's medicine is found — there is no "not enough stock" refusal, so
 * stock may go negative. Reads are inside the caller's withTransaction so a
 * retry re-evaluates them.
 */
export async function writeWholesaleSale(
  params: WriteWholesaleSaleParams,
): Promise<SaleDoc> {
  const { session } = params;

  // A line may be zero — that is how the owner says "you ordered this, it was
  // out of stock" and still has it print on the invoice. A sale where *every*
  // line is zero bills nothing for nothing, so it is not a sale. This rule
  // lives here rather than in either caller's validator so the wholesale form
  // and order approval cannot drift into two different ideas of what a sale
  // is; the per-field shape checks stay at each action's trust boundary.
  if (!params.items.some((item) => item.boxes > 0 || (item.patas ?? 0) > 0)) {
    throw new Error("Onto ekta line e poriman dite hobe");
  }

  const lines = await buildSaleLines(params.items, session, "wholesale");

  // computeTotals normally re-derives the subtotal itself, via
  // ratePaisa * quantity per line — an assumption that breaks for a mixed
  // box+pata line, where lineTotalPaisa is not ratePaisa * quantity. Passing
  // quantity: 1 and ratePaisa: the line's own already-computed total sidesteps
  // that: lineTotal(ratePaisa, 1) is just ratePaisa, so the sum reproduces
  // exactly what was priced above, for every line, mixed or not.
  const { subtotalPaisa, discountPaisa, totalPaisa, duePaisa } = computeTotals(
    lines.map((l) => ({ ratePaisa: l.lineTotalPaisa, quantity: 1 })),
    { kind: "percent", percent: params.discountPercent },
    params.paidPaisa,
  );

  const settings = await SettingsModel.findOne({ key: "singleton" }).session(
    session,
  );
  const prefix = settings?.invoicePrefix ?? "ABC";
  const seq = await nextInvoiceSeq(session);

  const [sale] = await SaleModel.create(
    [
      {
        type: "wholesale",
        buyerId: params.buyer.id,
        buyerName: params.buyer.name,
        buyerShopName: params.buyer.shopName,
        buyerPhone: params.buyer.phone,
        invoiceNo: formatInvoiceNo(prefix, seq),
        orderId: params.orderId ?? null,
        items: lines,
        subtotalPaisa,
        discountPercent: params.discountPercent,
        discountPaisa,
        totalPaisa,
        paidPaisa: params.paidPaisa,
        duePaisa,
        status: "active",
        createdBy: new mongoose.Types.ObjectId(params.createdBy),
      },
    ],
    { session },
  );
  return sale;
}
