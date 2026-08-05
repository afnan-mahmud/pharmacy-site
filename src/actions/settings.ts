"use server";

import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { toPlain, type Serialized } from "@/lib/serialize";
import { SettingsModel, type SettingsDoc } from "@/models/Settings";
import { actionResult, type ActionResult } from "@/lib/actionResult";

export type SettingsInput = {
  pharmacyName: string;
  // Optional; omitted behaves like the schema default. See Settings.tagline.
  tagline?: string;
  address: string;
  phone: string;
  invoicePrefix: string;
  aboutUs?: string;
};

/**
 * genericName/company in src/actions/medicines.ts coerce a missing/null
 * optional string field to "" rather than reject it, since the schema
 * itself defaults address/phone to "" (src/models/Settings.ts) — a payload
 * that omits them should behave the same as a direct model write. Any other
 * type is rejected rather than silently stringified: this is a
 * network-reachable trust boundary, same convention as medicines.ts.
 */
function toOptionalString(value: unknown, label: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

// Invoice numbers are rendered as `${invoicePrefix}-000041` (thermal
// invoice, Sale plan). Before this, invoicePrefix had no charset or length
// constraint at all, so it could be saved empty-after-trim-of-whitespace-only
// (already rejected below), absurdly long, or containing characters (spaces,
// dashes, Bengali script, punctuation) that would make the resulting invoice
// number ambiguous to read off a receipt or to parse back apart later.
// Constrained to 2-8 ASCII letters/digits: long enough to be a recognisable
// abbreviation, short enough to stay readable on a narrow thermal strip, and
// restricted to a charset with no ambiguity around the "-" that separates it
// from the sequence number. Normalized to uppercase on save (matching the
// "ABC" schema default) rather than rejecting lowercase input outright — a
// case difference isn't a meaningfully invalid input, just one worth
// normalizing.
const INVOICE_PREFIX_PATTERN = /^[A-Z0-9]{2,8}$/;

function validateInvoicePrefix(raw: string): string {
  const prefix = raw.toUpperCase();
  if (!INVOICE_PREFIX_PATTERN.test(prefix)) {
    throw new Error(
      "Invoice prefix 2-8 character hote hobe, khali A-Z ar 0-9 (space/dash chalbe na)",
    );
  }
  return prefix;
}

const DUPLICATE_KEY_ERROR_CODE = 11000;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_ERROR_CODE
  );
}

// Two callers can both race a cold-start read/write past the "does the
// singleton exist?" check and both attempt to upsert-insert it. The unique
// index on `key` guarantees only one insert wins; MongoDB surfaces the
// loser's attempt as an E11000 duplicate-key error instead of silently
// merging it. Retrying the identical operation is sufficient to recover:
// by the time it runs again, the winner's document already exists, so the
// same query now matches an existing document instead of trying (and
// failing) to insert a second one.
async function withDuplicateKeyRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return operation();
  }
}

export async function getSettings(): Promise<Serialized<SettingsDoc>> {
  await requireAdminAction();
  await connectDb();

  const settings = await withDuplicateKeyRetry(() =>
    SettingsModel.findOneAndUpdate(
      { key: "singleton" },
      { $setOnInsert: { key: "singleton" } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean<SettingsDoc>(),
  );
  return toPlain(settings!);
}

/**
 * Unguarded, upsert-free read of the pharmacy's identity fields.
 *
 * Settings is the source of truth every screen reads the pharmacy name
 * from — the spec is explicit that this includes screens with no admin
 * session, and the not-yet-built Buyer portal's shell is exactly that kind
 * of screen. getSettings() cannot serve that need: it's gated behind
 * requireAdminAction() (correctly — it's also a write, via its upsert), so
 * reusing it for a buyer-facing screen would mean either weakening that
 * guard or writing another admin-only reader by hand. This is that other
 * reader, done once, with no guard and no write.
 *
 * scripts/seed.ts already creates the singleton document before the app is
 * ever used for real, so in practice this always finds it. If it is
 * somehow still absent (a fresh dev database nobody has seeded yet, or a
 * test that reads before an admin has saved anything), this falls back to
 * the schema's own defaults — read off an unsaved model instance rather
 * than re-typed here, so "ABC Pharmacy" continues to exist in exactly one
 * place (src/models/Settings.ts). Throwing instead would be the wrong
 * failure mode for a read with no write permission attached: it would mean
 * a screen that only *displays* the pharmacy's name — which the buyer
 * portal shell is specified to do — crashes before an admin has ever
 * opened Settings, purely because this function has no way to create the
 * document itself. Returning sane defaults keeps that screen renderable;
 * updateSettings() (still admin-only) is the only path that persists real
 * values.
 */
export async function readSettings(): Promise<Serialized<SettingsDoc>> {
  await connectDb();

  const settings = await SettingsModel.findOne({
    key: "singleton",
  }).lean<SettingsDoc>();
  if (settings) return toPlain(settings);

  return toPlain(new SettingsModel({ key: "singleton" }).toObject() as SettingsDoc);
}

/**
 * This action is a network-reachable trust boundary (same convention as
 * src/actions/medicines.ts): every field is validated here before it
 * touches Mongoose/Mongo, so a malformed payload (e.g. a non-string
 * pharmacyName, or an omitted address) fails with a clean domain error
 * instead of a raw TypeError from calling .trim() on the wrong type.
 */
function validate(input: SettingsInput): {
  pharmacyName: string;
  tagline: string;
  address: string;
  phone: string;
  invoicePrefix: string;
  aboutUs: string;
} {
  if (typeof input.pharmacyName !== "string" || !input.pharmacyName.trim()) {
    throw new Error("Pharmacy name is required");
  }
  const pharmacyName = input.pharmacyName.trim();

  const tagline = toOptionalString(input.tagline, "tagline").trim();
  const address = toOptionalString(input.address, "address").trim();
  const phone = toOptionalString(input.phone, "phone").trim();
  const aboutUs = toOptionalString(input.aboutUs, "aboutUs").trim();

  if (typeof input.invoicePrefix !== "string" || !input.invoicePrefix.trim()) {
    throw new Error("Invoice prefix is required");
  }
  const invoicePrefix = validateInvoicePrefix(input.invoicePrefix.trim());

  return { pharmacyName, tagline, address, phone, invoicePrefix, aboutUs };
}

export async function updateSettings(
  input: SettingsInput,
): Promise<ActionResult<Serialized<SettingsDoc>>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();

    const { pharmacyName, tagline, address, phone, invoicePrefix, aboutUs } =
      validate(input);

    const settings = await withDuplicateKeyRetry(() =>
      SettingsModel.findOneAndUpdate(
        { key: "singleton" },
        {
          $set: { pharmacyName, tagline, invoicePrefix, address, phone, aboutUs },
          $setOnInsert: { key: "singleton" },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      ).lean<SettingsDoc>(),
    );

    revalidatePath("/", "layout");
    return toPlain(settings!);
  });
}
