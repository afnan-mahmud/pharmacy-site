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
