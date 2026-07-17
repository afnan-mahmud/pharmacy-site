import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
} from "../helpers/auth";
import { createMedicine } from "@/actions/medicines";
import { recordWholesaleSale, cancelSale } from "@/actions/sales";
import { createBuyer } from "@/actions/buyers";
import { MedicineModel } from "@/models/Medicine";
import { PaymentModel } from "@/models/Payment";
import { listBuyerDues, buyerDueBalance, buyerLedger, recordPayment } from "@/actions/due";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

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

async function makeMedicine(stockPatas = 500) {
  const medicine = await createMedicine(napa);
  await MedicineModel.updateOne({ _id: medicine._id }, { $set: { stockPatas } });
  return medicine;
}

async function makeBuyer(name = "Karim Uddin") {
  return createBuyer(
    {
      name,
      shopName: "Medical Hall",
      phone: `017${Math.floor(Math.random() * 100000000)}`,
      address: "Mirpur",
    },
    "secret123",
  );
}

beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

describe("listBuyerDues", () => {
  it("sums due balances across multiple sales", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    // Total: 360, paid 200, due 160
    await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3 }], // 36000
      discountPaisa: 0,
      paidPaisa: 20000,
    });
    // Total: 240, paid 240, due 0
    await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 2 }], // 24000
      discountPaisa: 0,
      paidPaisa: 24000,
    });

    const dues = await listBuyerDues();
    expect(dues).toHaveLength(1);
    expect(dues[0].buyerId).toBe(buyer._id);
    expect(dues[0].duePaisa).toBe(16000);
  });

  it("subtracts subsequent payments from the total due", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3 }],
      discountPaisa: 0,
      paidPaisa: 20000, // Due 16000
    });
    await recordPayment(buyer._id, 100, "Cash"); // 10000 paisa
    
    const dues = await listBuyerDues();
    expect(dues[0].duePaisa).toBe(6000);
  });

  it("does not include cancelled sales in the due", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3 }],
      discountPaisa: 0,
      paidPaisa: 0, // Due 36000
    });
    
    await cancelSale(sale._id, "test");
    
    const dues = await listBuyerDues();
    expect(dues).toHaveLength(0); // Cancelled sale means 0 wholesale active sales, so filtered out
  });

  it("orders by due amount descending", async () => {
    const medicine = await makeMedicine();
    const buyer1 = await makeBuyer("Karim");
    const buyer2 = await makeBuyer("Rahim");

    await recordWholesaleSale({
      buyerId: buyer1._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPaisa: 0,
      paidPaisa: 10000, // Due 2000
    });
    await recordWholesaleSale({
      buyerId: buyer2._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPaisa: 0,
      paidPaisa: 0, // Due 12000
    });

    const dues = await listBuyerDues();
    expect(dues).toHaveLength(2);
    expect(dues[0].buyerId).toBe(buyer2._id);
    expect(dues[0].duePaisa).toBe(12000);
    expect(dues[1].buyerId).toBe(buyer1._id);
    expect(dues[1].duePaisa).toBe(2000);
  });
});

describe("buyerDueBalance", () => {
  it("calculates the exact due for a single buyer", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPaisa: 0,
      paidPaisa: 10000, // Due 2000
    });
    await recordPayment(buyer._id, 10, "test"); // 1000 paisa

    const bal = await buyerDueBalance(buyer._id);
    expect(bal).toBe(1000);
  });

  it("returns 0 if buyer does not exist", async () => {
    expect(await buyerDueBalance("507f1f77bcf86cd799439011")).toBe(0);
  });
});

describe("recordPayment", () => {
  it("records a valid payment", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPaisa: 0,
      paidPaisa: 0, // Due 12000
    });
    
    await recordPayment(buyer._id, 50, "Bank transfer"); // 5000 paisa
    
    const count = await PaymentModel.countDocuments({ buyerId: buyer._id });
    expect(count).toBe(1);
    
    const bal = await buyerDueBalance(buyer._id);
    expect(bal).toBe(7000);
  });

  it("rejects paying more than the due balance", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPaisa: 0,
      paidPaisa: 10000, // Due 2000
    });

    // 20 taka (2000 paisa) is allowed. 20.5 taka (2050 paisa) is not.
    await expect(recordPayment(buyer._id, 25, "test")).rejects.toThrow(
      "hote parbe na"
    );
  });

  it("rejects an invalid buyer", async () => {
    await expect(recordPayment("507f1f77bcf86cd799439011", 50, "")).rejects.toThrow(
      "Buyer pawa jay ni"
    );
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(recordPayment("507f1f77bcf86cd799439011", 50, "")).rejects.toThrow();
  });
});

describe("buyerLedger", () => {
  it("returns sales and payments", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPaisa: 0,
      paidPaisa: 0,
    });
    await recordPayment(buyer._id, 10, "test");
    
    const ledger = await buyerLedger(buyer._id);
    expect(ledger.sales).toHaveLength(1);
    expect(ledger.payments).toHaveLength(1);
  });
});
