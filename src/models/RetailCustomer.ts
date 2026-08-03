import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const retailCustomerSchema = new Schema(
  {
    // Natural unique key: one document per phone number, so the retail
    // counter's autocomplete and recordRetailPayment's write-conflict guard
    // (see recordRetailPayment in src/actions/due.ts) both have exactly one
    // document to read and bump — the same role Buyer plays for wholesale.
    phone: { type: String, required: true, unique: true, trim: true },
    // The name last used at the counter for this phone. "One phone, one
    // remembered name" — same rule the retail-customer lookup this replaces
    // already established, just persisted instead of re-derived from Sale
    // history on every call.
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

// The admin khuchra-buyer list reads every customer sorted by name.
retailCustomerSchema.index({ name: 1 });

export type RetailCustomerDoc = InferSchemaType<typeof retailCustomerSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RetailCustomerModel: Model<RetailCustomerDoc> =
  (mongoose.models.RetailCustomer as Model<RetailCustomerDoc>) ??
  mongoose.model<RetailCustomerDoc>("RetailCustomer", retailCustomerSchema);
