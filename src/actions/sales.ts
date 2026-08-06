"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { applyStockDelta } from "@/lib/stockTransaction";
import { writeWholesaleSale } from "@/lib/writeWholesaleSale";
import { writeRetailSale } from "@/lib/writeRetailSale";
import { computeTotals, type DiscountInput } from "@/lib/saleTotals";
import { buildSaleLines } from "@/lib/saleLines";
import { toPlain, type Serialized } from "@/lib/serialize";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { MedicineModel } from "@/models/Medicine";
import { BuyerModel } from "@/models/Buyer";
import { RetailCustomerModel } from "@/models/RetailCustomer";
import { PaymentModel } from "@/models/Payment";
import { RetailPaymentModel } from "@/models/RetailPayment";
import { actionResult, type ActionResult } from "@/lib/actionResult";
import { assertLineCount } from "@/lib/lineLimits";

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
  customCostPaisa?: number;
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
  assertLineCount(items.length);

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
      // Optional — a custom line with no costing recorded still sells, it
      // just reports as all profit the way it always did.
      if (item.customCostPaisa !== undefined) {
        if (typeof item.customCostPaisa !== "number" || item.customCostPaisa < 0) {
          throw new Error("Custom item er costing thik nai");
        }
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
    customCostPaisa?: number;
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
    // A retail sale with a phone upserts a RetailCustomer (see
    // writeRetailSale), so the khuchra-buyer list can gain a row here.
    revalidatePath("/retail-customers");

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
    customCostPaisa?: number;
    boxes: number;
    patas: number;
  }[];
  /** Optional structured discount (percent or amount). */
  discount?: DiscountInput;
  /** A percentage of the subtotal, 0-100. May be fractional (kept for backward compatibility). */
  discountPercent?: number;
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

  if (input.discount) {
    validateDiscountShape(input.discount);
  } else if (typeof input.discountPercent === "number") {
    if (
      !Number.isFinite(input.discountPercent) ||
      input.discountPercent < 0 ||
      input.discountPercent > 100
    ) {
      throw new Error("Discount 0 theke 100 er moddhe hote hobe");
    }
  } else {
    throw new Error("Discount thik nai");
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

    const discountInput: DiscountInput =
      input.discount ?? {
        kind: "percent",
        percent: input.discountPercent ?? 0,
      };

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
          discount: discountInput,
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
 *
 * Money already handed over is returned as credit, not erased — see the
 * comment on the compensating payment below.
 */
export async function cancelSale(
  id: string,
  reason: string,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
    const adminSession = await requireAdminAction();
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

        // The goods came back; the money that paid for them did not.
        //
        // A balance is "active sales' duePaisa minus payments" (see
        // src/lib/dueComputation.ts). Cancelling drops this sale out of the
        // first half of that sum — and `paidPaisa` lives *on the sale*, not
        // as a Payment document, so cash taken at the counter left the books
        // along with it. A fully-paid sale that was cancelled read as "Baki
        // nei" while the pharmacy was still holding the customer's money.
        //
        // Recording the compensating credit as an ordinary payment is what
        // the balance model already expects rather than a special case bolted
        // onto it: a payment deliberately carries no saleId so that it
        // survives the sale it was made against, and both due lists key off
        // "has ever paid" as well as "has an active sale" (see listBuyerDues'
        // comment on why that clause is load-bearing) — so a customer whose
        // only sale was cancelled still appears, now holding the credit.
        //
        // Using `paidPaisa` is right for a partial payment too: the unpaid
        // half leaves with the sale's own duePaisa, and what is left is
        // exactly what the customer is owed back.
        if (sale.paidPaisa > 0) {
          const note = sale.invoiceNo
            ? `Bikri ${sale.invoiceNo} batil`
            : "Batil kora bikri";

          if (sale.type === "wholesale" && sale.buyerId) {
            await PaymentModel.create(
              [
                {
                  buyerId: sale.buyerId,
                  amountPaisa: sale.paidPaisa,
                  note,
                  createdBy: new mongoose.Types.ObjectId(adminSession.userId),
                },
              ],
              { session },
            );
          } else if (sale.type === "retail" && sale.buyerPhone) {
            await RetailPaymentModel.create(
              [
                {
                  phone: sale.buyerPhone,
                  amountPaisa: sale.paidPaisa,
                  note,
                  createdBy: new mongoose.Types.ObjectId(adminSession.userId),
                },
              ],
              { session },
            );
          }
          // A counter sale with no phone is the one case with nothing to
          // credit, and that is correct rather than a gap: there is no
          // customer record, no ledger, and no balance keyed to an anonymous
          // walk-in — the refund is cash across the counter. Such a sale also
          // cannot carry a due (writeRetailSale refuses a due without a
          // phone), so no balance is left wrong by skipping it.
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

export type UpdateSaleItemInput = {
  medicineId?: string;
  customName?: string;
  customPricePaisa?: number;
  customCostPaisa?: number;
  boxes: number;
  patas: number;
};

export type UpdateSaleInput = {
  saleId: string;
  items: UpdateSaleItemInput[];
  discount: DiscountInput;
  paidPaisa: number;
};

export async function currentPricesForSale(
  medicineIds: string[],
  type: "wholesale" | "retail" = "wholesale",
): Promise<Record<string, { boxPricePaisa: number; pataPricePaisa: number }>> {
  await requireAdminAction();
  await connectDb();

  if (!Array.isArray(medicineIds)) return {};
  const validIds = medicineIds.filter((id) =>
    mongoose.Types.ObjectId.isValid(id),
  );
  if (validIds.length === 0) return {};

  const medicines = await MedicineModel.find({
    _id: { $in: validIds },
    active: true,
  })
    .select("wholesaleBoxPricePaisa wholesalePataPricePaisa retailBoxPricePaisa retailPataPricePaisa")
    .lean<{
      _id: mongoose.Types.ObjectId;
      wholesaleBoxPricePaisa: number;
      wholesalePataPricePaisa: number;
      retailBoxPricePaisa: number;
      retailPataPricePaisa: number;
    }[]>();

  return Object.fromEntries(
    medicines.map((m) => [
      m._id.toString(),
      {
        boxPricePaisa:
          type === "wholesale"
            ? m.wholesaleBoxPricePaisa
            : m.retailBoxPricePaisa,
        pataPricePaisa:
          type === "wholesale"
            ? m.wholesalePataPricePaisa
            : m.retailPataPricePaisa,
      },
    ]),
  );
}


export async function updateSale(
  input: UpdateSaleInput,
): Promise<ActionResult<Serialized<SaleDoc>>> {
  return actionResult(async () => {
    const adminSession = await requireAdminAction();
    await connectDb();

    if (!mongoose.Types.ObjectId.isValid(input.saleId)) {
      throw new Error("Bikri pawa jay ni");
    }

    validateSaleItems(input.items);
    validateDiscountShape(input.discount);
    validatePaidPaisa(input.paidPaisa);

    const session = await mongoose.startSession();
    let updatedSaleId: mongoose.Types.ObjectId | null = null;

    try {
      await session.withTransaction(async () => {
        const sale = await SaleModel.findById(input.saleId).session(session);
        if (!sale) throw new Error("Bikri pawa jay ni");
        if (sale.status === "cancelled") {
          throw new Error("Batil kora bikri edit kora jabe na");
        }

        // 1. Return old stock for original items
        for (const oldLine of sale.items) {
          if (oldLine.medicineId && oldLine.patasDeducted > 0) {
            const ok = await applyStockDelta(
              oldLine.medicineId,
              oldLine.patasDeducted,
              session,
            );
            if (!ok) throw new Error("Medicine stock update korte somosya hoyeche");
          }
        }

        // 2. Build new lines & deduct new stock
        const priceMode = sale.type === "wholesale" ? "wholesale" : "retail";
        const newLines = await buildSaleLines(input.items, session, priceMode);

        // 3. Compute totals
        const { subtotalPaisa, discountPercent, discountPaisa, totalPaisa, duePaisa } =
          computeTotals(
            newLines.map((l) => ({ ratePaisa: l.lineTotalPaisa, quantity: 1 })),
            input.discount,
            input.paidPaisa,
          );

        // 4. Update the Sale document
        sale.items = newLines as any;
        sale.subtotalPaisa = subtotalPaisa;
        sale.discountPercent = discountPercent;
        sale.discountPaisa = discountPaisa;
        sale.totalPaisa = totalPaisa;
        sale.paidPaisa = input.paidPaisa;
        sale.duePaisa = duePaisa;

        await sale.save({ session });
        updatedSaleId = sale._id;
      });
    } finally {
      await session.endSession();
    }

    revalidatePath("/reports");
    revalidatePath("/medicines");
    revalidatePath(`/invoice/${input.saleId}`);
    revalidatePath("/orders");
    revalidatePath("/due");
    revalidatePath("/retail-due");
    revalidatePath("/dashboard");

    const updatedSale = await SaleModel.findById(updatedSaleId).lean<SaleDoc>();
    return toPlain(updatedSale!);
  });
}

