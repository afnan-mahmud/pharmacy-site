"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { applyStockDelta } from "@/lib/stockTransaction";
import { computeTotals, lineTotal } from "@/lib/saleTotals";
import { unitLabelsFor } from "@/lib/unitLabels";
import { toPlain, type Serialized } from "@/lib/serialize";
import { writeWholesaleSale } from "@/lib/writeWholesaleSale";
import { MedicineModel } from "@/models/Medicine";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { BuyerModel } from "@/models/Buyer";

export type RetailSaleInput = {
  items: { medicineId: string; patas: number }[];
};

/**
 * Network-reachable trust boundary — same convention as
 * src/actions/medicines.ts: every field is validated here before it reaches
 * Mongoose, so a malformed payload fails with a clean domain error rather
 * than a raw CastError.
 */
function validateRetail(input: RetailSaleInput): void {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Cart khali");
  }

  const seen = new Set<string>();
  for (const item of input.items) {
    if (!mongoose.Types.ObjectId.isValid(item.medicineId)) {
      throw new Error("Medicine pawa jay ni");
    }
    if (
      typeof item.patas !== "number" ||
      !Number.isInteger(item.patas) ||
      item.patas < 1
    ) {
      throw new Error("Poriman 1 er kom hote parbe na");
    }
    // Two lines for one medicine would each pass their own stock check and
    // could together oversell it.
    if (seen.has(item.medicineId)) {
      throw new Error("Ekta medicine ekbar er beshi cart e dewa jabe na");
    }
    seen.add(item.medicineId);
  }
}

export async function recordRetailSale(
  input: RetailSaleInput,
): Promise<Serialized<SaleDoc>> {
  const adminSession = await requireAdminAction();
  await connectDb();
  validateRetail(input);

  const session = await mongoose.startSession();
  let saleId: mongoose.Types.ObjectId | null = null;

  try {
    await session.withTransaction(async () => {
      const lines = [];

      for (const item of input.items) {
        // Read inside the transaction: withTransaction retries this callback
        // from the top on a TransientTransactionError, and a read taken
        // outside would not be re-evaluated by that retry.
        const medicine = await MedicineModel.findById(item.medicineId).session(
          session,
        );
        if (!medicine) throw new Error("Medicine pawa jay ni");

        // The precondition lives in applyStockDelta's update filter, so the
        // check and the write are one atomic operation. See
        // src/lib/stockTransaction.ts for why a pre-read is not a substitute.
        const unit = unitLabelsFor(medicine.form).inner;
        const ok = await applyStockDelta(medicine._id, -item.patas, session);
        if (!ok) {
          // Re-read inside the same transaction to tell the owner what is
          // actually available, rather than a bare "not enough".
          const current = await MedicineModel.findById(item.medicineId).session(
            session,
          );
          throw new Error(
            `${medicine.name} — stock e ache ${current?.stockPatas ?? 0} ${unit}, lagbe ${item.patas} ${unit}`,
          );
        }

        lines.push({
          medicineId: medicine._id,
          medicineName: medicine.name,
          form: medicine.form,
          unit: "pata" as const,
          quantity: item.patas,
          ratePaisa: medicine.pataPricePaisa,
          lineTotalPaisa: lineTotal({
            ratePaisa: medicine.pataPricePaisa,
            quantity: item.patas,
          }),
          patasDeducted: item.patas,
        });
      }

      const subtotal = lines.reduce((sum, l) => sum + l.lineTotalPaisa, 0);
      // Retail is cash at the counter: no discount, always paid in full.
      // A walk-in customer leaving with credit is not a flow this system
      // supports (see the spec's "Pricing" section).
      const { subtotalPaisa, totalPaisa, duePaisa } = computeTotals(
        lines.map((l) => ({ ratePaisa: l.ratePaisa, quantity: l.quantity })),
        0,
        subtotal,
      );

      const [sale] = await SaleModel.create(
        [
          {
            type: "retail",
            buyerId: null,
            invoiceNo: null,
            items: lines,
            subtotalPaisa,
            discountPaisa: 0,
            totalPaisa,
            paidPaisa: totalPaisa,
            duePaisa,
            status: "active",
            createdBy: new mongoose.Types.ObjectId(adminSession.userId),
          },
        ],
        { session },
      );
      saleId = sale._id;
    });
  } finally {
    await session.endSession();
  }

  revalidatePath("/medicines");
  revalidatePath("/sell");

  const sale = await SaleModel.findById(saleId).lean<SaleDoc>();
  return toPlain(sale!);
}

export type WholesaleSaleInput = {
  buyerId: string;
  items: { medicineId: string; boxes: number }[];
  /** A percentage of the subtotal, 0-100. May be fractional. */
  discountPercent: number;
  paidPaisa: number;
};

function validateWholesale(input: WholesaleSaleInput): void {
  if (!mongoose.Types.ObjectId.isValid(input.buyerId)) {
    throw new Error("Buyer pawa jay ni");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Cart khali");
  }

  const seen = new Set<string>();
  for (const item of input.items) {
    if (!mongoose.Types.ObjectId.isValid(item.medicineId)) {
      throw new Error("Medicine pawa jay ni");
    }
    if (
      typeof item.boxes !== "number" ||
      !Number.isInteger(item.boxes) ||
      item.boxes < 0
    ) {
      // 0 is legal here — see the zero-line rule in writeWholesaleSale,
      // which is what stops an invoice from being zero all the way down.
      throw new Error("Poriman 0 er kom hote parbe na");
    }
    if (seen.has(item.medicineId)) {
      throw new Error("Ekta medicine ekbar er beshi cart e dewa jabe na");
    }
    seen.add(item.medicineId);
  }

  // computeTotals re-checks these against the actual subtotal; these guards
  // catch the malformed cases before any database work happens.
  // computeTotals is the authority on the range; this catches the malformed
  // cases before any database work happens. Fractional is legal here — 2.5%
  // is a real discount — so unlike the money fields there is no integer check.
  if (
    typeof input.discountPercent !== "number" ||
    !Number.isFinite(input.discountPercent) ||
    input.discountPercent < 0 ||
    input.discountPercent > 100
  ) {
    throw new Error("Discount 0 theke 100 er moddhe hote hobe");
  }
  if (
    typeof input.paidPaisa !== "number" ||
    !Number.isInteger(input.paidPaisa) ||
    input.paidPaisa < 0
  ) {
    throw new Error("paidPaisa must be a whole number");
  }
}

export async function recordWholesaleSale(
  input: WholesaleSaleInput,
): Promise<Serialized<SaleDoc>> {
  const adminSession = await requireAdminAction();
  await connectDb();
  validateWholesale(input);

  const session = await mongoose.startSession();
  let saleId: mongoose.Types.ObjectId | null = null;

  try {
    await session.withTransaction(async () => {
      const buyer = await BuyerModel.findById(input.buyerId).session(session);
      if (!buyer) throw new Error("Buyer pawa jay ni");
      if (!buyer.active) throw new Error("Buyer ta bondho ache");

      const sale = await writeWholesaleSale({
        session,
        buyer: { id: buyer._id, name: buyer.name, shopName: buyer.shopName },
        items: input.items,
        discountPercent: input.discountPercent,
        paidPaisa: input.paidPaisa,
        createdBy: adminSession.userId,
        orderId: null,
      });
      saleId = sale._id;
    });
  } finally {
    await session.endSession();
  }

  revalidatePath("/medicines");
  revalidatePath("/wholesale");
  revalidatePath("/due");

  const sale = await SaleModel.findById(saleId).lean<SaleDoc>();
  return toPlain(sale!);
}

export async function getSale(id: string): Promise<Serialized<SaleDoc> | null> {
  await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const sale = await SaleModel.findById(id).lean<SaleDoc>();
  return sale ? toPlain(sale) : null;
}

/**
 * Cancels a sale and returns exactly the stock it took.
 *
 * Sales are never deleted: an invoice number that vanishes from the books
 * is an audit trail with a hole in it, and the number stays burned so it can
 * never be reissued to a different sale.
 *
 * The stock returned comes from each line's snapshotted `patasDeducted`,
 * not from recomputing boxes x patasPerBox — if the pack size changed after
 * the sale, recomputing would return a different quantity than went out.
 */
export async function cancelSale(id: string, reason: string): Promise<void> {
  await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Bikri pawa jay ni");
  }
  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error("Cancel korar karon likhte hobe");
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sale = await SaleModel.findById(id).session(session);
      if (!sale) throw new Error("Bikri pawa jay ni");
      if (sale.status === "cancelled") {
        throw new Error("Ei bikri age theke cancel kora");
      }

      // Flip the status with the guard in the filter, so two concurrent
      // cancels cannot both pass and return the stock twice.
      const flipped = await SaleModel.updateOne(
        { _id: sale._id, status: "active" },
        {
          $set: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelReason: reason.trim(),
          },
        },
        { session },
      );
      if (flipped.matchedCount === 0) {
        throw new Error("Ei bikri age theke cancel kora");
      }

      for (const line of sale.items) {
        // A positive delta: the "enough stock" half of applyStockDelta's
        // precondition can never fail on a return, only "still exists".
        const ok = await applyStockDelta(
          line.medicineId,
          line.patasDeducted,
          session,
        );
        if (!ok) throw new Error("Medicine pawa jay ni");
      }
    });
  } finally {
    await session.endSession();
  }

  revalidatePath("/medicines");
  revalidatePath("/due");
}
