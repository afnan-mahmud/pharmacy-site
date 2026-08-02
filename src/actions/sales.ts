"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { applyStockDelta } from "@/lib/stockTransaction";
import { writeWholesaleSale } from "@/lib/writeWholesaleSale";
import { writeRetailSale } from "@/lib/writeRetailSale";
import type { DiscountInput } from "@/lib/saleTotals";
import { toPlain, type Serialized } from "@/lib/serialize";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { BuyerModel } from "@/models/Buyer";
import { RetailCustomerModel } from "@/models/RetailCustomer";
import { actionResult, type ActionResult } from "@/lib/actionResult";

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

/** Escapes regex metacharacters so a typed "." or "*" is matched literally. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type SaleItemShape = {
  medicineId?: string;
  customName?: string;
  customPricePaisa?: number;
  boxes: number;
  patas: number;
};

/**
 * Per-item shape checks shared by both sale types: a medicine line or a
 * custom line, non-negative integer boxes/patas, no medicine listed twice.
 * Whether an all-zero line is allowed on its own is a cart-level rule (see
 * writeWholesaleSale and writeRetailSale's "at least one billable line"
 * guard), not a per-item one, so it is not checked here.
 */
function validateSaleItems(items: unknown): asserts items is SaleItemShape[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart khali");
  }

  const seen = new Set<string>();
  for (const item of items as SaleItemShape[]) {
    if (item.medicineId) {
      if (!mongoose.Types.ObjectId.isValid(item.medicineId)) {
        throw new Error("Medicine pawa jay ni");
      }
      if (seen.has(item.medicineId)) {
        throw new Error("Ekoi medicine dui bar add kora jabe na");
      }
      seen.add(item.medicineId);
    } else {
      if (typeof item.customName !== "string" || !item.customName.trim()) {
        throw new Error("Custom item er nam dite hobe");
      }
      if (typeof item.customPricePaisa !== "number" || item.customPricePaisa < 0) {
        throw new Error("Custom item er price thik nai");
      }
    }

    if (typeof item.boxes !== "number" || !Number.isInteger(item.boxes) || item.boxes < 0) {
      throw new Error("Box er poriman thik nai");
    }
    if (typeof item.patas !== "number" || !Number.isInteger(item.patas) || item.patas < 0) {
      throw new Error("Pata er poriman thik nai");
    }
  }
}

function validateDiscountShape(discount: unknown): asserts discount is DiscountInput {
  if (
    !discount ||
    typeof discount !== "object" ||
    ((discount as DiscountInput).kind !== "percent" &&
      (discount as DiscountInput).kind !== "amount")
  ) {
    throw new Error("Discount thik nai");
  }
}

function validatePaidPaisa(paidPaisa: unknown): asserts paidPaisa is number {
  if (
    typeof paidPaisa !== "number" ||
    !Number.isInteger(paidPaisa) ||
    paidPaisa < 0
  ) {
    throw new Error("paidPaisa must be a whole number");
  }
}

export type RetailSaleInput = {
  items: {
    medicineId?: string;
    customName?: string;
    customPricePaisa?: number;
    boxes: number;
    patas: number;
  }[];
  /** Required. A counter sale must say who it was to. */
  customerName: string;
  /** Optional — required only when the sale ends up with a due. */
  customerPhone?: string;
  discount: DiscountInput;
  paidPaisa: number;
};

export async function recordRetailSale(
  input: RetailSaleInput,
): Promise<ActionResult<Serialized<SaleDoc>>> {
  return actionResult(async () => {
    const adminSession = await requireAdminAction();
    await connectDb();

    if (typeof input.customerName !== "string" || !input.customerName.trim()) {
      throw new Error("Customer nam likhte hobe");
    }
    const customerPhone = toOptionalString(input.customerPhone, "customerPhone");
    validateSaleItems(input.items);
    validateDiscountShape(input.discount);
    validatePaidPaisa(input.paidPaisa);

    const session = await mongoose.startSession();
    let saleId: mongoose.Types.ObjectId | null = null;

    try {
      await session.withTransaction(async () => {
        const sale = await writeRetailSale({
          session,
          customerName: input.customerName.trim(),
          customerPhone,
          items: input.items,
          discount: input.discount,
          paidPaisa: input.paidPaisa,
          createdBy: adminSession.userId,
        });
        saleId = sale._id;
      });
    } finally {
      await session.endSession();
    }

    revalidatePath("/medicines");
    revalidatePath("/sell");
    revalidatePath("/retail-due");

    const sale = await SaleModel.findById(saleId).lean<SaleDoc>();
    return toPlain(sale!);
  });
}

export type WholesaleSaleInput = {
  buyerId: string;
  items: {
    medicineId?: string;
    customName?: string;
    customPricePaisa?: number;
    boxes: number;
    patas: number;
  }[];
  /** A percentage of the subtotal, 0-100. May be fractional. */
  discountPercent: number;
  paidPaisa: number;
};

/**
 * See validateSaleItems for the per-item shape checks shared with retail.
 */
function validateWholesale(input: WholesaleSaleInput): void {
  if (!mongoose.Types.ObjectId.isValid(input.buyerId)) {
    throw new Error("Buyer thik nai");
  }
  validateSaleItems(input.items);

  // computeTotals re-checks this against the actual subtotal; this catches
  // the malformed case before any database work happens. Fractional is
  // legal here — 2.5% is a real discount — so unlike the money fields there
  // is no integer check.
  if (
    typeof input.discountPercent !== "number" ||
    !Number.isFinite(input.discountPercent) ||
    input.discountPercent < 0 ||
    input.discountPercent > 100
  ) {
    throw new Error("Discount 0 theke 100 er moddhe hote hobe");
  }
  validatePaidPaisa(input.paidPaisa);
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
          if (!line.medicineId) continue;

          // A positive delta, so this can only fail here if the medicine
          // itself no longer exists — applyStockDelta's only precondition.
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
    revalidatePath("/retail-due");
  });
}

/**
 * Matches for the retail counter's phone-number autocomplete, replacing the
 * old single-match lookupRetailCustomer now that RetailCustomer persists a
 * durable per-phone record instead of re-deriving the latest name from Sale
 * history on every call. Returns at most 8 matches, most recently updated
 * first. A query shorter than 2 digits returns nothing, so a stray keystroke
 * doesn't fire a broad, useless match.
 */
export async function searchRetailCustomers(
  query: string,
): Promise<{ name: string; phone: string }[]> {
  await requireAdminAction();
  if (typeof query !== "string") throw new Error("query must be a string");

  const term = query.trim();
  if (term.length < 2) return [];

  await connectDb();

  const customers = await RetailCustomerModel.find({
    phone: { $regex: `^${escapeRegex(term)}` },
  })
    .sort({ updatedAt: -1 })
    .limit(8)
    .select("name phone")
    .lean<{ name: string; phone: string }[]>();

  return customers.map((c) => ({ name: c.name, phone: c.phone }));
}
