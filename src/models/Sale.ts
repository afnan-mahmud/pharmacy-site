import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const saleLineSchema = new Schema(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: "Medicine", required: true },
    // Denormalised so an invoice still reads correctly if the medicine is
    // later renamed or deactivated.
    medicineName: { type: String, required: true },
    unit: { type: String, enum: ["box", "pata"], required: true },
    // 0 is allowed and meaningful: a line the buyer asked for that the owner
    // could not supply stays on the invoice at zero, priced at nothing, so
    // the paper records the request rather than silently dropping it. The
    // min is what keeps a *negative* quantity out of the database.
    quantity: { type: Number, required: true, min: 0 },
    // Snapshotted at sale time: changing a medicine's price later must
    // never rewrite what a past invoice says the customer was charged.
    ratePaisa: { type: Number, required: true, min: 0 },
    lineTotalPaisa: { type: Number, required: true, min: 0 },
    // How much stock this line actually consumed. For a box line this is
    // quantity * patasPerBox; for a pata line it is quantity, and for a
    // zero-quantity line it is 0 — nothing left the shelf, so cancelling
    // returns nothing. Stored so cancellation can return exactly what was
    // taken, even if the medicine's pack size changed in between.
    patasDeducted: { type: Number, required: true, min: 0 },
    // Which unit words this line prints with, snapshotted for the same reason
    // medicineName and ratePaisa are: an invoice printed last month must not
    // re-word itself because the medicine's form was corrected today. The
    // form rather than a rendered label, because the invoice needs "btl"
    // while a screen needs "bottle" — both derive from this, neither derives
    // from the other. No enum: a snapshot must not fail validation over a
    // value the medicine model no longer offers. See src/lib/unitLabels.ts.
    form: { type: String, default: "tablet" },
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
    // Both are stored because they answer different questions: the percent
    // is what was agreed with the buyer, the paisa is what was actually taken
    // off. Sales written before discounts became percentages have no percent
    // and read back as 0, which the invoice renders as the amount alone —
    // exactly what those invoices said when they were printed.
    discountPercent: { type: Number, required: true, default: 0, min: 0 },
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

// A partial unique index scoped to string invoiceNo values only. Retail
// sales are written with invoiceNo: null (see recordRetailSale) — a plain
// `sparse` index only excludes documents where the field is *missing*, not
// documents where it is present but null, so every retail sale would collide
// on the single `{ invoiceNo: null }` index entry. Filtering the index to
// `$type: "string"` excludes nulls (and missing fields) from the uniqueness
// check entirely, while a wholesale invoice number — always a string — stays
// enforced unique.
saleSchema.index(
  { invoiceNo: 1 },
  { unique: true, partialFilterExpression: { invoiceNo: { $type: "string" } } },
);
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
