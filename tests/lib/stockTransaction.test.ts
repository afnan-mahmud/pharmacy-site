import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { applyStockDelta } from "@/lib/stockTransaction";
import { MedicineModel } from "@/models/Medicine";

setupTestDb();

async function createMedicineDirect(stockPatas: number) {
  return MedicineModel.create({
    name: "Napa 500mg",
    nameLower: "napa 500mg",
    genericName: "Paracetamol",
    company: "Beximco",
    patasPerBox: 10,
    boxPricePaisa: 12000,
    pataPricePaisa: 1400,
    stockPatas,
    lowStockThreshold: 20,
  });
}

async function runInTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  let result!: T;
  try {
    await session.withTransaction(async () => {
      result = await fn(session);
    });
  } finally {
    await session.endSession();
  }
  return result;
}

describe("applyStockDelta", () => {
  it("increments stock and reports a match", async () => {
    const medicine = await createMedicineDirect(50);
    const matched = await runInTransaction((session) =>
      applyStockDelta(medicine._id, 20, session),
    );
    expect(matched).toBe(true);

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(70);
  });

  it("decrements stock when there is enough of it", async () => {
    const medicine = await createMedicineDirect(50);
    const matched = await runInTransaction((session) =>
      applyStockDelta(medicine._id, -30, session),
    );
    expect(matched).toBe(true);

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(20);
  });

  // This is the regression test for Fix 1: a bare `$inc` (the pattern this
  // function replaces) matches regardless of quantity and drives stockPatas
  // negative — verified empirically before this fix existed (matchedCount:
  // 1, stockPatas: -500 against a starting stock of 0). applyStockDelta's
  // filter-level precondition (`stockPatas >= -delta`) must refuse the write
  // entirely instead, leaving the document untouched.
  it("never drives stock negative: refuses a decrement larger than available stock", async () => {
    const medicine = await createMedicineDirect(50);
    const matched = await runInTransaction((session) =>
      applyStockDelta(medicine._id, -500, session),
    );
    expect(matched).toBe(false);

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(50);
  });

  it("refuses a decrement that would land exactly one pata below zero", async () => {
    const medicine = await createMedicineDirect(10);
    const matched = await runInTransaction((session) =>
      applyStockDelta(medicine._id, -11, session),
    );
    expect(matched).toBe(false);

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(10);
  });

  it("allows a decrement that lands exactly on zero", async () => {
    const medicine = await createMedicineDirect(10);
    const matched = await runInTransaction((session) =>
      applyStockDelta(medicine._id, -10, session),
    );
    expect(matched).toBe(true);

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(0);
  });

  it("reports no match (and makes no change) when the medicine no longer exists", async () => {
    const medicine = await createMedicineDirect(50);
    await MedicineModel.deleteOne({ _id: medicine._id });

    const matched = await runInTransaction((session) =>
      applyStockDelta(medicine._id, 20, session),
    );
    expect(matched).toBe(false);
  });
});
