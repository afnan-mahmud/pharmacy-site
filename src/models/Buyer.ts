import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const buyerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    shopName: { type: String, default: "", trim: true },
    // Phone is the natural unique key: these are ~10 regulars the owner
    // knows personally, and two of them will never share a number.
    phone: { type: String, required: true, unique: true, trim: true },
    address: { type: String, default: "", trim: true },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

buyerSchema.index({ name: 1 });

export type BuyerDoc = InferSchemaType<typeof buyerSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** BuyerDoc minus the password hash — what leaves the server. */
export type PublicBuyerDoc = Omit<BuyerDoc, "passwordHash">;

export const BuyerModel: Model<BuyerDoc> =
  (mongoose.models.Buyer as Model<BuyerDoc>) ??
  mongoose.model<BuyerDoc>("Buyer", buyerSchema);
