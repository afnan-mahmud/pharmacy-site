"use server";

import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { SettingsModel, type SettingsDoc } from "@/models/Settings";

export type SettingsInput = {
  pharmacyName: string;
  address: string;
  phone: string;
  invoicePrefix: string;
};

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
async function withDuplicateKeyRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return operation();
  }
}

export async function getSettings(): Promise<SettingsDoc> {
  await requireAdminAction();
  await connectDb();

  const settings = await withDuplicateKeyRetry(() =>
    SettingsModel.findOneAndUpdate(
      { key: "singleton" },
      { $setOnInsert: { key: "singleton" } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<SettingsDoc>(),
  );
  return settings!;
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
export async function readSettings(): Promise<SettingsDoc> {
  await connectDb();

  const settings = await SettingsModel.findOne({ key: "singleton" }).lean<SettingsDoc>();
  if (settings) return settings;

  return new SettingsModel({ key: "singleton" }).toObject() as SettingsDoc;
}

export async function updateSettings(input: SettingsInput): Promise<SettingsDoc> {
  await requireAdminAction();
  await connectDb();

  const pharmacyName = input.pharmacyName.trim();
  const invoicePrefix = input.invoicePrefix.trim();

  if (!pharmacyName) throw new Error("Pharmacy name is required");
  if (!invoicePrefix) throw new Error("Invoice prefix is required");

  const settings = await withDuplicateKeyRetry(() =>
    SettingsModel.findOneAndUpdate(
      { key: "singleton" },
      {
        $set: {
          pharmacyName,
          invoicePrefix,
          address: input.address.trim(),
          phone: input.phone.trim(),
        },
        $setOnInsert: { key: "singleton" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<SettingsDoc>(),
  );

  revalidatePath("/", "layout");
  return settings!;
}
