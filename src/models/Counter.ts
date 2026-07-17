import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const counterSchema = new Schema({
  // Fixed key per counter kind; today only "invoice" exists.
  key: { type: String, required: true, unique: true },
  seq: { type: Number, required: true, default: 0 },
});

export type CounterDoc = InferSchemaType<typeof counterSchema>;

export const CounterModel: Model<CounterDoc> =
  (mongoose.models.Counter as Model<CounterDoc>) ??
  mongoose.model<CounterDoc>("Counter", counterSchema);
