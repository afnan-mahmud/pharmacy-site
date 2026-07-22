import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
  buyerToken,
} from "../helpers/auth";
import { ADMIN_ONLY_ERROR } from "@/lib/session";
import { dashboardSummary } from "@/actions/dashboard";
import { SaleModel } from "@/models/Sale";
import { MedicineModel } from "@/models/Medicine";
import { OrderModel } from "@/models/Order";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

const ADMIN_ID = new mongoose.Types.ObjectId();
const MEDICINE_ID = new mongoose.Types.ObjectId();

// Freeze "now" at 12:00 Dhaka on 2026-07-17 (06:00 UTC) so "today" is
// deterministic rather than depending on when the suite runs.
const NOW = new Date("2026-07-17T06:00:00Z");

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setSessionCookie(cookieStore, await adminToken());
});

afterEach(() => {
  vi.useRealTimers();
});

async function makeSale(overrides: Record<string, unknown> = {}) {
  const sale = await SaleModel.create({
    type: "retail",
    buyerId: null,
    buyerName: "",
    buyerShopName: "",
    invoiceNo: null,
    items: [
      {
        medicineId: MEDICINE_ID,
        medicineName: "Napa 500mg",
        unit: "pata",
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
    status: "active",
    createdBy: ADMIN_ID,
    ...overrides,
  });
  if (overrides.createdAt) {
    await SaleModel.updateOne(
      { _id: sale._id },
      { $set: { createdAt: overrides.createdAt } },
      { timestamps: false },
    );
  }
  return sale;
}

async function makeMedicine(overrides: Record<string, unknown> = {}) {
  const name = (overrides.name as string) ?? "Napa 500mg";
  return MedicineModel.create({
    name,
    nameLower: name.toLowerCase(),
    genericName: "Paracetamol",
    company: "Beximco",
    patasPerBox: 10,
    boxPricePaisa: 12000,
    pataPricePaisa: 1400,
    stockPatas: 500,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
}

async function makePendingOrder() {
  return OrderModel.create({
    buyerId: new mongoose.Types.ObjectId(),
    buyerName: "Karim",
    items: [{ medicineId: MEDICINE_ID, medicineName: "Napa", boxes: 1, boxPricePaisa: 12000 }],
    status: "pending",
  });
}

describe("dashboardSummary", () => {
  it("reports today's Dhaka date", async () => {
    expect((await dashboardSummary()).today).toBe("2026-07-17");
  });

  it("is all zeros on a quiet day", async () => {
    const summary = await dashboardSummary();
    expect(summary.todayTotalPaisa).toBe(0);
    expect(summary.todaySaleCount).toBe(0);
    expect(summary.totalDuePaisa).toBe(0);
    expect(summary.lowStock).toEqual([]);
  });

  it("totals today's sales", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T05:00:00Z") });
    await makeSale({ createdAt: new Date("2026-07-17T05:30:00Z") });
    const summary = await dashboardSummary();
    expect(summary.todaySaleCount).toBe(2);
    expect(summary.todayTotalPaisa).toBe(5600);
  });

  it("splits today's retail and wholesale", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T05:00:00Z") });
    await makeSale({
      type: "wholesale",
      invoiceNo: "ABC-000001",
      buyerName: "Karim",
      totalPaisa: 36000,
      subtotalPaisa: 36000,
      paidPaisa: 36000,
      createdAt: new Date("2026-07-17T05:30:00Z"),
    });

    const summary = await dashboardSummary();
    expect(summary.todayRetailPaisa).toBe(2800);
    expect(summary.todayWholesalePaisa).toBe(36000);
    expect(summary.todayTotalPaisa).toBe(38800);
  });

  it("ignores yesterday's sales", async () => {
    await makeSale({ createdAt: new Date("2026-07-16T05:00:00Z") });
    expect((await dashboardSummary()).todaySaleCount).toBe(0);
  });

  it("counts a sale made after Dhaka midnight as today", async () => {
    // 00:30 Dhaka on the 17th is 18:30 UTC on the 16th. A UTC-day dashboard
    // would file this under yesterday and understate the day's takings.
    await makeSale({ createdAt: new Date("2026-07-16T18:30:00Z") });
    expect((await dashboardSummary()).todaySaleCount).toBe(1);
  });

  it("excludes a cancelled sale from today's total", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T05:00:00Z") });
    await makeSale({
      status: "cancelled",
      cancelReason: "Ferot",
      createdAt: new Date("2026-07-17T05:30:00Z"),
    });

    const summary = await dashboardSummary();
    expect(summary.todaySaleCount).toBe(1);
    expect(summary.todayTotalPaisa).toBe(2800);
  });

  it("lists a medicine at or below its low-stock threshold", async () => {
    await makeMedicine({ name: "Low One", stockPatas: 20, lowStockThreshold: 20 });
    await makeMedicine({ name: "Fine One", stockPatas: 21, lowStockThreshold: 20 });

    const summary = await dashboardSummary();
    expect(summary.lowStock.map((m) => m.name)).toEqual(["Low One"]);
  });

  it("carries what the low-stock display needs", async () => {
    await makeMedicine({ name: "Low One", stockPatas: 8, lowStockThreshold: 20 });
    const [row] = (await dashboardSummary()).lowStock;
    expect(row.stockPatas).toBe(8);
    expect(row.patasPerBox).toBe(10);
    expect(row.lowStockThreshold).toBe(20);
    expect(row.medicineId).toBeTypeOf("string");
  });

  it("ignores a deactivated medicine", async () => {
    await makeMedicine({ name: "Gone", stockPatas: 0, active: false });
    expect((await dashboardSummary()).lowStock).toEqual([]);
  });

  it("ignores a medicine whose threshold is zero and stock is zero", async () => {
    // A threshold of 0 means the owner set no alert for this medicine; an
    // empty one should not then nag him forever.
    await makeMedicine({ name: "No Alert", stockPatas: 0, lowStockThreshold: 0 });
    expect((await dashboardSummary()).lowStock).toEqual([]);
  });

  it("sorts the lowest stock first", async () => {
    await makeMedicine({ name: "Some", stockPatas: 15, lowStockThreshold: 20 });
    await makeMedicine({ name: "Almost None", stockPatas: 2, lowStockThreshold: 20 });

    const summary = await dashboardSummary();
    expect(summary.lowStock.map((m) => m.name)).toEqual(["Almost None", "Some"]);
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(dashboardSummary()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("rejects a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(dashboardSummary()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});

describe("dashboardSummary — pending orders", () => {
  it("counts only pending orders", async () => {
    await makePendingOrder();
    await makePendingOrder();
    const resolved = await makePendingOrder();
    await OrderModel.updateOne({ _id: resolved._id }, { $set: { status: "approved" } });

    const summary = await dashboardSummary();
    expect(summary.pendingOrderCount).toBe(2);
  });

  it("is zero when there are no pending orders", async () => {
    expect((await dashboardSummary()).pendingOrderCount).toBe(0);
  });
});
