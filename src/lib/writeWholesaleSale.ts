import mongoose, { type ClientSession } from "mongoose";
import { boxesToPatas } from "@/lib/units";
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
  discountPaisa: number;
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
  const lines = [];

  for (const item of params.items) {
    const medicine = await MedicineModel.findById(item.medicineId).session(
      session,
    );
    if (!medicine) throw new Error("Medicine pawa jay ni");

    const patas = boxesToPatas(item.boxes, medicine.patasPerBox);

    const ok = await applyStockDelta(medicine._id, -patas, session);
    if (!ok) {
      const current = await MedicineModel.findById(item.medicineId).session(
        session,
      );
      throw new Error(
        `${medicine.name} — stock e ache ${current?.stockPatas ?? 0} pata, lagbe ${patas} pata`,
      );
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

  const { subtotalPaisa, totalPaisa, duePaisa } = computeTotals(
    lines.map((l) => ({ ratePaisa: l.ratePaisa, quantity: l.quantity })),
    params.discountPaisa,
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
        discountPaisa: params.discountPaisa,
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
