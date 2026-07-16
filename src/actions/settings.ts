"use server";

import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { SettingsModel, type SettingsDoc } from "@/models/Settings";

export type SettingsInput = {
  pharmacyName: string;
  address: string;
  phone: string;
  invoicePrefix: string;
};

export async function getSettings(): Promise<SettingsDoc> {
  await connectDb();
  const settings = await SettingsModel.findOneAndUpdate(
    { key: "singleton" },
    { $setOnInsert: { key: "singleton" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean<SettingsDoc>();
  return settings!;
}

export async function updateSettings(input: SettingsInput): Promise<SettingsDoc> {
  await connectDb();

  const pharmacyName = input.pharmacyName.trim();
  const invoicePrefix = input.invoicePrefix.trim();

  if (!pharmacyName) throw new Error("Pharmacy name is required");
  if (!invoicePrefix) throw new Error("Invoice prefix is required");

  const settings = await SettingsModel.findOneAndUpdate(
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
  ).lean<SettingsDoc>();

  revalidatePath("/", "layout");
  return settings!;
}
