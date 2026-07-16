import { describe, it, expect, beforeAll } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { getSettings, updateSettings } from "@/actions/settings";
import { SettingsModel } from "@/models/Settings";

setupTestDb();

// Bridge: setupTestDb() connects mongoose directly against the in-memory
// replica set, but connectDb() (called by the actions under test) tracks its
// own connection on globalThis._mongooseCache and only (re)connects there,
// requiring MONGODB_URI to do so. Without this, every action call would fail
// with "MONGODB_URI is not set" even though mongoose is already connected.
// Seeding the cache with the already-open connection makes connectDb() a
// no-op short-circuit, matching how tests/lib/db.test.ts already pokes this
// same global for equivalent reasons.
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};
const globalWithMongoose = globalThis as typeof globalThis & {
  _mongooseCache?: MongooseCache;
};
beforeAll(() => {
  // db.ts closures over this object at import time and only ever mutates its
  // fields in place (see tests/lib/db.test.ts's resetMongooseCache) —
  // reassigning globalThis._mongooseCache to a new object would not be seen
  // by that closure, so the existing object's fields must be set directly.
  const cache = globalWithMongoose._mongooseCache;
  if (cache) {
    cache.conn = mongoose;
    cache.promise = Promise.resolve(mongoose);
  }
});

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
