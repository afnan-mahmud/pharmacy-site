import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const medicineSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lowercased copy of `name`, used only to enforce case-insensitive
    // uniqueness. Kept in sync by the actions, never edited directly.
    nameLower: { type: String, required: true, unique: true },
    genericName: { type: String, default: "", trim: true },
    company: { type: String, default: "", trim: true },
    patasPerBox: { type: Number, required: true, min: 1 },
    boxPricePaisa: { type: Number, required: true, min: 0 },
    pataPricePaisa: { type: Number, required: true, min: 0 },
    // Canonical stock. Always patas, never boxes. See src/lib/units.ts.
    stockPatas: { type: Number, required: true, default: 0, min: 0 },
    lowStockThreshold: { type: Number, required: true, default: 0, min: 0 },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

medicineSchema.index({ name: 1 });
medicineSchema.index({ genericName: 1 });

export type MedicineDoc = InferSchemaType<typeof medicineSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MedicineModel: Model<MedicineDoc> =
  (mongoose.models.Medicine as Model<MedicineDoc>) ??
  mongoose.model<MedicineDoc>("Medicine", medicineSchema);
