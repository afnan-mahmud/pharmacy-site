import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { SaleModel } from "@/models/Sale";
import { RetailPaymentModel } from "@/models/RetailPayment";
import { computeRetailDue, loadRetailLedger } from "@/lib/retailDueComputation";

setupTestDb();

const CREATED_BY = new mongoose.Types.ObjectId();

function retailSale(overrides: Record<string, unknown> = {}) {
  return {
    type: "retail" as const,
    buyerId: null,
    buyerName: "Karim",
    buyerPhone: "01711111111",
    invoiceNo: `ABC-${Math.floor(Math.random() * 1000000)}`,
    items: [
      {
        medicineId: new mongoose.Types.ObjectId(),
        medicineName: "Napa 500mg",
        unit: "box",
        quantity: 1,
        ratePaisa: 13000,
        lineTotalPaisa: 13000,
        patasDeducted: 10,
        leftoverPatas: 0,
      },
    ],
    subtotalPaisa: 13000,
    discountPercent: 0,
    discountPaisa: 0,
    totalPaisa: 13000,
    paidPaisa: 0,
    duePaisa: 13000,
    status: "active",
    createdBy: CREATED_BY,
    ...overrides,
  };
}

function retailPayment(overrides: Record<string, unknown> = {}) {
  return {
    phone: "01711111111",
    amountPaisa: 5000,
    note: "",
    createdBy: CREATED_BY,
    ...overrides,
  };
}

describe("computeRetailDue", () => {
  it("shows a positive balance for an unpaid retail sale", async () => {
    await SaleModel.create(retailSale());
    expect(await computeRetailDue("01711111111")).toBe(13000);
  });

  it("subtracts retail payments from the total due", async () => {
    await SaleModel.create(retailSale());
    await RetailPaymentModel.create(retailPayment());
    expect(await computeRetailDue("01711111111")).toBe(8000);
  });

  it("excludes cancelled sales", async () => {
    await SaleModel.create(retailSale({ status: "cancelled" }));
    expect(await computeRetailDue("01711111111")).toBe(0);
  });

  it("ignores wholesale sales on the same phone", async () => {
    await SaleModel.create(
      retailSale({ type: "wholesale", buyerId: new mongoose.Types.ObjectId() }),
    );
    expect(await computeRetailDue("01711111111")).toBe(0);
  });

  it("returns 0 for a phone never seen", async () => {
    expect(await computeRetailDue("01999999999")).toBe(0);
  });

  it("returns 0 for a blank phone without matching the sales that have none", async () => {
    await SaleModel.create(retailSale({ buyerPhone: "" }));
    expect(await computeRetailDue("")).toBe(0);
    expect(await computeRetailDue("   ")).toBe(0);
  });

  it("goes negative (credit) when payments exceed the due", async () => {
    await SaleModel.create(retailSale({ totalPaisa: 5000, duePaisa: 5000 }));
    await RetailPaymentModel.create(retailPayment({ amountPaisa: 8000 }));
    expect(await computeRetailDue("01711111111")).toBe(-3000);
  });
});

describe("loadRetailLedger", () => {
  it("returns only the named phone's sales and payments", async () => {
    await SaleModel.create(retailSale());
    await SaleModel.create(retailSale({ buyerPhone: "01722222222" }));
    await RetailPaymentModel.create(retailPayment());

    const ledger = await loadRetailLedger("01711111111");
    expect(ledger.sales).toHaveLength(1);
    expect(ledger.payments).toHaveLength(1);
  });

  it("returns empty arrays for a blank phone", async () => {
    const ledger = await loadRetailLedger("");
    expect(ledger.sales).toEqual([]);
    expect(ledger.payments).toEqual([]);
  });
});
