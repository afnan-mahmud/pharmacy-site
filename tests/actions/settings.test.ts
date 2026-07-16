import { describe, it, expect } from "vitest";
import { setupTestDb } from "../helpers/db";
import { getSettings, updateSettings } from "@/actions/settings";
import { SettingsModel } from "@/models/Settings";

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
