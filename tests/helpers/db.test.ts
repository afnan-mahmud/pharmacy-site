import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "./db";

setupTestDb();

describe("test database", () => {
  it("connects", () => {
    expect(mongoose.connection.readyState).toBe(1);
  });

  it("supports transactions, which order approval depends on", async () => {
    const Thing = mongoose.model(
      "TxProbe",
      new mongoose.Schema({ n: Number }),
    );
    await Thing.createCollection();

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await Thing.create([{ n: 1 }], { session });
    });
    await session.endSession();

    expect(await Thing.countDocuments()).toBe(1);
  });
});
