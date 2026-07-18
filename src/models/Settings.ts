import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const settingsSchema = new Schema(
  {
    // Fixed key guarantees exactly one settings document.
    key: { type: String, required: true, unique: true, default: "singleton" },
    pharmacyName: { type: String, required: true, default: "ABC Pharmacy" },
    // A short line shown under the pharmacy name in the header, e.g.
    // "Medicine & Surgical". Purely identity/branding; the owner edits it.
    tagline: { type: String, default: "Medicine & Surgical" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    invoicePrefix: { type: String, required: true, default: "ABC" },
  },
  { timestamps: true },
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;

export const SettingsModel: Model<SettingsDoc> =
  (mongoose.models.Settings as Model<SettingsDoc>) ??
  mongoose.model<SettingsDoc>("Settings", settingsSchema);
