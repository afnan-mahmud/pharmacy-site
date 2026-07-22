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
    // Snapshotted for the same reason patasAdded is: this row must keep
    // reading the way it did the day it was written, even if the medicine's
    // form is corrected later. No enum — a snapshot must not fail validation
    // over a value the medicine model no longer offers, and unitLabelsFor
    // renders anything unrecognised as tablet wording. See
    // src/lib/unitLabels.ts.
    form: { type: String, default: "tablet" },
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
