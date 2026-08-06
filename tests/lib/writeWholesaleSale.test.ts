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
  return medicine;
}

async function run(params: {
  buyer: {
    id: mongoose.Types.ObjectId;
    name: string;
    shopName: string;
    phone?: string;
  };
  items: { medicineId: string; boxes: number; patas?: number }[];
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
    expect(first!.invoiceNo).toBe("NP-000001");
    expect(second!.invoiceNo).toBe("NP-000002");
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

  it("succeeds and leaves stock negative when the sale exceeds what is on hand", async () => {
    const medicine = await makeMedicine({}, 25); // 2 boxes + 5 patas
    const sale = await run({
      buyer: buyer(),
      items: [{ medicineId: String(medicine._id), boxes: 3 }],
    });
    expect(sale!.totalPaisa).toBe(36000);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(-5);
  });

  it("prices a line's boxes and leftover patas from their own separate rates", async () => {
    const medicine = await makeMedicine(); // wholesaleBoxPricePaisa 12000, wholesalePataPricePaisa 1300
    const sale = await run({
      buyer: buyer(),
      items: [{ medicineId: String(medicine._id), boxes: 2, patas: 3 }],
    });
    // 2 * 12000 + 3 * 1300 = 27900, not a prorated 23 * 12000 / 10.
    expect(sale!.totalPaisa).toBe(27900);
    expect(sale!.items[0].quantity).toBe(2);
    expect(sale!.items[0].leftoverPatas).toBe(3);
    expect(sale!.items[0].patasDeducted).toBe(23);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(477);
  });

  it("treats a patas-only line (zero boxes) as billable at the pata rate", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      buyer: buyer(),
      items: [{ medicineId: String(medicine._id), boxes: 0, patas: 4 }],
    });
    expect(sale!.items[0].leftoverPatas).toBe(4);
    expect(sale!.totalPaisa).toBe(5200); // 4 * 1300
  });

  it("defaults patas to 0 when a caller omits it (order approval)", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      buyer: buyer(),
      items: [{ medicineId: String(medicine._id), boxes: 2 }],
    });
    expect(sale!.items[0].leftoverPatas).toBe(0);
    expect(sale!.totalPaisa).toBe(24000);
  });

  it("snapshots the buyer's previous due balance at sale creation time", async () => {
    const medicine = await makeMedicine();
    const b = buyer();

    // First sale with partial payment creates due
    const sale1 = await run({
      buyer: b,
      items: [{ medicineId: String(medicine._id), boxes: 2 }],
      paidPaisa: 10000,
    });
    expect(sale1!.previousDuePaisa).toBe(0);
    expect(sale1!.duePaisa).toBe(14000);

    // Second sale should have previousDuePaisa snapshot of 14000
    const sale2 = await run({
      buyer: b,
      items: [{ medicineId: String(medicine._id), boxes: 1 }],
      paidPaisa: 12000,
    });
    expect(sale2!.previousDuePaisa).toBe(14000);
    expect(sale2!.duePaisa).toBe(0);
  });
});
