import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export type OrderStatus = "pending" | "approved" | "rejected" | "cancelled";

const orderLineSchema = new Schema(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: "Medicine", required: true },
    // Denormalised so the order still reads correctly if the medicine is
    // later renamed or deactivated.
    medicineName: { type: String, required: true },
    boxes: { type: Number, required: true, min: 1 },
    // Snapshotted at order time: a price change before approval must never
    // silently rewrite what the buyer thought he was ordering.
    boxPricePaisa: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: "Buyer",
      required: true,
      // No single-field index here: the { buyerId: 1, createdAt: -1 } compound
      // index below already serves buyerId-only queries via its leftmost
      // prefix, so a separate one would only add write overhead.
    },
    // Denormalised so the owner's pending-order list reads without a join.
    buyerName: { type: String, required: true },
    buyerShopName: { type: String, default: "" },
    items: {
      type: [orderLineSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "Order e at least ekta item lagbe",
      },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      required: true,
      default: "pending",
    },
    // Set only when approved — links to the wholesale sale it became.
    saleId: { type: Schema.Types.ObjectId, ref: "Sale", default: null },
    rejectReason: { type: String, default: "" },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The owner's pending list is "oldest pending first"; a buyer's list is
// "my orders, newest first". Both are covered here.
orderSchema.index({ status: 1, createdAt: 1 });
orderSchema.index({ buyerId: 1, createdAt: -1 });

export type OrderLineDoc = InferSchemaType<typeof orderLineSchema>;
export type OrderDoc = InferSchemaType<typeof orderSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const OrderModel: Model<OrderDoc> =
  (mongoose.models.Order as Model<OrderDoc>) ??
  mongoose.model<OrderDoc>("Order", orderSchema);
