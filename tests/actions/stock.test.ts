import { describe, it, expect } from "vitest";
import { setupTestDb } from "../helpers/db";
import { createMedicine } from "@/actions/medicines";
import { stockIn, listStockEntries } from "@/actions/stock";
import { MedicineModel } from "@/models/Medicine";
import { StockEntryModel } from "@/models/StockEntry";

setupTestDb();

const napa = {
  name: "Napa 500mg",
  genericName: "Paracetamol",
  company: "Beximco",
  patasPerBox: 10,
  boxPricePaisa: 12000,
  pataPricePaisa: 1400,
  lowStockThreshold: 20,
};

const USER_ID = "507f1f77bcf86cd799439011";

describe("stockIn", () => {
  it("converts boxes to patas and increases stock", async () => {
    const medicine = await createMedicine(napa);
    await stockIn({
      medicineId: String(medicine._id),
      boxes: 50,
      note: "",
      userId: USER_ID,
    });

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(500);
  });

  it("accumulates across entries", async () => {
    const medicine = await createMedicine(napa);
    const entry = { medicineId: String(medicine._id), note: "", userId: USER_ID };
    await stockIn({ ...entry, boxes: 50 });
    await stockIn({ ...entry, boxes: 20 });

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(700);
  });

  it("records the entry with the snapshotted pata count", async () => {
    const medicine = await createMedicine(napa);
    await stockIn({
      medicineId: String(medicine._id),
      boxes: 50,
      note: "Beximco delivery",
      userId: USER_ID,
    });

    const entries = await StockEntryModel.find();
    expect(entries).toHaveLength(1);
    expect(entries[0].boxes).toBe(50);
    expect(entries[0].patasAdded).toBe(500);
    expect(entries[0].note).toBe("Beximco delivery");
  });

  it("keeps the historical patasAdded when patasPerBox later changes", async () => {
    const medicine = await createMedicine(napa);
    await stockIn({
      medicineId: String(medicine._id),
      boxes: 10,
      note: "",
      userId: USER_ID,
    });

    // The pack size changes; history must not be retroactively rewritten.
    await MedicineModel.findByIdAndUpdate(medicine._id, {
      $set: { patasPerBox: 12 },
    });

    const entry = await StockEntryModel.findOne();
    expect(entry!.patasAdded).toBe(100);
  });

  it("rejects zero boxes", async () => {
    const medicine = await createMedicine(napa);
    await expect(
      stockIn({ medicineId: String(medicine._id), boxes: 0, note: "", userId: USER_ID }),
    ).rejects.toThrow("Box সংখ্যা 1 er kom hote parbe na");
  });

  it("rejects negative boxes", async () => {
    const medicine = await createMedicine(napa);
    await expect(
      stockIn({ medicineId: String(medicine._id), boxes: -5, note: "", userId: USER_ID }),
    ).rejects.toThrow("Box সংখ্যা 1 er kom hote parbe na");
  });

  it("rejects an unknown medicine and writes no entry", async () => {
    await expect(
      stockIn({
        medicineId: "507f1f77bcf86cd799439011",
        boxes: 5,
        note: "",
        userId: USER_ID,
      }),
    ).rejects.toThrow("Medicine not found");
    expect(await StockEntryModel.countDocuments()).toBe(0);
  });
});

describe("listStockEntries", () => {
  it("returns entries newest first", async () => {
    const medicine = await createMedicine(napa);
    const base = { medicineId: String(medicine._id), note: "", userId: USER_ID };
    await stockIn({ ...base, boxes: 1 });
    await stockIn({ ...base, boxes: 2 });

    const entries = await listStockEntries();
    expect(entries[0].boxes).toBe(2);
    expect(entries[1].boxes).toBe(1);
  });
});
