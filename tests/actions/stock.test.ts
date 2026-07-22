import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { unwrap } from "../helpers/action";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
  buyerToken,
  ADMIN_USER_ID,
} from "../helpers/auth";
import { ADMIN_ONLY_ERROR } from "@/lib/session";
import { createMedicine } from "@/actions/medicines";
import { stockIn, listStockEntries } from "@/actions/stock";
import { MedicineModel } from "@/models/Medicine";
import { StockEntryModel } from "@/models/StockEntry";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

// stockIn/listStockEntries are admin-only work, so every test needs a valid
// admin session present unless it is specifically testing the guard.
beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

const napa = {
  name: "Napa 500mg",
  genericName: "Paracetamol",
  company: "Beximco",
  patasPerBox: 10,
  boxPricePaisa: 12000,
  pataPricePaisa: 1400,
  lowStockThreshold: 20,
};

describe("stockIn", () => {
  it("converts boxes to patas and increases stock", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await unwrap(stockIn({
      medicineId: String(medicine._id),
      boxes: 50,
      note: "",
    }));

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(500);
  });

  it("accumulates across entries", async () => {
    const medicine = await unwrap(createMedicine(napa));
    const entry = { medicineId: String(medicine._id), note: "" };
    await unwrap(stockIn({ ...entry, boxes: 50 }));
    await unwrap(stockIn({ ...entry, boxes: 20 }));

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(700);
  });

  it("records the entry with the snapshotted pata count", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await unwrap(stockIn({
      medicineId: String(medicine._id),
      boxes: 50,
      note: "Beximco delivery",
    }));

    const entries = await StockEntryModel.find();
    expect(entries).toHaveLength(1);
    expect(entries[0].boxes).toBe(50);
    expect(entries[0].patasAdded).toBe(500);
    expect(entries[0].note).toBe("Beximco delivery");
  });

  // createdBy must come from the authenticated session, never from the
  // caller-supplied input — this is the audit-trail spoofing hole the
  // guard closes. There is no `userId` field in the input at all any more:
  // stockIn derives it itself from requireAdminAction()'s session.
  it("stamps createdBy from the session, not from the input", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await unwrap(stockIn({
      medicineId: String(medicine._id),
      boxes: 50,
      note: "",
    }));

    const entries = await StockEntryModel.find();
    expect(entries).toHaveLength(1);
    expect(String(entries[0].createdBy)).toBe(ADMIN_USER_ID);
  });

  it("keeps the historical patasAdded when patasPerBox later changes, and a new entry uses the new pack size", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await unwrap(stockIn({
      medicineId: String(medicine._id),
      boxes: 10,
      note: "",
    }));

    // The pack size changes; history must not be retroactively rewritten.
    await MedicineModel.findByIdAndUpdate(medicine._id, {
      $set: { patasPerBox: 12 },
    });

    await unwrap(stockIn({
      medicineId: String(medicine._id),
      boxes: 10,
      note: "",
    }));

    const entries = await StockEntryModel.find().sort({ createdAt: 1 });
    expect(entries).toHaveLength(2);
    expect(entries[0].patasAdded).toBe(100);
    expect(entries[1].patasAdded).toBe(120);
  });

  it("rejects zero boxes", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await expect(
      unwrap(stockIn({ medicineId: String(medicine._id), boxes: 0, note: "" })),
    ).rejects.toThrow("Poriman 1 er kom hote parbe na");
  });

  it("rejects negative boxes", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await expect(
      unwrap(stockIn({ medicineId: String(medicine._id), boxes: -5, note: "" })),
    ).rejects.toThrow("Poriman 1 er kom hote parbe na");
  });

  it("rejects an unknown medicine and writes no entry", async () => {
    await expect(
      unwrap(stockIn({
        medicineId: "507f1f77bcf86cd799439011",
        boxes: 5,
        note: "",
      })),
    ).rejects.toThrow("Medicine not found");
    expect(await StockEntryModel.countDocuments()).toBe(0);
  });
});

describe("stockIn input validation", () => {
  it("rejects a malformed medicineId instead of throwing a raw CastError", async () => {
    await expect(
      unwrap(stockIn({
        medicineId: "not-an-object-id",
        boxes: 5,
        note: "",
      })),
    ).rejects.toThrow("Medicine not found");
    expect(await StockEntryModel.countDocuments()).toBe(0);
  });

  it("rejects non-integer boxes", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await expect(
      unwrap(stockIn({ medicineId: String(medicine._id), boxes: 1.5, note: "" })),
    ).rejects.toThrow("Poriman 1 er kom hote parbe na");
  });

  it("rejects a non-string note instead of crashing on .trim()", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await expect(
      unwrap(stockIn({
        medicineId: String(medicine._id),
        boxes: 5,
        note: 12345 as unknown as string,
      })),
    ).rejects.toThrow("note must be a string");
    expect(await StockEntryModel.countDocuments()).toBe(0);
  });
});

describe("stockIn transactional rollback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rolls back the stock increment when the StockEntry write fails inside the transaction", async () => {
    const medicine = await unwrap(createMedicine(napa));

    vi.spyOn(StockEntryModel, "create").mockImplementationOnce(() => {
      throw new Error("Simulated failure after the increment landed");
    });

    await expect(
      unwrap(stockIn({
        medicineId: String(medicine._id),
        boxes: 50,
        note: "",
      })),
    ).rejects.toThrow("Simulated failure after the increment landed");

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(0);
    expect(await StockEntryModel.countDocuments()).toBe(0);
  });

  it("aborts and writes no entry when the medicine is deleted between the read and the transaction", async () => {
    const medicine = await unwrap(createMedicine(napa));
    const originalStartSession = mongoose.startSession.bind(mongoose);

    vi.spyOn(mongoose, "startSession").mockImplementationOnce(async (...args) => {
      // Simulate a delete landing in the window between stockIn's
      // pre-transaction findById and the transaction actually starting.
      await MedicineModel.deleteOne({ _id: medicine._id });
      return originalStartSession(...args);
    });

    await expect(
      unwrap(stockIn({
        medicineId: String(medicine._id),
        boxes: 50,
        note: "",
      })),
    ).rejects.toThrow("Medicine not found");

    expect(await StockEntryModel.countDocuments()).toBe(0);
  });
});

describe("listStockEntries", () => {
  it("returns entries newest first", async () => {
    const medicine = await unwrap(createMedicine(napa));
    const base = { medicineId: String(medicine._id), note: "" };
    await unwrap(stockIn({ ...base, boxes: 1 }));
    await unwrap(stockIn({ ...base, boxes: 2 }));

    const entries = await listStockEntries();
    expect(entries[0].boxes).toBe(2);
    expect(entries[1].boxes).toBe(1);
  });
});

// stockIn/listStockEntries are network-reachable Server Actions with no page
// render in front of them — an unauthenticated (or buyer-role) caller must
// never be able to invoke them, and in particular must never be able to
// stamp a StockEntry.createdBy of their choosing. This must fail against a
// version of src/actions/stock.ts that doesn't call requireAdminAction().
describe("authorization", () => {
  it("stockIn rejects an unauthenticated caller and writes no entry", async () => {
    const medicine = await unwrap(createMedicine(napa));
    clearSessionCookie(cookieStore);

    await expect(
      unwrap(stockIn({ medicineId: String(medicine._id), boxes: 5, note: "" })),
    ).rejects.toThrow(ADMIN_ONLY_ERROR);
    expect(await StockEntryModel.countDocuments()).toBe(0);
  });

  it("stockIn rejects a buyer-role session and writes no entry", async () => {
    const medicine = await unwrap(createMedicine(napa));
    setSessionCookie(cookieStore, await buyerToken());

    await expect(
      unwrap(stockIn({ medicineId: String(medicine._id), boxes: 5, note: "" })),
    ).rejects.toThrow(ADMIN_ONLY_ERROR);
    expect(await StockEntryModel.countDocuments()).toBe(0);
  });

  it("listStockEntries rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(listStockEntries()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("listStockEntries rejects a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(listStockEntries()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});
