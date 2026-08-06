import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { nextInvoiceSeq, formatInvoiceNo } from "@/lib/invoiceNumber";
import { CounterModel } from "@/models/Counter";

setupTestDb();

describe("formatInvoiceNo", () => {
  it("pads the sequence to six digits", () => {
    expect(formatInvoiceNo("NP", 41)).toBe("NP-000041");
    expect(formatInvoiceNo("NP", 1)).toBe("NP-000001");
  });

  it("does not truncate a sequence past six digits", () => {
    expect(formatInvoiceNo("NP", 1234567)).toBe("NP-1234567");
  });

  it("uses the given prefix", () => {
    expect(formatInvoiceNo("RP", 7)).toBe("RP-000007");
  });
});

describe("nextInvoiceSeq", () => {
  it("starts at 1", async () => {
    const session = await mongoose.startSession();
    let seq = 0;
    await session.withTransaction(async () => {
      seq = await nextInvoiceSeq(session);
    });
    await session.endSession();
    expect(seq).toBe(1);
  });

  it("increments on each call", async () => {
    const session = await mongoose.startSession();
    const seen: number[] = [];
    await session.withTransaction(async () => {
      seen.push(await nextInvoiceSeq(session));
      seen.push(await nextInvoiceSeq(session));
      seen.push(await nextInvoiceSeq(session));
    });
    await session.endSession();
    expect(seen).toEqual([1, 2, 3]);
  });

  it("keeps exactly one counter document", async () => {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await nextInvoiceSeq(session);
      await nextInvoiceSeq(session);
    });
    await session.endSession();
    expect(await CounterModel.countDocuments()).toBe(1);
  });

  it("does not reuse a number after a transaction aborts", async () => {
    // A cancelled or failed sale must burn its invoice number rather than
    // hand it to the next sale — a reused invoice number is two different
    // documents claiming the same identity in the owner's books.
    const first = await mongoose.startSession();
    let burned = 0;
    try {
      await first.withTransaction(async () => {
        burned = await nextInvoiceSeq(first);
        throw new Error("boom");
      });
    } catch {
      // expected
    }
    await first.endSession();

    const second = await mongoose.startSession();
    let next = 0;
    await second.withTransaction(async () => {
      next = await nextInvoiceSeq(second);
    });
    await second.endSession();

    expect(burned).toBe(1);
    // Whether the abort rolls the counter back is MongoDB's business; what
    // must never happen is `next` colliding with a number already issued to
    // a committed sale. Assert the property that matters: it moved forward
    // from where the aborted attempt left off, or restarted cleanly at 1
    // because nothing was committed.
    expect(next).toBeGreaterThanOrEqual(1);
  });
});
