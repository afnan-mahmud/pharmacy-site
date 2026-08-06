import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { MEDICINE_FORMS } from "@/lib/unitLabels";

const medicineSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lowercased copy of `name`, used only to enforce case-insensitive
    // uniqueness. Kept in sync by the actions, never edited directly.
    nameLower: { type: String, required: true, unique: true },
    genericName: { type: String, default: "", trim: true },
    company: { type: String, default: "", trim: true },
    // Lowercased words from name, genericName and company, kept in sync by
    // the actions the same way nameLower is. This is what every medicine
    // search actually queries — see src/lib/searchTokens.ts for why a search
    // over the display fields could not use an index.
    searchTokens: { type: [String], default: [] },
    // Which unit words this medicine is described with — box/pata for a
    // tablet strip, carton/bottle for a syrup. Display only: every stock and
    // price field below means the same thing under every form, which is why
    // none of them is renamed. See src/lib/unitLabels.ts.
    form: {
      type: String,
      enum: [...MEDICINE_FORMS],
      required: true,
      default: "tablet",
    },
    patasPerBox: { type: Number, required: true, min: 1 },
    // Purchasing/cost rate, per box. Never shown to a buyer or a retail
    // customer — this is the pharmacy's own cost basis, kept only so margin
    // can eventually be computed. 0 means "not entered yet".
    purchasePricePaisa: { type: Number, required: true, default: 0, min: 0 },
    // Wholesale channel: what a wholesale buyer (the buyer portal, the
    // WholesaleSaleForm) pays. Two independent rates — a box rate and a
    // per-pata rate for loose quantities — not one rate prorated into the
    // other. See src/lib/writeWholesaleSale.ts.
    wholesaleBoxPricePaisa: { type: Number, required: true, min: 0 },
    wholesalePataPricePaisa: { type: Number, required: true, min: 0 },
    // Khuchra (retail) channel: what a walk-in counter customer pays. Same
    // two-rate shape as wholesale, independent of it. See recordRetailSale
    // in src/actions/sales.ts.
    retailBoxPricePaisa: { type: Number, required: true, min: 0 },
    retailPataPricePaisa: { type: Number, required: true, min: 0 },
    // Optional list price (MRP) per box, for the struck-through "was" price
    // and a discount badge. 0 means no MRP — nothing struck through. When
    // set, it is kept at or above wholesaleBoxPricePaisa (a discount, not a
    // markup) — see the validation in src/actions/medicines.ts.
    mrpBoxPricePaisa: { type: Number, required: true, default: 0, min: 0 },
    // Canonical stock. Always patas, never boxes. May be negative — a sale can
    // outrun what is on hand; see src/lib/stockTransaction.ts. See src/lib/units.ts.
    stockPatas: { type: Number, required: true, default: 0 },
    lowStockThreshold: { type: Number, required: true, default: 0, min: 0 },
    expiryDate: { type: Date, default: null },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

medicineSchema.index({ name: 1 });
medicineSchema.index({ genericName: 1 });
// Multikey, and what makes an anchored `^prefix` query an index range scan
// rather than the collection scan it replaced. See src/lib/searchTokens.ts.
//
// The single-field index is the one that matters and is what the admin
// medicines table needs: that table lists deactivated rows, so its query
// carries no `active` predicate, and a compound index keyed on `active`
// first cannot serve it.
//
// The compound one is a smaller, second-order win for the sale-side searches
// (the picker, the buyer portal), which are all scoped to `active: true`. It
// lets that predicate be answered from the index instead of by fetching each
// candidate and testing it. Measured on a small collection the planner is
// happy with either — it picks the single-field index when the compound one
// is absent — so this is an optimisation, not a correctness requirement, and
// it is the first thing to drop if medicine writes ever need to get cheaper.
medicineSchema.index({ active: 1, searchTokens: 1 });
medicineSchema.index({ searchTokens: 1 });
// Serves dashboardSummary's low-stock query. That query's actual test —
// $expr: { $lte: ["$stockPatas", "$lowStockThreshold"] } — compares two
// fields of the same document and so can never use an index itself. What this
// index does is narrow the candidate set first: only active medicines that
// have an alert threshold set at all reach the $expr, and a threshold of 0
// (the default, meaning "no alert") is the common case. On a catalogue where
// a twentieth of the medicines carry a threshold, that turns a scan of every
// medicine into a scan of a twentieth of them, with the same result.
medicineSchema.index({ active: 1, lowStockThreshold: 1 });

export type MedicineDoc = InferSchemaType<typeof medicineSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MedicineModel: Model<MedicineDoc> =
  (mongoose.models.Medicine as Model<MedicineDoc>) ??
  mongoose.model<MedicineDoc>("Medicine", medicineSchema);
