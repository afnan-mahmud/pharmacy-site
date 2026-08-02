import mongoose, { type ClientSession } from "mongoose";
import { boxesToPatas } from "@/lib/units";
import { applyStockDelta } from "@/lib/stockTransaction";
import { MedicineModel } from "@/models/Medicine";

export type SaleItemInput = {
  medicineId?: string;
  customName?: string;
  customPricePaisa?: number;
  boxes: number;
  patas?: number;
};

export type SaleLineDraft = {
  medicineId: mongoose.Types.ObjectId | null;
  medicineName: string;
  form: string;
  unit: "box";
  quantity: number;
  leftoverPatas: number;
  ratePaisa: number;
  lineTotalPaisa: number;
  patasDeducted: number;
};

/**
 * Turns requested items into priced, stock-deducted sale lines — the box +
 * leftoverPatas convention every sale line uses (see the saleLineSchema
 * comment in src/models/Sale.ts). `priceMode` picks which of a medicine's
 * two independent rate pairs to bill: wholesaleBoxPricePaisa /
 * wholesalePataPricePaisa, or retailBoxPricePaisa / retailPataPricePaisa.
 *
 * Both writeWholesaleSale and writeRetailSale call this, so a medicine line
 * cannot price or deduct stock two different ways depending on which sale
 * type it's on.
 *
 * MUST be called from inside an already-open transaction (`session`). A
 * sale always succeeds once every line's medicine is found — there is no
 * "not enough stock" refusal, so stock may go negative.
 */
export async function buildSaleLines(
  items: SaleItemInput[],
  session: ClientSession,
  priceMode: "retail" | "wholesale",
): Promise<SaleLineDraft[]> {
  const lines: SaleLineDraft[] = [];

  for (const item of items) {
    if (item.medicineId) {
      const medicine = await MedicineModel.findById(item.medicineId).session(
        session,
      );
      if (!medicine) throw new Error("Medicine pawa jay ni");

      const boxPricePaisa =
        priceMode === "wholesale"
          ? medicine.wholesaleBoxPricePaisa
          : medicine.retailBoxPricePaisa;
      const pataPricePaisa =
        priceMode === "wholesale"
          ? medicine.wholesalePataPricePaisa
          : medicine.retailPataPricePaisa;

      const leftoverPatas = item.patas ?? 0;
      const totalPatas =
        boxesToPatas(item.boxes, medicine.patasPerBox) + leftoverPatas;

      // A zero line takes nothing off the shelf. Skipped rather than passed
      // through applyStockDelta as a delta of 0, which would issue an
      // `$inc: 0` that changes nothing; its other half — "does this medicine
      // still exist" — is already covered by the findById above.
      if (totalPatas > 0) {
        const ok = await applyStockDelta(medicine._id, -totalPatas, session);
        if (!ok) throw new Error("Medicine pawa jay ni");
      }

      lines.push({
        medicineId: medicine._id,
        medicineName: medicine.name,
        form: medicine.form,
        unit: "box",
        quantity: item.boxes,
        leftoverPatas,
        ratePaisa: boxPricePaisa,
        lineTotalPaisa:
          item.boxes * boxPricePaisa + leftoverPatas * pataPricePaisa,
        patasDeducted: totalPatas,
      });
    } else {
      if (!item.customName || item.customPricePaisa === undefined) {
        throw new Error("Custom item er nam o price dite hobe");
      }
      lines.push({
        medicineId: null,
        medicineName: item.customName,
        form: "custom",
        unit: "box",
        quantity: item.boxes,
        leftoverPatas: 0,
        ratePaisa: item.customPricePaisa,
        lineTotalPaisa: item.boxes * item.customPricePaisa,
        patasDeducted: 0,
      });
    }
  }

  return lines;
}
