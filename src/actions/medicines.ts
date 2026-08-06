"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { toPlain, toPlainList, type Serialized } from "@/lib/serialize";
import { MedicineModel, type MedicineDoc } from "@/models/Medicine";
import { assertMedicineIsDeletable } from "@/lib/medicineReferences";
import { searchTokensFor, tokenPrefixFilter } from "@/lib/searchTokens";
import {
  MEDICINE_PAGE_SIZE,
  MAX_MEDICINE_SEARCH_RESULTS,
  normalizePage,
  pageCount,
  skipFor,
} from "@/lib/pagination";
import { actionResult, type ActionResult } from "@/lib/actionResult";
import {
  isMedicineForm,
  toMedicineForm,
  type MedicineForm,
} from "@/lib/unitLabels";
import { parseOptionalDate } from "@/lib/dhakaDate";

export type MedicineInput = {
  name: string;
  genericName: string;
  company: string;
  // Which unit words this medicine is shown with. Omitted means "tablet",
  // which is what every medicine created before this field existed is.
  form?: MedicineForm;
  patasPerBox: number;
  // Optional; omitted or 0 means "not entered yet" — no historical cost
  // data exists for medicines created before this field existed.
  purchasePricePaisa?: number;
  wholesaleBoxPricePaisa: number;
  wholesalePataPricePaisa: number;
  retailBoxPricePaisa: number;
  retailPataPricePaisa: number;
  // Optional list price (MRP) per box for the struck-through display; omitted
  // or 0 means no MRP. When present it must sit at or above
  // wholesaleBoxPricePaisa.
  mrpBoxPricePaisa?: number;
  lowStockThreshold: number;
  expiryDate?: string | Date | null;
};

/**
 * Rejects anything that isn't a finite, non-negative integer: fractional
 * values, NaN, Infinity, and non-number types all fail `Number.isInteger`
 * and are rejected here. Money is integer paisa and stock is integer
 * patas — never floats — so this is the one gate all such fields pass
 * through.
 */
function validateNonNegativeInteger(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be a whole number`);
  }
  if (value < 0) {
    throw new Error(`${label} cannot be negative`);
  }
}

/**
 * genericName and company are optional everywhere else in the system: the
 * Medicine schema defaults both to `""` (src/models/Medicine.ts). A payload
 * that omits them or sends `null` is treated the same way here — coerced to
 * `""` — so server actions behave consistently with direct model writes.
 * Any other type (number, object, etc.) is rejected rather than silently
 * stringified, since this is a network-reachable trust boundary.
 */
function toOptionalString(value: unknown, label: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function validate(input: MedicineInput): void {
  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new Error("Medicine name is required");
  }
  // Validated for its side effect (throwing on a non-string genericName /
  // company); toFields() re-derives the actual field values below.
  toOptionalString(input.genericName, "genericName");
  toOptionalString(input.company, "company");
  parseOptionalDate(input.expiryDate, "expiryDate");

  // Undefined is the "not specified" case and defaults to tablet in
  // toFields(); anything else present must be a form we actually know.
  if (input.form !== undefined && !isMedicineForm(input.form)) {
    throw new Error("Medicine form thik nai");
  }

  if (
    typeof input.patasPerBox !== "number" ||
    !Number.isInteger(input.patasPerBox) ||
    input.patasPerBox < 1
  ) {
    throw new Error("patasPerBox must be at least 1");
  }
  validateNonNegativeInteger(input.wholesaleBoxPricePaisa, "wholesaleBoxPricePaisa");
  validateNonNegativeInteger(input.wholesalePataPricePaisa, "wholesalePataPricePaisa");
  validateNonNegativeInteger(input.retailBoxPricePaisa, "retailBoxPricePaisa");
  validateNonNegativeInteger(input.retailPataPricePaisa, "retailPataPricePaisa");
  const purchasePricePaisa = input.purchasePricePaisa ?? 0;
  validateNonNegativeInteger(purchasePricePaisa, "purchasePricePaisa");
  const mrp = input.mrpBoxPricePaisa ?? 0;
  validateNonNegativeInteger(mrp, "mrpBoxPricePaisa");
  validateNonNegativeInteger(input.lowStockThreshold, "lowStockThreshold");

  // MRP is the struck-through "was" price, so it must sit above the selling
  // wholesale box price — an MRP below it would show a negative discount. 0
  // is the "no MRP" sentinel and is always allowed.
  if (mrp > 0 && mrp < input.wholesaleBoxPricePaisa) {
    throw new Error("MRP pack rate er cheye kom hote parbe na");
  }
}

function toFields(input: MedicineInput) {
  const name = input.name.trim();
  return {
    name,
    nameLower: name.toLowerCase(),
    genericName: toOptionalString(input.genericName, "genericName").trim(),
    company: toOptionalString(input.company, "company").trim(),
    // Rebuilt on every write, exactly like nameLower above: a rename that
    // left the old words in the index would make a medicine findable by a
    // name it no longer has.
    searchTokens: searchTokensFor(
      name,
      toOptionalString(input.genericName, "genericName"),
      toOptionalString(input.company, "company"),
    ),
    form: toMedicineForm(input.form),
    patasPerBox: input.patasPerBox,
    purchasePricePaisa: input.purchasePricePaisa ?? 0,
    wholesaleBoxPricePaisa: input.wholesaleBoxPricePaisa,
    wholesalePataPricePaisa: input.wholesalePataPricePaisa,
    retailBoxPricePaisa: input.retailBoxPricePaisa,
    retailPataPricePaisa: input.retailPataPricePaisa,
    mrpBoxPricePaisa: input.mrpBoxPricePaisa ?? 0,
    lowStockThreshold: input.lowStockThreshold,
    expiryDate: parseOptionalDate(input.expiryDate, "expiryDate"),
  };
}

export async function createMedicine(
  input: MedicineInput,
): Promise<ActionResult<Serialized<MedicineDoc>>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();
    validate(input);

    try {
      const medicine = await MedicineModel.create(toFields(input));
      revalidatePath("/medicines");
      return toPlain(medicine.toObject() as MedicineDoc);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new Error(`Medicine "${input.name.trim()}" already exists`);
      }
      throw error;
    }
  });
}

export async function updateMedicine(
  id: string,
  input: MedicineInput,
): Promise<ActionResult<Serialized<MedicineDoc>>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();
    validate(input);

    // A malformed id would otherwise reach the driver and surface a raw
    // Mongoose CastError instead of a clean "not found".
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Medicine not found");
    }

    try {
      // stockPatas is deliberately absent from the update: stock only ever
      // changes through stock-in and sales, never through the medicine form.
      const medicine = await MedicineModel.findByIdAndUpdate(
        id,
        { $set: toFields(input) },
        { returnDocument: "after", runValidators: true },
      ).lean<MedicineDoc>();

      if (!medicine) throw new Error("Medicine not found");
      revalidatePath("/medicines");
      return toPlain(medicine);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new Error(`Medicine "${input.name.trim()}" already exists`);
      }
      throw error;
    }
  });
}

/**
 * The search behind the sale screen's medicine picker.
 *
 * `activeOnly` defaults to false because the medicines admin table has to
 * list deactivated rows — that table is the only place they can be switched
 * back on, so filtering them out by default would strand them. Callers that
 * are choosing something to *sell* (the sale pickers) pass true: a
 * deactivated medicine must never reach a cart.
 *
 * Capped at `limit`, and that cap is the point: the picker opens with an
 * empty query, which means "no filter", which used to mean the entire
 * catalogue — every document, in full — was assembled and shipped to the
 * browser every time the owner opened the picker to add one line to a sale.
 * A picker is something you type into, so showing the first 100 matches and
 * letting the query narrow them is what it was already asking people to do;
 * the whole list was never a thing anyone scrolled to the end of. The admin
 * table, which genuinely does page through everything, uses
 * listMedicinesPage below instead.
 */
export async function listMedicines(
  query?: string,
  activeOnly = false,
  limit = 100,
): Promise<Serialized<MedicineDoc>[]> {
  await requireAdminAction();
  await connectDb();

  // query is optional, so undefined/null are treated as "no filter" — the
  // same leniency toOptionalString gives genericName/company above. Any
  // other non-string type (number, object, array, ...) is a malformed
  // payload on this network-reachable trust boundary and is rejected
  // rather than allowed to reach .trim() as a raw TypeError.
  const term = toOptionalString(query, "query").trim();
  if (typeof activeOnly !== "boolean") {
    throw new Error("activeOnly must be a boolean");
  }
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a whole number");
  }

  const filter: Record<string, unknown> = {};
  const match = tokenPrefixFilter(term);
  if (match) Object.assign(filter, match);
  if (activeOnly) {
    filter.active = true;
  }

  const docs = await MedicineModel.find(filter)
    .sort({ createdAt: -1 })
    // Math.min, not the raw value: `limit` arrives over the network on a
    // directly-callable endpoint, so an unclamped one is the same unbounded
    // read this cap exists to close.
    .limit(Math.min(limit, MAX_MEDICINE_SEARCH_RESULTS))
    .lean<MedicineDoc[]>();
  return toPlainList(docs);
}

export type MedicineListTab = "all" | "low-stock" | "active" | "inactive";

export type MedicineListInput = {
  query?: string;
  tab?: MedicineListTab;
  /** A MEDICINE_FORMS value, or "all". */
  form?: string;
  page?: number;
};

export type MedicineListPage = {
  rows: Serialized<MedicineDoc>[];
  /** Rows matching the current query/tab/form, across every page. */
  total: number;
  page: number;
  pageSize: number;
  /**
   * Tab badge counts. Deliberately unaffected by the search box and the form
   * filter — they answer "how many medicines are low on stock", which is a
   * fact about the shop, not about what is currently typed. That is also what
   * they showed before paging existed, when they were counted client-side
   * over the whole catalogue.
   */
  counts: { all: number; lowStock: number; active: number; inactive: number };
};

/**
 * "Low stock" as the medicines table has always defined it: nothing left at
 * all, or at/below an alert level the owner actually set. Kept as a filter
 * fragment so the tab, its badge count, and the page query cannot drift into
 * three slightly different ideas of low.
 *
 * Note this is *not* dashboardSummary's definition, which requires a
 * threshold to have been set and so ignores an out-of-stock medicine with no
 * alert configured. That difference predates paging; it is preserved rather
 * than quietly unified, because changing what the owner's dashboard counts
 * is a decision for them, not a side effect of this.
 */
const LOW_STOCK_FILTER = {
  $or: [
    { stockPatas: { $lte: 0 } },
    {
      $and: [
        { lowStockThreshold: { $gt: 0 } },
        { $expr: { $lte: ["$stockPatas", "$lowStockThreshold"] } },
      ],
    },
  ],
};

/**
 * One page of the medicines admin table.
 *
 * Replaces reading the whole collection into the page and filtering it in the
 * browser. That worked while the catalogue was small and degraded without any
 * error as it grew — every visit re-sent every medicine document in full.
 *
 * The tab and form filters moved to the server along with the paging, because
 * they had to: filtering one page of 50 in the browser would have shown "the
 * low-stock medicines that happen to be on this page", which looks exactly
 * like a complete answer and is not one.
 */
export async function listMedicinesPage(
  input: MedicineListInput = {},
): Promise<MedicineListPage> {
  await requireAdminAction();
  await connectDb();

  const term = toOptionalString(input.query, "query").trim();
  const tab = input.tab ?? "all";
  if (!["all", "low-stock", "active", "inactive"].includes(tab)) {
    throw new Error("tab thik nai");
  }
  const form = toOptionalString(input.form, "form").trim();
  const page = normalizePage(input.page);

  const filter: Record<string, unknown> = {};
  const match = tokenPrefixFilter(term);
  if (match) Object.assign(filter, match);
  if (form && form !== "all") {
    filter.form = form;
  }
  if (tab === "active") filter.active = true;
  else if (tab === "inactive") filter.active = false;
  else if (tab === "low-stock") Object.assign(filter, LOW_STOCK_FILTER);

  const [total, all, lowStock, active] = await Promise.all([
    MedicineModel.countDocuments(filter),
    MedicineModel.countDocuments({}),
    MedicineModel.countDocuments(LOW_STOCK_FILTER),
    MedicineModel.countDocuments({ active: true }),
  ]);

  const docs = await MedicineModel.find(filter)
    .sort({ createdAt: -1 })
    .skip(skipFor(page, MEDICINE_PAGE_SIZE, total))
    .limit(MEDICINE_PAGE_SIZE)
    .lean<MedicineDoc[]>();

  return {
    rows: toPlainList(docs),
    total,
    page: Math.min(page, pageCount(total, MEDICINE_PAGE_SIZE)),
    pageSize: MEDICINE_PAGE_SIZE,
    // Derived rather than counted separately: one fewer round trip, and the
    // two can never disagree about how many medicines exist.
    counts: { all, lowStock, active, inactive: all - active },
  };
}

export async function searchMedicines(
  query: string,
  limit = 10,
): Promise<Serialized<MedicineDoc>[]> {
  await requireAdminAction();
  await connectDb();
  // query is required here (same convention as the `name` check in
  // validate() above), so unlike listMedicines, undefined/null are
  // rejected rather than defaulted — this is the type-ahead's every-
  // keystroke entry point and must never let a malformed payload reach
  // .trim() as a raw TypeError.
  if (typeof query !== "string") {
    throw new Error("query must be a string");
  }
  const term = query.trim();
  if (!term) return [];

  const match = tokenPrefixFilter(term);
  if (!match) return [];

  const docs = await MedicineModel.find({ active: true, ...match })
    .sort({ name: 1 })
    .limit(limit)
    .lean<MedicineDoc[]>();
  return toPlainList(docs);
}

export async function toggleMedicineActive(
  id: string,
  targetActive: boolean,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();
    // A malformed id would otherwise reach the driver and surface a raw
    // Mongoose CastError instead of a clean "not found".
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Medicine not found");
    }
    // Deactivated, not deleted: past sales reference this medicine.
    await MedicineModel.findByIdAndUpdate(id, { $set: { active: targetActive } });
    revalidatePath("/medicines");
  });
}

/**
 * Deletes a medicine that nothing refers to yet — a mistyped entry, a
 * duplicate — and refuses when anything does.
 *
 * The refusal is the point, and the reasoning about which references block a
 * delete lives with the check itself in src/lib/medicineReferences.ts. The
 * check and the delete share one transaction so the former cannot go stale
 * before the latter: without that, a sale rung up in the window between them
 * would produce exactly the frozen, uncancellable sale this guards against.
 */
export async function deleteMedicine(
  id: string,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Medicine not found");
    }
    const medicineId = new mongoose.Types.ObjectId(id);

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await assertMedicineIsDeletable(medicineId, session);

        const deleted = await MedicineModel.findByIdAndDelete(medicineId, {
          session,
        });
        if (!deleted) throw new Error("Medicine not found");
      });
    } finally {
      await session.endSession();
    }

    revalidatePath("/medicines");
  });
}
