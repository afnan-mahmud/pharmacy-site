import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { writeRetailSale, type WriteRetailSaleParams } from "@/lib/writeRetailSale";
import { MedicineModel } from "@/models/Medicine";
import { SaleModel } from "@/models/Sale";
import { RetailCustomerModel } from "@/models/RetailCustomer";

setupTestDb();

const CREATED_BY = new mongoose.Types.ObjectId().toString();

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

async function run(params: Omit<WriteRetailSaleParams, "session" | "createdBy">) {
  const session = await mongoose.startSession();
  let saleId: mongoose.Types.ObjectId | null = null;
  try {
    await session.withTransaction(async () => {
      const sale = await writeRetailSale({ ...params, session, createdBy: CREATED_BY });
      saleId = sale._id;
    });
  } finally {
    await session.endSession();
  }
  return SaleModel.findById(saleId);
}

describe("writeRetailSale", () => {
  it("charges the retail box rate and deducts stock", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      customerName: "Walk-in",
      customerPhone: "",
      items: [{ medicineId: String(medicine._id), boxes: 2, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 26000,
    });
    expect(sale!.type).toBe("retail");
    expect(sale!.totalPaisa).toBe(26000);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(480);
  });

  it("assigns a sequential invoice number from the shared counter", async () => {
    const medicine = await makeMedicine();
    const line = [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }];
    const first = await run({
      customerName: "Walk-in", customerPhone: "", items: line,
      discount: { kind: "percent", percent: 0 }, paidPaisa: 13000,
    });
    const second = await run({
      customerName: "Walk-in", customerPhone: "", items: line,
      discount: { kind: "percent", percent: 0 }, paidPaisa: 13000,
    });
    expect(first!.invoiceNo).toBe("NP-000001");
    expect(second!.invoiceNo).toBe("NP-000002");
  });

  it("applies an amount discount exactly, no rounding round-trip", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      customerName: "Walk-in", customerPhone: "",
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      discount: { kind: "amount", amountPaisa: 500 },
      paidPaisa: 12500,
    });
    expect(sale!.discountPaisa).toBe(500);
    expect(sale!.totalPaisa).toBe(12500);
    expect(sale!.duePaisa).toBe(0);
  });

  it("records a partial payment as a due when a phone is given", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      customerName: "Karim", customerPhone: "01711111111",
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 5000,
    });
    expect(sale!.duePaisa).toBe(8000);
    expect(sale!.buyerPhone).toBe("01711111111");
  });

  it("rejects a due with no phone", async () => {
    const medicine = await makeMedicine();
    await expect(
      run({
        customerName: "Walk-in", customerPhone: "",
        items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
        discount: { kind: "percent", percent: 0 },
        paidPaisa: 5000,
      }),
    ).rejects.toThrow("Baki rakhte hole phone number dite hobe");
  });

  it("upserts a RetailCustomer when a phone is given", async () => {
    const medicine = await makeMedicine();
    await run({
      customerName: "Karim", customerPhone: "01711111111",
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 13000,
    });
    const customer = await RetailCustomerModel.findOne({ phone: "01711111111" });
    expect(customer?.name).toBe("Karim");
  });

  it("does not create a RetailCustomer when no phone is given", async () => {
    const medicine = await makeMedicine();
    await run({
      customerName: "Walk-in", customerPhone: "",
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 13000,
    });
    expect(await RetailCustomerModel.countDocuments()).toBe(0);
  });

  it("prices a custom item and a zero-quantity line alongside a medicine line", async () => {
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 0);
    const sale = await run({
      customerName: "Walk-in", customerPhone: "",
      items: [
        { medicineId: String(supplied._id), boxes: 1, patas: 0 },
        { medicineId: String(outOfStock._id), boxes: 0, patas: 0 },
        { customName: "Syringe", customPricePaisa: 2000, boxes: 2 },
      ],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 17000,
    });
    expect(sale!.items).toHaveLength(3);
    expect(sale!.totalPaisa).toBe(13000 + 0 + 4000);
  });

  it("rejects a sale whose only line is zero", async () => {
    const medicine = await makeMedicine();
    await expect(
      run({
        customerName: "Walk-in", customerPhone: "",
        items: [{ medicineId: String(medicine._id), boxes: 0, patas: 0 }],
        discount: { kind: "percent", percent: 0 },
        paidPaisa: 0,
      }),
    ).rejects.toThrow("Onto ekta line e poriman dite hobe");
  });

  it("succeeds and leaves stock negative when the sale exceeds what is on hand", async () => {
    const medicine = await makeMedicine({}, 5);
    const sale = await run({
      customerName: "Walk-in", customerPhone: "",
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 13000,
    });
    expect(sale!.totalPaisa).toBe(13000);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(-5);
  });

  it("snapshots the customer's previous due balance at sale creation time", async () => {
    const medicine = await makeMedicine();
    const phone = "01722222222";

    // First sale with partial payment creates due
    const sale1 = await run({
      customerName: "Rahim",
      customerPhone: phone,
      items: [{ medicineId: String(medicine._id), boxes: 2, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 10000,
    });
    expect(sale1!.previousDuePaisa).toBe(0);
    expect(sale1!.duePaisa).toBe(16000);

    // Second sale should have previousDuePaisa snapshot of 16000
    const sale2 = await run({
      customerName: "Rahim",
      customerPhone: phone,
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 13000,
    });
    expect(sale2!.previousDuePaisa).toBe(16000);
    expect(sale2!.duePaisa).toBe(0);
  });
});
