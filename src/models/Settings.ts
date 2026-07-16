import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const settingsSchema = new Schema(
  {
    // Fixed key guarantees exactly one settings document.
    key: { type: String, required: true, unique: true, default: "singleton" },
    pharmacyName: { type: String, required: true, default: "ABC Pharmacy" },
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
