"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { applyStockDelta } from "@/lib/stockTransaction";
import { computeTotals, lineTotal } from "@/lib/saleTotals";
import { toPlain, type Serialized } from "@/lib/serialize";
import { writeWholesaleSale } from "@/lib/writeWholesaleSale";
import { MedicineModel } from "@/models/Medicine";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { BuyerModel } from "@/models/Buyer";
import { actionResult, type ActionResult } from "@/lib/actionResult";

export type RetailSaleInput = {
  items: { medicineId: string; patas: number }[];
  /** Required. A counter sale must say who it was to. */
  customerName: string;
  /** Optional — the customer may decline to give one. */
  customerPhone?: string;
};

/**
 * Mirrors the convention in src/actions/medicines.ts: an optional string may
 * be absent or null and becomes "", but any other type is a malformed payload
 * on a network-reachable boundary and is rejected rather than stringified.
 */
function toOptionalString(value: unknown, label: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

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

  if (typeof input.customerName !== "string" || !input.customerName.trim()) {
    throw new Error("Customer nam likhte hobe");
  }
  // Validated for its side effect; the value is re-derived at the write.
  toOptionalString(input.customerPhone, "customerPhone");

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
): Promise<ActionResult<Serialized<SaleDoc>>> {
  return actionResult(async () => {
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
          const medicine = await MedicineModel.findById(
            item.medicineId,
          ).session(session);
          if (!medicine) throw new Error("Medicine pawa jay ni");

          // A sale always succeeds once the medicine is found — there is no
          // "not enough stock" refusal, so stock may go negative. This can
          // now only fail if the medicine vanished between the findById
          // above and here, which is already effectively unreachable inside
          // one transaction; the check stays as a defensive fallback.
          const ok = await applyStockDelta(medicine._id, -item.patas, session);
          if (!ok) throw new Error("Medicine pawa jay ni");

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
              buyerName: input.customerName.trim(),
              buyerPhone: toOptionalString(
                input.customerPhone,
                "customerPhone",
              ).trim(),
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
  });
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
): Promise<ActionResult<Serialized<SaleDoc>>> {
  return actionResult(async () => {
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
          buyer: {
            id: buyer._id,
            name: buyer.name,
            shopName: buyer.shopName,
            phone: buyer.phone,
          },
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
  });
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
export async function cancelSale(
  id: string,
  reason: string,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
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
  });
}

/**
 * The name last used at the counter for a phone number, so the owner does not
 * retype a regular customer's name on every visit.
 *
 * Only retail sales are searched. A wholesale buyer is a managed record with
 * its own screen, and letting a shop's name autofill the walk-in counter would
 * put the wrong name on a cash sale.
 *
 * Returns null rather than throwing when nothing matches: this is a
 * convenience, and its failure mode has to be "type the name yourself", never
 * "you cannot sell".
 */
export async function lookupRetailCustomer(
  phone: string,
): Promise<{ name: string } | null> {
  await requireAdminAction();

  if (typeof phone !== "string") return null;
  const trimmed = phone.trim();
  // Guard before touching the database: "" is the value every sale without a
  // phone carries, so an empty query would match a great many rows.
  if (!trimmed) return null;

  await connectDb();

  const sale = await SaleModel.findOne({
    type: "retail",
    buyerPhone: trimmed,
    buyerName: { $gt: "" },
  })
    .sort({ createdAt: -1 })
    .select("buyerName")
    .lean<{ buyerName: string }>();

  return sale ? { name: sale.buyerName } : null;
}
