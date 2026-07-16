import { describe, it, expect, vi, afterEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import { getSettings, updateSettings } from "@/actions/settings";
import { SettingsModel } from "@/models/Settings";

function makeDuplicateKeyError(): Error & { code: number } {
  return Object.assign(new Error("E11000 duplicate key error collection: test.settings"), {
    code: 11000,
  });
}

setupTestDb();

describe("getSettings", () => {
  it("creates the singleton with the placeholder name on first read", async () => {
    const settings = await getSettings();
    expect(settings.pharmacyName).toBe("ABC Pharmacy");
    expect(settings.invoicePrefix).toBe("ABC");
  });

  it("never creates a second settings document", async () => {
    await getSettings();
    await getSettings();
    expect(await SettingsModel.countDocuments()).toBe(1);
  });

  it("returns the stored settings once they exist", async () => {
    await updateSettings({
      pharmacyName: "Real Pharmacy",
      address: "123 Road, Dhaka",
      phone: "01700000000",
      invoicePrefix: "RP",
    });
    const settings = await getSettings();
    expect(settings.pharmacyName).toBe("Real Pharmacy");
  });
});

describe("updateSettings", () => {
  it("updates the name without creating a duplicate", async () => {
    await getSettings();
    await updateSettings({
      pharmacyName: "New Name",
      address: "Somewhere",
      phone: "01800000000",
      invoicePrefix: "NN",
    });
    expect(await SettingsModel.countDocuments()).toBe(1);
    const settings = await getSettings();
    expect(settings.pharmacyName).toBe("New Name");
  });

  it("rejects an empty pharmacy name", async () => {
    await expect(
      updateSettings({
        pharmacyName: "  ",
        address: "x",
        phone: "y",
        invoicePrefix: "Z",
      }),
    ).rejects.toThrow("Pharmacy name is required");
  });

  it("rejects an empty invoice prefix", async () => {
    await expect(
      updateSettings({
        pharmacyName: "Name",
        address: "x",
        phone: "y",
        invoicePrefix: "",
      }),
    ).rejects.toThrow("Invoice prefix is required");
  });
});

describe("concurrent access", () => {
  it("resolves concurrent getSettings() calls against an empty database to the same document", async () => {
    const results = await Promise.all([
      getSettings(),
      getSettings(),
      getSettings(),
      getSettings(),
      getSettings(),
      getSettings(),
      getSettings(),
      getSettings(),
    ]);

    const ids = new Set(results.map((r) => String((r as unknown as { _id: unknown })._id)));
    expect(ids.size).toBe(1);
    for (const settings of results) {
      expect(settings.pharmacyName).toBe("ABC Pharmacy");
      expect(settings.invoicePrefix).toBe("ABC");
    }
    expect(await SettingsModel.countDocuments()).toBe(1);
  });

  it("resolves concurrent updateSettings() calls against an empty database to the same document", async () => {
    const input = {
      pharmacyName: "Concurrent Pharmacy",
      address: "1 Race Road, Dhaka",
      phone: "01900000000",
      invoicePrefix: "CP",
    };

    const results = await Promise.all([
      updateSettings(input),
      updateSettings(input),
      updateSettings(input),
      updateSettings(input),
      updateSettings(input),
      updateSettings(input),
      updateSettings(input),
      updateSettings(input),
    ]);

    const ids = new Set(results.map((r) => String((r as unknown as { _id: unknown })._id)));
    expect(ids.size).toBe(1);
    for (const settings of results) {
      expect(settings.pharmacyName).toBe("Concurrent Pharmacy");
      expect(settings.invoicePrefix).toBe("CP");
    }
    expect(await SettingsModel.countDocuments()).toBe(1);
  });
});

describe("duplicate-key race handling (mocked)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getSettings retries and returns the existing document when findOneAndUpdate raises E11000", async () => {
    const original = SettingsModel.findOneAndUpdate.bind(SettingsModel);
    let calls = 0;
    vi.spyOn(SettingsModel, "findOneAndUpdate").mockImplementation((...args: unknown[]) => {
      calls += 1;
      if (calls === 1) {
        return { lean: () => Promise.reject(makeDuplicateKeyError()) } as unknown as ReturnType<
          typeof SettingsModel.findOneAndUpdate
        >;
      }
      // @ts-expect-error - forwarding to the real implementation for the retry
      return original(...args);
    });

    const settings = await getSettings();

    expect(calls).toBe(2);
    expect(settings.pharmacyName).toBe("ABC Pharmacy");
    expect(await SettingsModel.countDocuments()).toBe(1);
  });

  it("updateSettings retries and returns the existing document when findOneAndUpdate raises E11000", async () => {
    const original = SettingsModel.findOneAndUpdate.bind(SettingsModel);
    let calls = 0;
    vi.spyOn(SettingsModel, "findOneAndUpdate").mockImplementation((...args: unknown[]) => {
      calls += 1;
      if (calls === 1) {
        return { lean: () => Promise.reject(makeDuplicateKeyError()) } as unknown as ReturnType<
          typeof SettingsModel.findOneAndUpdate
        >;
      }
      // @ts-expect-error - forwarding to the real implementation for the retry
      return original(...args);
    });

    const settings = await updateSettings({
      pharmacyName: "Retried Pharmacy",
      address: "2 Retry Avenue",
      phone: "01911111111",
      invoicePrefix: "RT",
    });

    expect(calls).toBe(2);
    expect(settings.pharmacyName).toBe("Retried Pharmacy");
    expect(await SettingsModel.countDocuments()).toBe(1);
  });
});
