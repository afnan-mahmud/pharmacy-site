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
// Covers listBuyerDues' per-buyer payment totals: with buyerId and
// amountPaisa both in the index, that $match + $group is answered from index
// keys alone and never fetches a payment document. The ledger index above
// cannot do that — it carries createdAt, not the amount being summed, so the
// same pipeline would have to fetch every matched document to read it.
paymentSchema.index({ buyerId: 1, amountPaisa: 1 });

export type PaymentDoc = InferSchemaType<typeof paymentSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const PaymentModel: Model<PaymentDoc> =
  (mongoose.models.Payment as Model<PaymentDoc>) ??
  mongoose.model<PaymentDoc>("Payment", paymentSchema);
