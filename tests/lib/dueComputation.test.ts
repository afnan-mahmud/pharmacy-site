import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import { unwrap } from "../helpers/action";
import {
  createMockCookieStore,
  setSessionCookie,
  adminToken,
} from "../helpers/auth";
import { createMedicine } from "@/actions/medicines";
import { recordWholesaleSale, cancelSale } from "@/actions/sales";
import { createBuyer } from "@/actions/buyers";
import { recordPayment } from "@/actions/due";
import { MedicineModel } from "@/models/Medicine";
import { computeBuyerDue, loadBuyerLedger } from "@/lib/dueComputation";

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
  const medicine = await unwrap(createMedicine(napa));
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

describe("computeBuyerDue", () => {
  it("shows a positive balance for a buyer with an unpaid sale", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 2 }], // 24000 paisa
      discountPercent: 0,
      paidPaisa: 0,
    });

    expect(await computeBuyerDue(buyer._id)).toBe(24000);
  });

  it("shows a negative balance (credit) when a fully-paid sale is cancelled", async () => {
    // Pay via a separate Payment record (recordPayment), not the sale's own
    // embedded paidPaisa — Payment has no saleId, so it is what survives a
    // cancellation and becomes credit. Same scenario due.test.ts's
    // "buyerDueBalance" suite already verifies against the admin path; this
    // exercises the extracted computeBuyerDue directly.
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 2 }], // 24000 paisa
      discountPercent: 0,
      paidPaisa: 0,
    });
    await recordPayment(buyer._id, 240, "Cash"); // 24000 paisa, pays it off exactly
    expect(await computeBuyerDue(buyer._id)).toBe(0);

    await cancelSale(sale._id, "test cancel");

    // The 24000 payment does not disappear with the cancelled sale — it
    // becomes credit, matching the worked example in due.ts's doc comment.
    expect(await computeBuyerDue(buyer._id)).toBe(-24000);
  });

  it("returns 0 for a non-existent or malformed buyer id", async () => {
    expect(await computeBuyerDue("507f1f77bcf86cd799439011")).toBe(0);
    expect(await computeBuyerDue("not-an-id")).toBe(0);
  });
});

describe("loadBuyerLedger", () => {
  it("returns only the named buyer's sales and payments", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const other = await makeBuyer("Rahim");

    await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPercent: 0,
      paidPaisa: 0,
    });
    await recordWholesaleSale({
      buyerId: other._id,
      items: [{ medicineId: medicine._id, boxes: 5 }],
      discountPercent: 0,
      paidPaisa: 0,
    });

    const ledger = await loadBuyerLedger(buyer._id);
    expect(ledger.sales).toHaveLength(1);
    expect(String(ledger.sales[0].buyerId)).toBe(buyer._id);
  });

  it("returns empty arrays for a malformed buyer id", async () => {
    const ledger = await loadBuyerLedger("not-an-id");
    expect(ledger.sales).toEqual([]);
    expect(ledger.payments).toEqual([]);
  });
});
