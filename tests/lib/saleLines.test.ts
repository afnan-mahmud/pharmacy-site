import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { buildSaleLines, type SaleItemInput } from "@/lib/saleLines";
import { MedicineModel } from "@/models/Medicine";

setupTestDb();

async function makeMedicine(overrides: Record<string, unknown> = {}, stockPatas = 500) {
  const name = (overrides.name as string | undefined) ?? "Napa 500mg";
  return MedicineModel.create({
    name,
    nameLower: name.toLowerCase(),
    genericName: "Paracetamol",
    company: "Beximco",
    patasPerBox: 10,
    purchasePricePaisa: 9000,
    wholesaleBoxPricePaisa: 12000,
    wholesalePataPricePaisa: 1300,
    retailBoxPricePaisa: 13000,
    retailPataPricePaisa: 1400,
    stockPatas,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
}

async function run(items: SaleItemInput[], priceMode: "retail" | "wholesale") {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await buildSaleLines(items, session, priceMode);
    });
  } finally {
    await session.endSession();
  }
  return result!;
}

describe("buildSaleLines", () => {
  it("prices a wholesale line from the wholesale rates and deducts stock", async () => {
    const medicine = await makeMedicine();
    const lines = await run(
      [{ medicineId: String(medicine._id), boxes: 2, patas: 3 }],
      "wholesale",
    );
    expect(lines[0].ratePaisa).toBe(12000);
    expect(lines[0].lineTotalPaisa).toBe(2 * 12000 + 3 * 1300);
    expect(lines[0].patasDeducted).toBe(23);
    // 2 boxes @ 9000 = 18000, 3 patas @ (9000/10) = 2700 => 20700 costPaisa
    expect(lines[0].costPaisa).toBe(20700);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(477);
  });

  it("prices a retail line from the retail rates, independently of wholesale", async () => {
    const medicine = await makeMedicine();
    const lines = await run(
      [{ medicineId: String(medicine._id), boxes: 2, patas: 3 }],
      "retail",
    );
    expect(lines[0].ratePaisa).toBe(13000);
    expect(lines[0].lineTotalPaisa).toBe(2 * 13000 + 3 * 1400);
    expect(lines[0].patasDeducted).toBe(23);
    expect(lines[0].costPaisa).toBe(20700);
  });

  it("keeps a zero-quantity line on the sale and takes no stock", async () => {
    const medicine = await makeMedicine({}, 50);
    const lines = await run(
      [{ medicineId: String(medicine._id), boxes: 0, patas: 0 }],
      "retail",
    );
    expect(lines[0].quantity).toBe(0);
    expect(lines[0].lineTotalPaisa).toBe(0);
    expect(lines[0].patasDeducted).toBe(0);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(50);
  });

  it("defaults patas to 0 when a caller omits it", async () => {
    const medicine = await makeMedicine();
    const lines = await run([{ medicineId: String(medicine._id), boxes: 2 }], "wholesale");
    expect(lines[0].leftoverPatas).toBe(0);
    expect(lines[0].lineTotalPaisa).toBe(24000);
  });

  it("prices a custom item at its own flat price, no stock touched", async () => {
    const lines = await run(
      [{ customName: "Syringe", customPricePaisa: 2000, boxes: 3 }],
      "retail",
    );
    expect(lines[0].medicineId).toBeNull();
    expect(lines[0].medicineName).toBe("Syringe");
    expect(lines[0].lineTotalPaisa).toBe(6000);
    expect(lines[0].patasDeducted).toBe(0);
  });

  it("costs a custom item at its per-box costing times quantity", async () => {
    const lines = await run(
      [
        {
          customName: "Syringe",
          customPricePaisa: 2000,
          customCostPaisa: 1200,
          boxes: 3,
        },
      ],
      "retail",
    );
    expect(lines[0].costPaisa).toBe(3600);
    // 6000 sold - 3600 cost is the 2400 the profit report should show,
    // rather than the whole 6000 a costless custom line used to report.
    expect(lines[0].lineTotalPaisa - lines[0].costPaisa).toBe(2400);
  });

  it("costs a custom item at 0 when no costing is given", async () => {
    const lines = await run(
      [{ customName: "Syringe", customPricePaisa: 2000, boxes: 3 }],
      "retail",
    );
    expect(lines[0].costPaisa).toBe(0);
  });

  it("ignores patas when costing a custom item — the line is box-only", async () => {
    const lines = await run(
      [
        {
          customName: "Syringe",
          customPricePaisa: 2000,
          customCostPaisa: 1200,
          boxes: 2,
          patas: 5,
        },
      ],
      "retail",
    );
    expect(lines[0].costPaisa).toBe(2400);
  });

  it("rejects a custom item with no price", async () => {
    await expect(
      run([{ customName: "Syringe", boxes: 1 }], "retail"),
    ).rejects.toThrow("Custom item er nam o price dite hobe");
  });

  it("rejects an unknown medicine id", async () => {
    await expect(
      run([{ medicineId: "507f1f77bcf86cd799439011", boxes: 1 }], "retail"),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("lets stock go negative rather than refusing the sale", async () => {
    const medicine = await makeMedicine({}, 5);
    const lines = await run(
      [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      "retail",
    );
    expect(lines[0].patasDeducted).toBe(10);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(-5);
  });
});
