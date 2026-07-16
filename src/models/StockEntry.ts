import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const stockEntrySchema = new Schema(
  {
    medicineId: {
      type: Schema.Types.ObjectId,
      ref: "Medicine",
      required: true,
      index: true,
    },
    medicineName: { type: String, required: true },
    boxes: { type: Number, required: true, min: 1 },
    // Snapshotted at entry time. If patasPerBox later changes on the medicine,
    // this record still says how many patas actually entered stock that day.
    patasAdded: { type: Number, required: true, min: 1 },
    note: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
  },
  { timestamps: true },
);

export type StockEntryDoc = InferSchemaType<typeof stockEntrySchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const StockEntryModel: Model<StockEntryDoc> =
  (mongoose.models.StockEntry as Model<StockEntryDoc>) ??
  mongoose.model<StockEntryDoc>("StockEntry", stockEntrySchema);
