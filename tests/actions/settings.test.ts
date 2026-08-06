import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import { unwrap } from "../helpers/action";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
  buyerToken,
} from "../helpers/auth";
import { ADMIN_ONLY_ERROR } from "@/lib/session";
import { getSettings, updateSettings, readSettings } from "@/actions/settings";
import { SettingsModel } from "@/models/Settings";

function makeDuplicateKeyError(): Error & { code: number } {
  return Object.assign(new Error("E11000 duplicate key error collection: test.settings"), {
    code: 11000,
  });
}

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

// getSettings and updateSettings are admin-only work, so every test needs a
// valid admin session present unless it is specifically testing the guard.
beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

describe("getSettings", () => {
  it("creates the singleton with the placeholder name on first read", async () => {
    const settings = await getSettings();
    expect(settings.pharmacyName).toBe("Niramoy Pharmacy");
    expect(settings.invoicePrefix).toBe("NP");
  });

  it("never creates a second settings document", async () => {
    await getSettings();
    await getSettings();
    expect(await SettingsModel.countDocuments()).toBe(1);
  });

  it("returns the stored settings once they exist", async () => {
    await unwrap(updateSettings({
      pharmacyName: "Real Pharmacy",
      address: "123 Road, Dhaka",
      phone: "01700000000",
      invoicePrefix: "RP",
    }));
    const settings = await getSettings();
    expect(settings.pharmacyName).toBe("Real Pharmacy");
  });
});

describe("readSettings", () => {
  it("returns the schema defaults with no admin session and no document yet", async () => {
    clearSessionCookie(cookieStore);
    const settings = await readSettings();
    expect(settings.pharmacyName).toBe("Niramoy Pharmacy");
    expect(settings.invoicePrefix).toBe("NP");
  });

  it("never creates a document as a side effect", async () => {
    clearSessionCookie(cookieStore);
    await readSettings();
    await readSettings();
    expect(await SettingsModel.countDocuments()).toBe(0);
  });

  it("returns the real stored values once an admin has saved them, with no session required", async () => {
    await unwrap(updateSettings({
      pharmacyName: "Real Pharmacy",
      address: "123 Road, Dhaka",
      phone: "01700000000",
      invoicePrefix: "RP",
    }));

    clearSessionCookie(cookieStore);
    const settings = await readSettings();
    expect(settings.pharmacyName).toBe("Real Pharmacy");
    expect(settings.invoicePrefix).toBe("RP");
  });

  it("works identically for a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    const settings = await readSettings();
    expect(settings.pharmacyName).toBe("Niramoy Pharmacy");
  });
});

describe("updateSettings", () => {
  it("updates the name without creating a duplicate", async () => {
    await getSettings();
    await unwrap(updateSettings({
      pharmacyName: "New Name",
      address: "Somewhere",
      phone: "01800000000",
      invoicePrefix: "NN",
    }));
    expect(await SettingsModel.countDocuments()).toBe(1);
    const settings = await getSettings();
    expect(settings.pharmacyName).toBe("New Name");
  });

  it("rejects an empty pharmacy name", async () => {
    await expect(
      unwrap(updateSettings({
        pharmacyName: "  ",
        address: "x",
        phone: "y",
        invoicePrefix: "Z",
      })),
    ).rejects.toThrow("Pharmacy name is required");
  });

  it("rejects an empty invoice prefix", async () => {
    await expect(
      unwrap(updateSettings({
        pharmacyName: "Name",
        address: "x",
        phone: "y",
        invoicePrefix: "",
      })),
    ).rejects.toThrow("Invoice prefix is required");
  });

  // Trust-boundary hardening (Fix 3): pharmacyName was `.trim()`-ed with no
  // type check, so a non-string value reached it as a raw TypeError instead
  // of a clean domain error.
  it("rejects a non-string pharmacyName instead of crashing on .trim()", async () => {
    await expect(
      unwrap(updateSettings({
        pharmacyName: 123 as unknown as string,
        address: "x",
        phone: "y",
        invoicePrefix: "NN",
      })),
    ).rejects.toThrow("Pharmacy name is required");
  });

  // address/phone default to "" on the schema, so an omitted value should
  // behave like a direct model write, not crash — same leniency
  // medicines.ts's toOptionalString gives genericName/company.
  it("accepts an omitted address and phone, saving them as empty strings", async () => {
    const settings = await unwrap(updateSettings({
      pharmacyName: "No Address Pharmacy",
      invoicePrefix: "NN",
    } as unknown as Parameters<typeof updateSettings>[0]));
    expect(settings.address).toBe("");
    expect(settings.phone).toBe("");
  });

  it("saves and returns proprietorName and logoUrl", async () => {
    const settings = await unwrap(updateSettings({
      pharmacyName: "Proprietor Pharmacy",
      proprietorName: "Md. Rafiqul Islam",
      logoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      address: "Dhaka",
      phone: "01711111111",
      invoicePrefix: "PP",
    }));
    expect(settings.proprietorName).toBe("Md. Rafiqul Islam");
    expect(settings.logoUrl).toBe("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
  });

  it("rejects a non-string logoUrl instead of crashing on .trim()", async () => {
    await expect(
      unwrap(updateSettings({
        pharmacyName: "Name",
        logoUrl: 123 as unknown as string,
        address: "x",
        phone: "y",
        invoicePrefix: "NN",
      })),
    ).rejects.toThrow("logoUrl must be a string");
  });

  it("rejects a non-string proprietorName instead of crashing on .trim()", async () => {
    await expect(
      unwrap(updateSettings({
        pharmacyName: "Name",
        proprietorName: 123 as unknown as string,
        address: "x",
        phone: "y",
        invoicePrefix: "NN",
      })),
    ).rejects.toThrow("proprietorName must be a string");
  });

  it("rejects a non-string address instead of crashing on .trim()", async () => {
    await expect(
      unwrap(updateSettings({
        pharmacyName: "Name",
        address: 42 as unknown as string,
        phone: "y",
        invoicePrefix: "NN",
      })),
    ).rejects.toThrow("address must be a string");
  });

  describe("invoicePrefix charset/length", () => {
    it("rejects a prefix shorter than 2 characters", async () => {
      await expect(
        unwrap(updateSettings({
          pharmacyName: "Name",
          address: "",
          phone: "",
          invoicePrefix: "A",
        })),
      ).rejects.toThrow("Invoice prefix 2-8 character hote hobe");
    });

    it("rejects a prefix longer than 8 characters", async () => {
      await expect(
        unwrap(updateSettings({
          pharmacyName: "Name",
          address: "",
          phone: "",
          invoicePrefix: "ABCDEFGHI",
        })),
      ).rejects.toThrow("Invoice prefix 2-8 character hote hobe");
    });

    it("rejects a prefix containing a dash or space", async () => {
      await expect(
        unwrap(updateSettings({
          pharmacyName: "Name",
          address: "",
          phone: "",
          invoicePrefix: "AB-1",
        })),
      ).rejects.toThrow("Invoice prefix 2-8 character hote hobe");

      await expect(
        unwrap(updateSettings({
          pharmacyName: "Name",
          address: "",
          phone: "",
          invoicePrefix: "A B",
        })),
      ).rejects.toThrow("Invoice prefix 2-8 character hote hobe");
    });

    it("normalizes a lowercase prefix to uppercase instead of rejecting it", async () => {
      const settings = await unwrap(updateSettings({
        pharmacyName: "Name",
        address: "",
        phone: "",
        invoicePrefix: "np",
      }));
      expect(settings.invoicePrefix).toBe("NP");
    });
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
      expect(settings.pharmacyName).toBe("Niramoy Pharmacy");
      expect(settings.invoicePrefix).toBe("NP");
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
      unwrap(updateSettings(input)),
      unwrap(updateSettings(input)),
      unwrap(updateSettings(input)),
      unwrap(updateSettings(input)),
      unwrap(updateSettings(input)),
      unwrap(updateSettings(input)),
      unwrap(updateSettings(input)),
      unwrap(updateSettings(input)),
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
    expect(settings.pharmacyName).toBe("Niramoy Pharmacy");
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

    const settings = await unwrap(updateSettings({
      pharmacyName: "Retried Pharmacy",
      address: "2 Retry Avenue",
      phone: "01911111111",
      invoicePrefix: "RT",
    }));

    expect(calls).toBe(2);
    expect(settings.pharmacyName).toBe("Retried Pharmacy");
    expect(await SettingsModel.countDocuments()).toBe(1);
  });
});

// getSettings/updateSettings are network-reachable Server Actions with no
// page render in front of them — an unauthenticated (or buyer-role) caller
// must never be able to invoke them. This must fail against a version of
// src/actions/settings.ts that doesn't call requireAdminAction().
describe("authorization", () => {
  it("getSettings rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(getSettings()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("getSettings rejects a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(getSettings()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("updateSettings rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(
      unwrap(updateSettings({
        pharmacyName: "Hacked Pharmacy",
        address: "",
        phone: "",
        invoicePrefix: "HK",
      })),
    ).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("updateSettings rejects a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(
      unwrap(updateSettings({
        pharmacyName: "Hacked Pharmacy",
        address: "",
        phone: "",
        invoicePrefix: "HK",
      })),
    ).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});

/**
 * The logo is a string on the settings document, and both layouts read it —
 * so whatever is stored rides along with every page render for every user.
 * Validated as "a string" and nothing else, one paste put a multi-megabyte
 * data URI on every screen in the app.
 */
describe("logo size and shape", () => {
  const base = {
    pharmacyName: "Niramoy Pharmacy",
    address: "Mirpur",
    phone: "01711111111",
    invoicePrefix: "NP",
  };

  const dataUri = (bytes: number) =>
    "data:image/webp;base64," + "A".repeat(bytes);

  it("accepts a logo of a reasonable size", async () => {
    // Around what the form's 360px WebP re-encode actually produces.
    const settings = await unwrap(
      updateSettings({ ...base, logoUrl: dataUri(60 * 1024) }),
    );
    expect(settings.logoUrl.length).toBeGreaterThan(60 * 1024);
  });

  it("refuses one that would weigh down every page, and says how big it is", async () => {
    await expect(
      unwrap(updateSettings({ ...base, logoUrl: dataUri(400 * 1024) })),
    ).rejects.toThrow(/onek boro \(4\d\dKB\)/);
  });

  it("keeps the stored logo when an oversized one is refused", async () => {
    const good = dataUri(1024);
    await unwrap(updateSettings({ ...base, logoUrl: good }));
    await expect(
      unwrap(updateSettings({ ...base, logoUrl: dataUri(400 * 1024) })),
    ).rejects.toThrow();

    const settings = await readSettings();
    expect(settings.logoUrl).toBe(good);
  });

  it("accepts an http(s) link, which the form also allows typing", async () => {
    const settings = await unwrap(
      updateSettings({ ...base, logoUrl: "https://example.com/logo.png" }),
    );
    expect(settings.logoUrl).toBe("https://example.com/logo.png");
  });

  it("refuses a string that is neither an image nor a link", async () => {
    for (const junk of ["just some text", "ftp://example.com/a.png", "data:text/html;base64,AAAA"]) {
      await expect(
        unwrap(updateSettings({ ...base, logoUrl: junk })),
      ).rejects.toThrow("image file upload korun");
    }
  });

  it("still treats no logo as a normal setting", async () => {
    const settings = await unwrap(updateSettings({ ...base, logoUrl: "   " }));
    expect(settings.logoUrl).toBe("");
  });
});
