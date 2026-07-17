import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const paymentSchema = new Schema(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "Buyer", required: true },
    amountPaisa: { type: Number, required: true, min: 1 },
    note: { type: String, default: "", trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
  },
  { timestamps: true },
);

paymentSchema.index({ buyerId: 1, createdAt: -1 });

export type PaymentDoc = InferSchemaType<typeof paymentSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const PaymentModel: Model<PaymentDoc> =
  (mongoose.models.Payment as Model<PaymentDoc>) ??
  mongoose.model<PaymentDoc>("Payment", paymentSchema);
