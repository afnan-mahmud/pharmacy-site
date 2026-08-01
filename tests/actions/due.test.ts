import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import { unwrap } from "../helpers/action";
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
  purchasePricePaisa: 9000,
  wholesaleBoxPricePaisa: 12000,
  wholesalePataPricePaisa: 1300,
  retailBoxPricePaisa: 13000,
  retailPataPricePaisa: 1400,
  lowStockThreshold: 20,
};

async function makeMedicine(stockPatas = 500) {
  const medicine = await unwrap(createMedicine(napa));
  await MedicineModel.updateOne({ _id: medicine._id }, { $set: { stockPatas } });
  return medicine;
}

async function makeBuyer(name = "Karim Uddin") {
  return unwrap(createBuyer(
    {
      name,
      shopName: "Medical Hall",
      phone: `017${Math.floor(Math.random() * 100000000)}`,
      address: "Mirpur",
    },
    "secret123",
  ));
}

beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

describe("listBuyerDues", () => {
  it("sums due balances across multiple sales", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    // Total: 360, paid 200, due 160
    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3, patas: 0 }], // 36000
      discountPercent: 0,
      paidPaisa: 20000,
    }));
    // Total: 240, paid 240, due 0
    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 2, patas: 0 }], // 24000
      discountPercent: 0,
      paidPaisa: 24000,
    }));

    const dues = await listBuyerDues();
    expect(dues).toHaveLength(1);
    expect(dues[0].buyerId).toBe(buyer._id);
    expect(dues[0].duePaisa).toBe(16000);
  });

  it("subtracts subsequent payments from the total due", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 20000, // Due 16000
    }));
    await unwrap(recordPayment(buyer._id, 100, "Cash")); // 10000 paisa
    
    const dues = await listBuyerDues();
    expect(dues[0].duePaisa).toBe(6000);
  });

  it("does not include cancelled sales in the due", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0, // Due 36000
    }));
    
    await unwrap(cancelSale(sale._id, "test"));
    
    const dues = await listBuyerDues();
    expect(dues).toHaveLength(0); // Cancelled sale means 0 wholesale active sales, so filtered out
  });

  it("shows a negative duePaisa (credit), not clamped to 0, when the buyer overpaid because a paid-for sale was cancelled", async () => {
    // Same scenario as the buyerDueBalance test above (A=1200, B=600, one
    // 1200 payment, then A cancelled): the buyer still has one active
    // wholesale sale (B), so they still show up in listBuyerDues — but
    // their net position is -600 (credit), not the old clamped 0.
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const saleA = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 10, patas: 0 }], // 120000 paisa
      discountPercent: 0,
      paidPaisa: 0,
    }));
    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 5, patas: 0 }], // 60000 paisa
      discountPercent: 0,
      paidPaisa: 0,
    }));
    await unwrap(recordPayment(buyer._id, 1200, "Cash"));
    await unwrap(cancelSale(saleA._id, "Bhul order"));

    const dues = await listBuyerDues();
    expect(dues).toHaveLength(1);
    expect(dues[0].duePaisa).toBe(-60000);
  });

  it("orders by due amount descending", async () => {
    const medicine = await makeMedicine();
    const buyer1 = await makeBuyer("Karim");
    const buyer2 = await makeBuyer("Rahim");

    await unwrap(recordWholesaleSale({
      buyerId: buyer1._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 10000, // Due 2000
    }));
    await unwrap(recordWholesaleSale({
      buyerId: buyer2._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0, // Due 12000
    }));

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

    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 10000, // Due 2000
    }));
    await unwrap(recordPayment(buyer._id, 10, "test")); // 1000 paisa

    const bal = await buyerDueBalance(buyer._id);
    expect(bal).toBe(1000);
  });

  it("returns 0 if buyer does not exist", async () => {
    expect(await buyerDueBalance("507f1f77bcf86cd799439011")).toBe(0);
  });

  it("does not forgive a buyer's other debts when a paid-for sale is cancelled", async () => {
    // The exact scenario from the review: sale A (1200) and sale B (600),
    // both taken unpaid, then a single buyer-level payment of 1200 (which
    // does not belong to either sale specifically — Payment has no
    // saleId). Before any cancellation the buyer legitimately owes
    // 1800 - 1200 = 600.
    //
    // Cancelling A removes A's 1200 from the *active* due total, but the
    // 1200 Payment record is buyer-level and is never removed — per the
    // owner's decided rule, that money now stays as the buyer's credit
    // rather than vanishing. So once A is void, the buyer's remaining
    // active obligation is just B's 600, against which 1200 has already
    // been paid: a net credit of 600 (negative = pharmacy owes the buyer),
    // not the 0 the old Math.max(0, ...) clamp reported, and not a false
    // "still owes 600" either — the buyer overpaid relative to what's left
    // owing once A is voided.
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const saleA = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 10, patas: 0 }], // 120000 paisa
      discountPercent: 0,
      paidPaisa: 0,
    }));
    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 5, patas: 0 }], // 60000 paisa
      discountPercent: 0,
      paidPaisa: 0,
    }));

    await unwrap(recordPayment(buyer._id, 1200, "Cash")); // 120000 paisa
    expect(await buyerDueBalance(buyer._id)).toBe(60000); // 1800 - 1200 = 600 owed, pre-cancel

    await unwrap(cancelSale(saleA._id, "Bhul order"));

    // 600 (B's due) - 1200 (payment) = -600: the buyer is in credit, not
    // square and not still owing 600.
    expect(await buyerDueBalance(buyer._id)).toBe(-60000);
  });

  it("shows a full credit, not zero, when a fully-paid sale is cancelled", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 10, patas: 0 }], // 120000 paisa
      discountPercent: 0,
      paidPaisa: 0,
    }));
    await unwrap(recordPayment(buyer._id, 1200, "Cash")); // pays it off in full
    expect(await buyerDueBalance(buyer._id)).toBe(0);

    await unwrap(cancelSale(sale._id, "Bhul order"));

    // The 1200 payment doesn't disappear just because the sale it paid for
    // did — it becomes ৳1200 of credit, not a reset to 0.
    expect(await buyerDueBalance(buyer._id)).toBe(-120000);
  });
});

describe("recordPayment", () => {
  it("records a valid payment", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0, // Due 12000
    }));
    
    await unwrap(recordPayment(buyer._id, 50, "Bank transfer")); // 5000 paisa
    
    const count = await PaymentModel.countDocuments({ buyerId: buyer._id });
    expect(count).toBe(1);
    
    const bal = await buyerDueBalance(buyer._id);
    expect(bal).toBe(7000);
  });

  it("rejects paying more than the due balance", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 10000, // Due 2000
    }));

    // 20 taka (2000 paisa) is allowed. 20.5 taka (2050 paisa) is not.
    await expect(unwrap(recordPayment(buyer._id, 25, "test"))).rejects.toThrow(
      "hote parbe na"
    );
  });

  it("rejects an invalid buyer", async () => {
    await expect(unwrap(recordPayment("507f1f77bcf86cd799439011", 50, ""))).rejects.toThrow(
      "Buyer pawa jay ni"
    );
  });

  it("rejects any payment with a clear Banglish message when the buyer is already in credit, instead of a negative number", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 10, patas: 0 }], // 120000 paisa
      discountPercent: 0,
      paidPaisa: 0,
    }));
    await unwrap(recordPayment(buyer._id, 1200, "Cash")); // pays it off exactly
    await unwrap(cancelSale(sale._id, "Bhul order")); // now buyer is 1200 in credit

    await expect(unwrap(recordPayment(buyer._id, 10, "test"))).rejects.toThrow(
      "kono baki nei",
    );
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(unwrap(recordPayment("507f1f77bcf86cd799439011", 50, ""))).rejects.toThrow();
  });

  it("does not let two concurrent payments for the whole due both commit (a double-click must not halve the debt)", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }], // 12000 paisa due
      discountPercent: 0,
      paidPaisa: 0,
    }));

    const results = await Promise.allSettled([
      unwrap(recordPayment(buyer._id, 120, "concurrent A")),
      unwrap(recordPayment(buyer._id, 120, "concurrent B")),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const count = await PaymentModel.countDocuments({ buyerId: buyer._id });
    expect(count).toBe(1);
    expect(await buyerDueBalance(buyer._id)).toBe(0);
  });
});

describe("buyerLedger", () => {
  it("returns sales and payments", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    
    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0,
    }));
    await unwrap(recordPayment(buyer._id, 10, "test"));
    
    const ledger = await buyerLedger(buyer._id);
    expect(ledger.sales).toHaveLength(1);
    expect(ledger.payments).toHaveLength(1);
  });
});
