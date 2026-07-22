import mongoose, { type ClientSession } from "mongoose";
import { boxesToPatas } from "@/lib/units";
import { unitLabelsFor } from "@/lib/unitLabels";
import { applyStockDelta } from "@/lib/stockTransaction";
import { lineTotal, computeTotals } from "@/lib/saleTotals";
import { nextInvoiceSeq, formatInvoiceNo } from "@/lib/invoiceNumber";
import { MedicineModel } from "@/models/Medicine";
import { SettingsModel } from "@/models/Settings";
import { SaleModel, type SaleDoc } from "@/models/Sale";

export type WriteWholesaleSaleParams = {
  session: ClientSession;
  buyer: { id: mongoose.Types.ObjectId; name: string; shopName: string };
  items: { medicineId: string; boxes: number }[];
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
 * applyStockDelta, whose precondition lives in the update filter — a bare
 * $inc would take stock negative (Mongoose min:0 does not run on $inc).
 * Reads are inside the caller's withTransaction so a retry re-evaluates them.
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
  if (!params.items.some((item) => item.boxes > 0)) {
    throw new Error("Onto ekta line e poriman dite hobe");
  }

  const lines = [];

  for (const item of params.items) {
    const medicine = await MedicineModel.findById(item.medicineId).session(
      session,
    );
    if (!medicine) throw new Error("Medicine pawa jay ni");

    const patas = boxesToPatas(item.boxes, medicine.patasPerBox);

    // A zero line takes nothing off the shelf. Skipped rather than passed
    // through applyStockDelta as a delta of 0, which would issue an `$inc: 0`
    // that changes nothing; its other half — "does this medicine still
    // exist" — is already covered by the findById above.
    if (patas > 0) {
      const unit = unitLabelsFor(medicine.form).inner;
      const ok = await applyStockDelta(medicine._id, -patas, session);
      if (!ok) {
        const current = await MedicineModel.findById(item.medicineId).session(
          session,
        );
        throw new Error(
          `${medicine.name} — stock e ache ${current?.stockPatas ?? 0} ${unit}, lagbe ${patas} ${unit}`,
        );
      }
    }

    lines.push({
      medicineId: medicine._id,
      medicineName: medicine.name,
      form: medicine.form,
      unit: "box" as const,
      quantity: item.boxes,
      ratePaisa: medicine.boxPricePaisa,
      lineTotalPaisa: lineTotal({
        ratePaisa: medicine.boxPricePaisa,
        quantity: item.boxes,
      }),
      patasDeducted: patas,
    });
  }

  // discountPaisa comes back from computeTotals rather than being worked out
  // here, so the amount stored is exactly the one the form previewed.
  const { subtotalPaisa, discountPaisa, totalPaisa, duePaisa } = computeTotals(
    lines.map((l) => ({ ratePaisa: l.ratePaisa, quantity: l.quantity })),
    params.discountPercent,
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
