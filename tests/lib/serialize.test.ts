import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { toPlain, toPlainList } from "@/lib/serialize";

describe("toPlain", () => {
  it("converts ObjectId to a string", () => {
    const id = new mongoose.Types.ObjectId();
    expect(toPlain({ _id: id })).toEqual({ _id: id.toString() });
  });

  it("converts Date to an ISO string", () => {
    const date = new Date("2026-07-17T10:00:00.000Z");
    expect(toPlain({ createdAt: date })).toEqual({
      createdAt: "2026-07-17T10:00:00.000Z",
    });
  });

  it("leaves primitives alone", () => {
    expect(toPlain({ n: 1, s: "x", b: true, nul: null })).toEqual({
      n: 1,
      s: "x",
      b: true,
      nul: null,
    });
  });

  it("converts nested objects", () => {
    const id = new mongoose.Types.ObjectId();
    expect(toPlain({ outer: { inner: { _id: id } } })).toEqual({
      outer: { inner: { _id: id.toString() } },
    });
  });

  it("converts inside arrays", () => {
    const id = new mongoose.Types.ObjectId();
    expect(toPlain({ items: [{ medicineId: id }] })).toEqual({
      items: [{ medicineId: id.toString() }],
    });
  });

  it("drops undefined values rather than emitting them", () => {
    expect(toPlain({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it("produces a result that survives a JSON round-trip unchanged", () => {
    const input = {
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date("2026-07-17T10:00:00.000Z"),
      items: [{ medicineId: new mongoose.Types.ObjectId(), qty: 2 }],
    };
    const plain = toPlain(input);
    // This is the actual property that matters: React must be able to send
    // it across the Server Action boundary.
    expect(JSON.parse(JSON.stringify(plain))).toEqual(plain);
  });
});

describe("toPlainList", () => {
  it("converts every element", () => {
    const a = new mongoose.Types.ObjectId();
    const b = new mongoose.Types.ObjectId();
    expect(toPlainList([{ _id: a }, { _id: b }])).toEqual([
      { _id: a.toString() },
      { _id: b.toString() },
    ]);
  });

  it("handles an empty list", () => {
    expect(toPlainList([])).toEqual([]);
  });
});
