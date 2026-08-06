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
import mongoose from "mongoose";
import { SaleModel } from "@/models/Sale";
import { PaymentModel } from "@/models/Payment";

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

describe("computeBuyerDue", () => {
  it("shows a positive balance for a buyer with an unpaid sale", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 2, patas: 0 }], // 24000 paisa
      discountPercent: 0,
      paidPaisa: 0,
    }));

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

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 2, patas: 0 }], // 24000 paisa
      discountPercent: 0,
      paidPaisa: 0,
    }));
    await unwrap(recordPayment(buyer._id, 240, "Cash")); // 24000 paisa, pays it off exactly
    expect(await computeBuyerDue(buyer._id)).toBe(0);

    await unwrap(cancelSale(sale._id, "test cancel"));

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

    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0,
    }));
    await unwrap(recordWholesaleSale({
      buyerId: other._id,
      items: [{ medicineId: medicine._id, boxes: 5, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0,
    }));

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

/**
 * A ledger is read from the top, but it was fetching a buyer's entire history
 * to render that. It now returns the newest window plus how big the whole
 * book is — the components compute the running balance backwards from the
 * buyer's current balance, so a window is exactly as correct as the full set.
 */
describe("loadBuyerLedger is bounded", () => {
  async function buyerWithHistory(sales: number, payments: number) {
    const buyerId = new mongoose.Types.ObjectId();
    for (let i = 0; i < sales; i++) {
      await SaleModel.create({
        type: "wholesale",
        buyerId,
        buyerName: "Karim",
        invoiceNo: `NP-${String(i).padStart(6, "0")}`,
        items: [
          {
            medicineName: "Napa",
            unit: "box",
            quantity: 1,
            ratePaisa: 1000,
            lineTotalPaisa: 1000,
            patasDeducted: 10,
          },
        ],
        subtotalPaisa: 1000,
        totalPaisa: 1000,
        paidPaisa: 0,
        duePaisa: 1000,
        status: "active",
        createdBy: new mongoose.Types.ObjectId(),
      });
    }
    for (let i = 0; i < payments; i++) {
      await PaymentModel.create({
        buyerId,
        amountPaisa: 100,
        createdBy: new mongoose.Types.ObjectId(),
      });
    }
    return String(buyerId);
  }

  it("caps each side at the window", async () => {
    const buyerId = await buyerWithHistory(120, 130);

    const ledger = await loadBuyerLedger(buyerId, 100);
    expect(ledger.sales).toHaveLength(100);
    expect(ledger.payments).toHaveLength(100);
  });

  it("reports the size of the whole book, not the window", async () => {
    const buyerId = await buyerWithHistory(120, 130);

    const ledger = await loadBuyerLedger(buyerId, 100);
    // The screen has to be able to say "latest 200 of 250" rather than
    // presenting a slice as the whole history.
    expect(ledger.totalEntries).toBe(250);
  });

  it("returns the newest entries, not an arbitrary hundred", async () => {
    const buyerId = await buyerWithHistory(120, 0);

    const ledger = await loadBuyerLedger(buyerId, 100);
    const invoices = ledger.sales.map((s) => s.invoiceNo);
    // Created oldest-first, so the newest hundred are NP-000020..NP-000119.
    expect(invoices).toContain("NP-000119");
    expect(invoices).not.toContain("NP-000000");
  });

  it("returns everything when the history is smaller than the window", async () => {
    const buyerId = await buyerWithHistory(3, 2);

    const ledger = await loadBuyerLedger(buyerId, 100);
    expect(ledger.sales).toHaveLength(3);
    expect(ledger.payments).toHaveLength(2);
    expect(ledger.totalEntries).toBe(5);
  });

  it("clamps an absurd window rather than reading everything", async () => {
    const buyerId = await buyerWithHistory(5, 0);

    // The limit reaches this from a server action, so it is not bounded by
    // what the UI would send.
    const ledger = await loadBuyerLedger(buyerId, 10_000_000);
    expect(ledger.sales).toHaveLength(5);
  });

  it("is empty for an unknown buyer", async () => {
    const ledger = await loadBuyerLedger(String(new mongoose.Types.ObjectId()));
    expect(ledger.sales).toEqual([]);
    expect(ledger.payments).toEqual([]);
    expect(ledger.totalEntries).toBe(0);
  });
});
