import { Types } from "mongoose";

/**
 * Maps a Mongoose document type to its JSON-safe equivalent: ObjectId and
 * Date become strings, everything else keeps its shape.
 *
 * Server Actions serialize their return value to send it to Client
 * Components, and React only accepts plain objects. A lean document looks
 * plain but still holds real ObjectId and Date instances, which React
 * rejects with "Only plain objects can be passed to Client Components".
 * Reading only primitive fields off such a document happens to work, which
 * is exactly why the problem stays invisible until someone reads an _id.
 */
export type Serialized<T> = T extends Types.ObjectId
  ? string
  : T extends Date
    ? string
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

export function toPlain<T>(doc: T): Serialized<T> {
  return convert(doc) as Serialized<T>;
}

export function toPlainList<T>(docs: T[]): Serialized<T>[] {
  return docs.map((doc) => toPlain(doc));
}

function convert(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(convert);

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      // Skipping undefined matches JSON.stringify's behaviour, so the
      // JSON round-trip in the tests stays an identity.
      if (inner === undefined) continue;
      out[key] = convert(inner);
    }
    return out;
  }

  return value;
}
