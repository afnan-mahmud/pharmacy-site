import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const saleLineSchema = new Schema(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: "Medicine", required: true },
    // Denormalised so an invoice still reads correctly if the medicine is
    // later renamed or deactivated.
    medicineName: { type: String, required: true },
    unit: { type: String, enum: ["box", "pata"], required: true },
    quantity: { type: Number, required: true, min: 1 },
    // Snapshotted at sale time: changing a medicine's price later must
    // never rewrite what a past invoice says the customer was charged.
    ratePaisa: { type: Number, required: true, min: 0 },
    lineTotalPaisa: { type: Number, required: true, min: 0 },
    // How much stock this line actually consumed. For a box line this is
    // quantity * patasPerBox; for a pata line it is quantity. Stored so
    // cancellation can return exactly what was taken, even if the
    // medicine's pack size changed in between.
    patasDeducted: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const saleSchema = new Schema(
  {
    type: { type: String, enum: ["retail", "wholesale"], required: true },
    // null for retail — a walk-in customer is not a tracked entity.
    buyerId: { type: Schema.Types.ObjectId, ref: "Buyer", default: null },
    buyerName: { type: String, default: "" },
    buyerShopName: { type: String, default: "" },
    // Set for wholesale only; retail sales print nothing and need no number.
    invoiceNo: { type: String, default: null },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    items: {
      type: [saleLineSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "Sale must have at least one item",
      },
    },
    subtotalPaisa: { type: Number, required: true, min: 0 },
    discountPaisa: { type: Number, required: true, default: 0, min: 0 },
    totalPaisa: { type: Number, required: true, min: 0 },
    paidPaisa: { type: Number, required: true, min: 0 },
    duePaisa: { type: Number, required: true, min: 0 },
    // Sales are cancelled, never deleted: an invoice number that vanishes
    // from the books is an audit trail with a hole in it.
    status: { type: String, enum: ["active", "cancelled"], required: true, default: "active" },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
  },
  { timestamps: true },
);

// A sparse unique index: retail sales have invoiceNo null and must not
// collide with each other, but a wholesale invoice number must be unique.
saleSchema.index({ invoiceNo: 1 }, { unique: true, sparse: true });
saleSchema.index({ buyerId: 1, status: 1 });
saleSchema.index({ createdAt: -1 });

export type SaleLineDoc = InferSchemaType<typeof saleLineSchema>;
export type SaleDoc = InferSchemaType<typeof saleSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const SaleModel: Model<SaleDoc> =
  (mongoose.models.Sale as Model<SaleDoc>) ??
  mongoose.model<SaleDoc>("Sale", saleSchema);
