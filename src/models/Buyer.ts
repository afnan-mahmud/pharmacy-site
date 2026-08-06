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
    // Bumped whenever every existing login for this buyer must stop working:
    // the account being switched off, or its password being reset. Sessions
    // are stateless JWTs with a 7-day life, so without a number the server
    // can compare against, nothing the owner does can take one back. The
    // issued token carries the value it was signed with; requireBuyer /
    // requireBuyerAction reject it once this moves past it.
    sessionVersion: { type: Number, required: true, default: 0 },
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
