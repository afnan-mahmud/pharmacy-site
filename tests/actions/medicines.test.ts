import { describe, it, expect } from "vitest";
import { setupTestDb } from "../helpers/db";
import {
  createMedicine,
  updateMedicine,
  listMedicines,
  searchMedicines,
  deactivateMedicine,
} from "@/actions/medicines";

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

describe("createMedicine", () => {
  it("creates a medicine with zero stock", async () => {
    const medicine = await createMedicine(napa);
    expect(medicine.name).toBe("Napa 500mg");
    expect(medicine.stockPatas).toBe(0);
    expect(medicine.active).toBe(true);
  });

  it("stores both the box rate and the pata rate", async () => {
    const medicine = await createMedicine(napa);
    expect(medicine.boxPricePaisa).toBe(12000);
    expect(medicine.pataPricePaisa).toBe(1400);
  });

  it("rejects an empty name", async () => {
    await expect(createMedicine({ ...napa, name: "  " })).rejects.toThrow(
      "Medicine name is required",
    );
  });

  it("rejects a duplicate name", async () => {
    await createMedicine(napa);
    await expect(createMedicine(napa)).rejects.toThrow("already exists");
  });

  it("treats duplicate names case-insensitively", async () => {
    await createMedicine(napa);
    await expect(
      createMedicine({ ...napa, name: "NAPA 500MG" }),
    ).rejects.toThrow("already exists");
  });

  it("rejects patasPerBox below 1", async () => {
    await expect(createMedicine({ ...napa, patasPerBox: 0 })).rejects.toThrow(
      "patasPerBox must be at least 1",
    );
  });

  it("rejects negative prices", async () => {
    await expect(
      createMedicine({ ...napa, boxPricePaisa: -1 }),
    ).rejects.toThrow("cannot be negative");
  });
});

describe("listMedicines", () => {
  it("returns active medicines sorted by name", async () => {
    await createMedicine({ ...napa, name: "Zimax" });
    await createMedicine({ ...napa, name: "Ace" });
    const list = await listMedicines();
    expect(list.map((m) => m.name)).toEqual(["Ace", "Zimax"]);
  });

  it("excludes deactivated medicines", async () => {
    const medicine = await createMedicine(napa);
    await deactivateMedicine(String(medicine._id));
    expect(await listMedicines()).toHaveLength(0);
  });

  it("filters by a name query", async () => {
    await createMedicine({ ...napa, name: "Napa Extra" });
    await createMedicine({ ...napa, name: "Zimax" });
    const list = await listMedicines("napa");
    expect(list.map((m) => m.name)).toEqual(["Napa Extra"]);
  });
});

describe("searchMedicines", () => {
  it("matches on a partial name, case-insensitively", async () => {
    await createMedicine(napa);
    const results = await searchMedicines("nap");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Napa 500mg");
  });

  it("matches on the generic name", async () => {
    await createMedicine(napa);
    const results = await searchMedicines("paracet");
    expect(results).toHaveLength(1);
  });

  it("returns nothing for an empty query", async () => {
    await createMedicine(napa);
    expect(await searchMedicines("")).toEqual([]);
  });

  it("respects the limit", async () => {
    for (let i = 0; i < 15; i++) {
      await createMedicine({ ...napa, name: `Napa ${i}` });
    }
    expect(await searchMedicines("napa", 10)).toHaveLength(10);
  });

  it("does not leak a regex from the query into the match", async () => {
    await createMedicine(napa);
    // A user typing ".*" must not match everything.
    expect(await searchMedicines(".*")).toEqual([]);
  });
});

describe("updateMedicine", () => {
  it("updates prices", async () => {
    const medicine = await createMedicine(napa);
    const updated = await updateMedicine(String(medicine._id), {
      ...napa,
      boxPricePaisa: 13000,
    });
    expect(updated.boxPricePaisa).toBe(13000);
  });

  it("does not touch stock", async () => {
    const medicine = await createMedicine(napa);
    const updated = await updateMedicine(String(medicine._id), {
      ...napa,
      name: "Napa 665mg",
    });
    expect(updated.stockPatas).toBe(0);
  });

  it("throws for an unknown id", async () => {
    await expect(
      updateMedicine("507f1f77bcf86cd799439011", napa),
    ).rejects.toThrow("Medicine not found");
  });
});
