/**
 * Reads a money or percent figure out of a number input, without ever throwing.
 *
 * `<input type="number">` does not stop anyone typing "-5" or an "e" — the
 * string reaches the component either way, and `min={0}` is only a hint the
 * browser applies at form validation, not while typing. takaToPaisa throws on
 * those (see src/lib/money.ts), and a throw during render is a blank white
 * page, so every taka box parses through here instead: null means "show the
 * owner a message", never "crash".
 *
 * Both sale screens need the same rule, so it lives here once rather than
 * inline in each — the same reason parseQuantityInput exists.
 */

import { takaToPaisa } from "./money";

/** Returns paisa, or null when the box holds something unusable. */
export function parseTakaInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  try {
    return takaToPaisa(trimmed);
  } catch {
    return null;
  }
}

/** Same guard for a percent box, which is a plain number, not money. */
export function parsePercentInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}
