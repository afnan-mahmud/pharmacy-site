/**
 * Reads a quantity out of a number input.
 *
 * Every cart screen used to do this inline, and each did it differently: one
 * snapped anything below 1 up to 1, another let a typed "-5" sit in state until
 * the server rejected it on submit. The rules are the same everywhere, so they
 * live here once.
 *
 * `minimum` is what a screen considers "nothing": 0 on the two invoice screens,
 * where a zero line means "ordered, not supplied" and still prints, and 1 on
 * the retail counter, where a zero line would have no reader.
 */
export function parseQuantityInput(raw: string, minimum: number): number {
  // An empty field is what the browser reports mid-edit, and Number("")
  // is 0 — which would silently pass the integer check below.
  if (raw.trim() === "") return minimum;

  const value = Number(raw);
  if (!Number.isInteger(value)) return minimum;
  return value < minimum ? minimum : value;
}
