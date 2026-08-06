import mongoose, { type ClientSession } from "mongoose";
import { buildSaleLines, type SaleItemInput } from "@/lib/saleLines";
import { computeTotals, type DiscountInput } from "@/lib/saleTotals";
import { nextInvoiceSeq, formatInvoiceNo } from "@/lib/invoiceNumber";
import { computeRetailDue } from "@/lib/retailDueComputation";
import { SettingsModel } from "@/models/Settings";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { RetailCustomerModel } from "@/models/RetailCustomer";

export type WriteRetailSaleParams = {
  session: ClientSession;
  customerName: string;
  /** "" is allowed unless the sale ends up with a due — see the rule below. */
  customerPhone: string;
  items: SaleItemInput[];
  discount: DiscountInput;
  paidPaisa: number;
  createdBy: string;
};

/**
 * A retail due with no phone number attached is not allowed to exist.
 *
 * The phone is the only key a retail balance has: `Sale.buyerPhone` is what
 * listRetailDues groups by, and that query filters out the empty string (see
 * src/actions/due.ts). So a due saved without one is money owed that no
 * screen can ever display, that no total includes, and that
 * recordRetailPayment can never be settled against — it is lost the moment
 * it is written, silently.
 *
 * Exported rather than inlined below because writeRetailSale is not the only
 * path that can leave a sale holding a due: updateSale
 * (src/actions/sales.ts) re-derives the totals of an existing sale and has
 * to reach the same verdict. Two copies of this rule would be two chances
 * for the create path and the edit path to disagree about it — which is
 * exactly what happened before this was shared.
 */
export function assertRetailDueIsCollectable(
  duePaisa: number,
  phone: string,
): void {
  if (duePaisa > 0 && !phone.trim()) {
    throw new Error("Baki rakhte hole phone number dite hobe");
  }
}

/**
 * The single definition of "make a retail sale" — parallel to
 * writeWholesaleSale (src/lib/writeWholesaleSale.ts). Has one caller today
 * (recordRetailSale), but the transaction is non-trivial enough (line
 * building, discount math, invoice numbering, the phone-required-on-due
 * rule, the RetailCustomer upsert) to earn its own file and its own direct
 * tests, the same way writeWholesaleSale's does.
 *
 * MUST be called from inside an already-open transaction (`session`).
 */
export async function writeRetailSale(
  params: WriteRetailSaleParams,
): Promise<SaleDoc> {
  const { session } = params;

  if (!params.items.some((item) => item.boxes > 0 || (item.patas ?? 0) > 0)) {
    throw new Error("Onto ekta line e poriman dite hobe");
  }

  const lines = await buildSaleLines(params.items, session, "retail");

  const { subtotalPaisa, discountPercent, discountPaisa, totalPaisa, duePaisa } =
    computeTotals(
      lines.map((l) => ({ ratePaisa: l.lineTotalPaisa, quantity: 1 })),
      params.discount,
      params.paidPaisa,
    );

  const trimmedPhone = params.customerPhone.trim();
  const trimmedName = params.customerName.trim();

  assertRetailDueIsCollectable(duePaisa, trimmedPhone);

  const settings = await SettingsModel.findOne({ key: "singleton" }).session(
    session,
  );
  const prefix = settings?.invoicePrefix ?? "NP";
  const seq = await nextInvoiceSeq(session);

  if (trimmedPhone) {
    // "One phone, one remembered name" — the latest sale's name wins, same
    // rule the retail-counter autocomplete relies on.
    await RetailCustomerModel.findOneAndUpdate(
      { phone: trimmedPhone },
      { $set: { name: trimmedName } },
      { session, upsert: true },
    );
  }

  const previousDuePaisa = trimmedPhone ? await computeRetailDue(trimmedPhone, session) : 0;

  const [sale] = await SaleModel.create(
    [
      {
        type: "retail",
        buyerId: null,
        buyerName: trimmedName,
        buyerPhone: trimmedPhone,
        invoiceNo: formatInvoiceNo(prefix, seq),
        items: lines,
        subtotalPaisa,
        discountPercent,
        discountPaisa,
        totalPaisa,
        paidPaisa: params.paidPaisa,
        duePaisa,
        previousDuePaisa,
        status: "active",
        createdBy: new mongoose.Types.ObjectId(params.createdBy),
      },
    ],
    { session },
  );
  return sale;
}
