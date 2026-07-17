import type { ClientSession } from "mongoose";
import { CounterModel } from "@/models/Counter";

const INVOICE_KEY = "invoice";
const PAD_WIDTH = 6;

/**
 * Atomically reserves the next invoice sequence number.
 *
 * `findOneAndUpdate` with `$inc` is a single atomic operation, so two
 * concurrent sales can never receive the same number — unlike a read-then-
 * write, where both could read the same value before either wrote.
 *
 * Must be called inside an open transaction, so that the number and the
 * Sale it belongs to commit together. If the sale aborts, the number is
 * burned rather than reissued: reusing it would leave two different sales
 * claiming the same invoice identity in the owner's books, which is far
 * worse than a gap in the sequence.
 */
export async function nextInvoiceSeq(session: ClientSession): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate(
    { key: INVOICE_KEY },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session },
  );
  return counter!.seq;
}

export function formatInvoiceNo(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(PAD_WIDTH, "0")}`;
}
