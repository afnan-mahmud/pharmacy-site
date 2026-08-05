/**
 * Every user-visible unit word in the app comes from this table.
 *
 * Stock arithmetic is form-agnostic: a syrup carton holding 12 bottles is the
 * same shape as a tablet box holding 10 patas — an outer pack, an inner unit,
 * and an integer conversion (see src/lib/units.ts). Only the words differ, so
 * the words live in one place instead of being spelled out at each screen.
 */

export const MEDICINE_FORMS = [
  "tablet",
  "syrup",
  "injection",
  "cream",
  "drops",
  "other",
] as const;

export type MedicineForm = (typeof MEDICINE_FORMS)[number];

export type UnitLabels = {
  /** What the medicine form picker calls this form. */
  formLabel: string;
  /** The outer pack, lowercase: "box", "carton". */
  outer: string;
  /** The inner unit, lowercase: "pata", "bottle". */
  inner: string;
  /** The outer pack on an 80mm invoice, where width is scarce: "bx", "ctn". */
  outerShort: string;
  /** The inner unit on an 80mm invoice: "pt", "btl". */
  innerShort: string;
};

export const DEFAULT_MEDICINE_FORM: MedicineForm = "tablet";

const LABELS: Record<MedicineForm, UnitLabels> = {
  tablet: {
    formLabel: "Tablet / Capsule",
    outer: "box",
    inner: "pata",
    outerShort: "bx",
    innerShort: "pt",
  },
  syrup: {
    formLabel: "Syrup",
    outer: "piece",
    inner: "piece",
    outerShort: "pc",
    innerShort: "pc",
  },
  injection: {
    formLabel: "Injection / Vial",
    outer: "box",
    inner: "vial",
    outerShort: "bx",
    innerShort: "vl",
  },
  cream: {
    formLabel: "Cream / Ointment",
    outer: "box",
    inner: "tube",
    outerShort: "bx",
    innerShort: "tb",
  },
  drops: {
    formLabel: "Drops / Inhaler",
    outer: "box",
    inner: "piece",
    outerShort: "bx",
    innerShort: "pc",
  },
  other: {
    formLabel: "Onnanno (Piece)",
    outer: "piece",
    inner: "piece",
    outerShort: "pc",
    innerShort: "pc",
  },
};

export function isMedicineForm(value: unknown): value is MedicineForm {
  return (
    typeof value === "string" &&
    (MEDICINE_FORMS as readonly string[]).includes(value)
  );
}

/**
 * Narrows a stored value to a form. Takes `unknown` on purpose: callers include
 * `.lean()` query results and snapshotted sale lines, where a document written
 * before this field existed arrives as `undefined` — Mongoose applies schema
 * defaults when it builds a document, not when a lean query hands back raw
 * BSON. Those documents are all tablets, and an unrecognised value from a newer
 * client should render plain wording rather than crash a page, so both fall
 * back to the default.
 */
export function toMedicineForm(value: unknown): MedicineForm {
  return isMedicineForm(value) ? value : DEFAULT_MEDICINE_FORM;
}

export function unitLabelsFor(form: unknown): UnitLabels {
  return LABELS[toMedicineForm(form)];
}

export function isPieceOnlyForm(form: unknown): boolean {
  const f = toMedicineForm(form);
  return f === "other" || f === "syrup";
}

/** "carton" -> "Carton", for a table header or the start of a sentence. */
export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
