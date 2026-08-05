import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const retailPaymentSchema = new Schema(
  {
    // Phone rather than a buyerId FK — a retail customer has no managed
    // account to reference (see RetailCustomer).
    phone: { type: String, required: true, trim: true },
    amountPaisa: { type: Number, required: true, min: 1 },
    note: { type: String, default: "", trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
  },
  { timestamps: true },
);

retailPaymentSchema.index({ phone: 1, createdAt: -1 });
// The phone-keyed counterpart of Payment's { buyerId, amountPaisa } index —
// see that file for why the ledger index above cannot serve listRetailDues'
// $match + $group.
retailPaymentSchema.index({ phone: 1, amountPaisa: 1 });

export type RetailPaymentDoc = InferSchemaType<typeof retailPaymentSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const RetailPaymentModel: Model<RetailPaymentDoc> =
  (mongoose.models.RetailPayment as Model<RetailPaymentDoc>) ??
  mongoose.model<RetailPaymentDoc>("RetailPayment", retailPaymentSchema);
