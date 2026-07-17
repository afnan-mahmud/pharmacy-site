/**
 * Presentation-only helper for a signed due balance (see src/actions/due.ts
 * for why the number is signed): positive means the buyer owes the
 * pharmacy, negative means the pharmacy owes the buyer (credit).
 *
 * Never show a raw negative number next to the word "Baki" — "Baki
 * ৳-1200.00" reads as nonsense to a pharmacist. Every UI surface that shows
 * a due balance should go through this helper so the label and the amount
 * always agree with each other.
 */
import { formatTaka } from "./money";

export type DueDisplay = {
  label: "Baki" | "Joma ache" | "Baki nei";
  amountText: string;
  className: string;
};

export function describeDue(duePaisa: number): DueDisplay {
  if (duePaisa > 0) {
    return { label: "Baki", amountText: formatTaka(duePaisa), className: "text-red-600" };
  }
  if (duePaisa < 0) {
    return {
      label: "Joma ache",
      amountText: formatTaka(Math.abs(duePaisa)),
      className: "text-teal-700",
    };
  }
  return { label: "Baki nei", amountText: formatTaka(0), className: "text-slate-500" };
}
