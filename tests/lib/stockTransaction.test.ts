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

  it("allows a decrement larger than available stock, landing on negative stock", async () => {
    const medicine = await createMedicineDirect(50);
    const matched = await runInTransaction((session) =>
      applyStockDelta(medicine._id, -500, session),
    );
    expect(matched).toBe(true);

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(-450);
  });

  it("allows a decrement that lands one pata below zero", async () => {
    const medicine = await createMedicineDirect(10);
    const matched = await runInTransaction((session) =>
      applyStockDelta(medicine._id, -11, session),
    );
    expect(matched).toBe(true);

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(-1);
  });

  it("recovers from negative stock on a later increment", async () => {
    const medicine = await createMedicineDirect(10);
    await runInTransaction((session) => applyStockDelta(medicine._id, -30, session));
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(-20);

    await runInTransaction((session) => applyStockDelta(medicine._id, 100, session));
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(80);
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
