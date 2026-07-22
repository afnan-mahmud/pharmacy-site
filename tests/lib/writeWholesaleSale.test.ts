import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { writeWholesaleSale } from "@/lib/writeWholesaleSale";
import { MedicineModel } from "@/models/Medicine";
import { SaleModel } from "@/models/Sale";

setupTestDb();

const CREATED_BY = new mongoose.Types.ObjectId().toString();

async function makeMedicine(overrides = {}, stockPatas = 500) {
  const name = (overrides as { name?: string }).name ?? "Napa 500mg";
  const medicine = await MedicineModel.create({
    name,
    nameLower: name.toLowerCase(),
    genericName: "Paracetamol",
    company: "Beximco",
    patasPerBox: 10,
    boxPricePaisa: 12000,
    pataPricePaisa: 1400,
    stockPatas,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
  return medicine;
}

async function run(params: {
  buyer: {
    id: mongoose.Types.ObjectId;
    name: string;
    shopName: string;
    phone?: string;
  };
  items: { medicineId: string; boxes: number }[];
  discountPercent?: number;
  paidPaisa?: number;
  orderId?: string | null;
}) {
  const session = await mongoose.startSession();
  let saleId: mongoose.Types.ObjectId | null = null;
  try {
    await session.withTransaction(async () => {
      const sale = await writeWholesaleSale({
        session,
        buyer: { ...params.buyer, phone: params.buyer.phone ?? "" },
        items: params.items,
        discountPercent: params.discountPercent ?? 0,
        paidPaisa: params.paidPaisa ?? 0,
        createdBy: CREATED_BY,
        orderId: params.orderId ?? null,
      });
      saleId = sale._id;
    });
  } finally {
    await session.endSession();
  }
  return SaleModel.findById(saleId);
}

const buyer = () => ({
  id: new mongoose.Types.ObjectId(),
  name: "Karim Uddin",
  shopName: "Karim Medical Hall",
});

describe("writeWholesaleSale", () => {
  it("deducts boxes worth of patas and creates a wholesale sale", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      buyer: buyer(),
      items: [{ medicineId: String(medicine._id), boxes: 3 }],
      paidPaisa: 0,
    });
    expect(sale!.type).toBe("wholesale");
    expect(sale!.totalPaisa).toBe(36000);
    expect(sale!.items[0].patasDeducted).toBe(30);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(470);
  });

  it("assigns a sequential invoice number", async () => {
    const medicine = await makeMedicine();
    const line = [{ medicineId: String(medicine._id), boxes: 1 }];
    const first = await run({ buyer: buyer(), items: line });
    const second = await run({ buyer: buyer(), items: line });
    expect(first!.invoiceNo).toBe("ABC-000001");
    expect(second!.invoiceNo).toBe("ABC-000002");
  });

  it("records the paid and due amounts", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      buyer: buyer(),
      items: [{ medicineId: String(medicine._id), boxes: 3 }],
      paidPaisa: 20000,
    });
    expect(sale!.paidPaisa).toBe(20000);
    expect(sale!.duePaisa).toBe(16000);
  });

  it("links the sale to an order when given one", async () => {
    const medicine = await makeMedicine();
    const orderId = new mongoose.Types.ObjectId().toString();
    const sale = await run({
      buyer: buyer(),
      items: [{ medicineId: String(medicine._id), boxes: 1 }],
      orderId,
    });
    expect(String(sale!.orderId)).toBe(orderId);
  });

  it("throws and aborts when stock is short, leaving stock untouched", async () => {
    const medicine = await makeMedicine({}, 25); // 2 boxes + 5 patas
    await expect(
      run({ buyer: buyer(), items: [{ medicineId: String(medicine._id), boxes: 3 }] }),
    ).rejects.toThrow("stock e ache");
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(25);
    expect(await SaleModel.countDocuments()).toBe(0);
  });

  it("never lets stock go negative", async () => {
    const medicine = await makeMedicine({}, 3);
    await expect(
      run({ buyer: buyer(), items: [{ medicineId: String(medicine._id), boxes: 1000 }] }),
    ).rejects.toThrow();
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBeGreaterThanOrEqual(0);
  });
});
