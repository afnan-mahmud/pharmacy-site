import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
  buyerToken,
} from "../helpers/auth";
import { ADMIN_ONLY_ERROR } from "@/lib/session";
import { salesReport } from "@/actions/reports";
import { SaleModel } from "@/models/Sale";
import mongoose from "mongoose";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

const ADMIN_ID = new mongoose.Types.ObjectId();
const MEDICINE_ID = new mongoose.Types.ObjectId();

/**
 * Writes a Sale directly. The report is a read-only aggregation, so driving
 * it through recordRetailSale/recordWholesaleSale would only add stock
 * bookkeeping this test does not care about — and would make it impossible
 * to place a sale at a chosen instant.
 */
async function makeSale(overrides: Record<string, unknown> = {}) {
  const base = {
    type: "retail" as const,
    buyerId: null,
    buyerName: "",
    buyerShopName: "",
    invoiceNo: null,
    items: [
      {
        medicineId: MEDICINE_ID,
        medicineName: "Napa 500mg",
        unit: "pata" as const,
        quantity: 2,
        ratePaisa: 1400,
        lineTotalPaisa: 2800,
        patasDeducted: 2,
      },
    ],
    subtotalPaisa: 2800,
    discountPercent: 0,
    totalPaisa: 2800,
    paidPaisa: 2800,
    duePaisa: 0,
    status: "active" as const,
    createdBy: ADMIN_ID,
  };
  const sale = await SaleModel.create({ ...base, ...overrides });
  // createdAt is set by timestamps; override it when the test needs the sale
  // to sit at a specific instant.
  if (overrides.createdAt) {
    await SaleModel.updateOne(
      { _id: sale._id },
      { $set: { createdAt: overrides.createdAt } },
      { timestamps: false },
    );
  }
  return sale;
}

import { MedicineModel } from "@/models/Medicine";

describe("salesReport", () => {
  it("returns an empty report when there are no sales", async () => {
    const report = await salesReport("2026-07-01", "2026-07-31");
    expect(report.rows).toEqual([]);
    expect(report.grandTotalPaisa).toBe(0);
    expect(report.grandCostPaisa).toBe(0);
    expect(report.grandProfitPaisa).toBe(0);
    expect(report.grandDuePaisa).toBe(0);
    expect(report.retail).toEqual({ count: 0, totalPaisa: 0, costPaisa: 0, profitPaisa: 0, duePaisa: 0 });
    expect(report.wholesale).toEqual({ count: 0, totalPaisa: 0, costPaisa: 0, profitPaisa: 0, duePaisa: 0 });
  });

  it("includes a sale inside the range and computes cost/profit from snapshotted cost", async () => {
    await makeSale({
      createdAt: new Date("2026-07-17T10:00:00Z"),
      items: [
        {
          medicineId: MEDICINE_ID,
          medicineName: "Napa 500mg",
          unit: "box" as const,
          quantity: 2,
          ratePaisa: 1400,
          lineTotalPaisa: 2800,
          patasDeducted: 20,
          costPaisa: 2000,
        },
      ],
    });
    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows).toHaveLength(1);
    expect(report.grandTotalPaisa).toBe(2800);
    expect(report.grandCostPaisa).toBe(2000);
    expect(report.grandProfitPaisa).toBe(800);
    expect(report.rows[0].costPaisa).toBe(2000);
    expect(report.rows[0].profitPaisa).toBe(800);
  });

  it("computes cost/profit from Medicine purchasePricePaisa when cost is not snapshotted", async () => {
    const med = await MedicineModel.create({
      _id: MEDICINE_ID,
      name: "Napa Extra",
      nameLower: "napa extra",
      genericName: "Paracetamol",
      company: "Beximco",
      form: "tablet",
      patasPerBox: 10,
      purchasePricePaisa: 1000, // 1000 per box, 100 per pata
      wholesaleBoxPricePaisa: 1200,
      wholesalePataPricePaisa: 120,
      retailBoxPricePaisa: 1500,
      retailPataPricePaisa: 150,
      stockPatas: 100,
      active: true,
    });

    await makeSale({
      createdAt: new Date("2026-07-17T10:00:00Z"),
      totalPaisa: 1500,
      items: [
        {
          medicineId: med._id,
          medicineName: med.name,
          unit: "box" as const,
          quantity: 1,
          ratePaisa: 1500,
          lineTotalPaisa: 1500,
          patasDeducted: 10,
          leftoverPatas: 0,
          // no costPaisa
        },
      ],
    });

    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].costPaisa).toBe(1000);
    expect(report.rows[0].profitPaisa).toBe(500);
    expect(report.grandCostPaisa).toBe(1000);
    expect(report.grandProfitPaisa).toBe(500);
  });

  it("excludes a sale before the range", async () => {
    await makeSale({ createdAt: new Date("2026-07-16T10:00:00Z") });
    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows).toHaveLength(0);
  });

  it("excludes a sale after the range", async () => {
    await makeSale({ createdAt: new Date("2026-07-19T10:00:00Z") });
    const report = await salesReport("2026-07-17", "2026-07-18");
    expect(report.rows).toHaveLength(0);
  });

  it("includes a late-evening Dhaka sale on the right day", async () => {
    // 22:30 Dhaka on the 17th is 16:30 UTC on the 17th. A UTC-day report
    // would still catch this one; the next test is the one that matters.
    await makeSale({ createdAt: new Date("2026-07-17T16:30:00Z") });
    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows).toHaveLength(1);
  });

  it("files a post-Dhaka-midnight sale on the new day, not the old one", async () => {
    // 00:30 Dhaka on the 18th is 18:30 UTC on the 17th. Bucketing by UTC day
    // would wrongly report this as the 17th's takings.
    await makeSale({ createdAt: new Date("2026-07-17T18:30:00Z") });

    expect((await salesReport("2026-07-17", "2026-07-17")).rows).toHaveLength(0);
    expect((await salesReport("2026-07-18", "2026-07-18")).rows).toHaveLength(1);
  });

  it("splits retail and wholesale totals", async () => {
    await makeSale({
      createdAt: new Date("2026-07-17T10:00:00Z"),
      items: [
        {
          medicineId: MEDICINE_ID,
          medicineName: "Napa",
          unit: "box" as const,
          quantity: 1,
          ratePaisa: 2800,
          lineTotalPaisa: 2800,
          patasDeducted: 10,
          costPaisa: 2000,
        },
      ],
    });
    await makeSale({
      type: "wholesale",
      invoiceNo: "NP-000001",
      buyerName: "Karim Uddin",
      totalPaisa: 36000,
      subtotalPaisa: 36000,
      paidPaisa: 20000,
      duePaisa: 16000,
      createdAt: new Date("2026-07-17T11:00:00Z"),
      items: [
        {
          medicineId: MEDICINE_ID,
          medicineName: "Napa",
          unit: "box" as const,
          quantity: 10,
          ratePaisa: 3600,
          lineTotalPaisa: 36000,
          patasDeducted: 100,
          costPaisa: 30000,
        },
      ],
    });

    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.retail).toEqual({
      count: 1,
      totalPaisa: 2800,
      costPaisa: 2000,
      profitPaisa: 800,
      duePaisa: 0,
    });
    expect(report.wholesale).toEqual({
      count: 1,
      totalPaisa: 36000,
      costPaisa: 30000,
      profitPaisa: 6000,
      duePaisa: 16000,
    });
    expect(report.grandTotalPaisa).toBe(38800);
    expect(report.grandCostPaisa).toBe(32000);
    expect(report.grandProfitPaisa).toBe(6800);
    expect(report.grandDuePaisa).toBe(16000);
  });

  it("excludes a cancelled sale from every total", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T10:00:00Z") });
    await makeSale({
      status: "cancelled",
      cancelledAt: new Date("2026-07-17T12:00:00Z"),
      cancelReason: "Ferot",
      createdAt: new Date("2026-07-17T11:00:00Z"),
    });

    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.retail).toEqual({
      count: 1,
      totalPaisa: 2800,
      costPaisa: 0,
      profitPaisa: 2800,
      duePaisa: 0,
    });
    expect(report.grandTotalPaisa).toBe(2800);
  });

  it("still lists a cancelled sale, marked", async () => {
    // The books show what happened, not a tidied version — the same rule
    // buyerLedger follows.
    await makeSale({
      status: "cancelled",
      cancelReason: "Ferot",
      createdAt: new Date("2026-07-17T11:00:00Z"),
    });

    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].cancelled).toBe(true);
    expect(report.cancelledCount).toBe(1);
  });

  it("returns rows newest first", async () => {
    await makeSale({
      totalPaisa: 100,
      createdAt: new Date("2026-07-17T10:00:00Z"),
    });
    await makeSale({
      totalPaisa: 200,
      createdAt: new Date("2026-07-17T12:00:00Z"),
    });

    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows.map((r) => r.totalPaisa)).toEqual([200, 100]);
  });

  it("carries the invoice number and buyer for a wholesale row", async () => {
    await makeSale({
      type: "wholesale",
      invoiceNo: "NP-000041",
      buyerName: "Karim Uddin",
      createdAt: new Date("2026-07-17T10:00:00Z"),
    });

    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows[0].invoiceNo).toBe("NP-000041");
    expect(report.rows[0].buyerName).toBe("Karim Uddin");
  });

  it("echoes back the requested range", async () => {
    const report = await salesReport("2026-07-01", "2026-07-31");
    expect(report.fromDate).toBe("2026-07-01");
    expect(report.toDate).toBe("2026-07-31");
  });

  it("spans a multi-day range inclusively", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T10:00:00Z") });
    await makeSale({ createdAt: new Date("2026-07-19T10:00:00Z") });
    const report = await salesReport("2026-07-17", "2026-07-19");
    expect(report.rows).toHaveLength(2);
  });

  it("rejects a malformed date", async () => {
    await expect(salesReport("17-07-2026", "2026-07-17")).rejects.toThrow(
      "Date ta YYYY-MM-DD hote hobe",
    );
  });

  it("rejects a reversed range", async () => {
    await expect(salesReport("2026-07-31", "2026-07-01")).rejects.toThrow(
      "Sesh date ta shuru date er age hote parbe na",
    );
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(salesReport("2026-07-01", "2026-07-31")).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });

  it("rejects a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(salesReport("2026-07-01", "2026-07-31")).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });
});
