import { describe, it, expect } from "vitest";
import {
  MEDICINE_FORMS,
  DEFAULT_MEDICINE_FORM,
  isMedicineForm,
  toMedicineForm,
  isPieceOnlyForm,
  unitLabelsFor,
  capitalize,
} from "@/lib/unitLabels";

describe("unitLabelsFor", () => {
  it("gives tablets the box/pata wording", () => {
    expect(unitLabelsFor("tablet")).toEqual({
      formLabel: "Tablet / Capsule",
      outer: "box",
      inner: "pata",
      outerShort: "bx",
      innerShort: "pt",
    });
  });

  it("gives syrups the piece wording", () => {
    const labels = unitLabelsFor("syrup");
    expect(labels.formLabel).toBe("Syrup");
    expect(labels.outer).toBe("piece");
    expect(labels.inner).toBe("piece");
    expect(labels.outerShort).toBe("pc");
    expect(labels.innerShort).toBe("pc");
  });

  it("names the inner unit per form", () => {
    expect(unitLabelsFor("injection").inner).toBe("vial");
    expect(unitLabelsFor("cream").inner).toBe("tube");
    expect(unitLabelsFor("drops").inner).toBe("piece");
  });

  // A medicine saved before `form` existed comes back from a .lean() query
  // with no form at all — Mongoose applies schema defaults when it builds a
  // document, not when a lean query hands back raw BSON. Those are all
  // tablets, and a page must never break over a cosmetic field.
  it("falls back to tablet wording for missing or unknown values", () => {
    for (const bad of [undefined, null, "", "  ", "ointment", 7, {}, []]) {
      expect(unitLabelsFor(bad)).toEqual(unitLabelsFor("tablet"));
    }
  });

  it("has an entry for every declared form", () => {
    for (const form of MEDICINE_FORMS) {
      const labels = unitLabelsFor(form);
      expect(labels.formLabel.length).toBeGreaterThan(0);
      expect(labels.outer.length).toBeGreaterThan(0);
      expect(labels.inner.length).toBeGreaterThan(0);
      expect(labels.outerShort.length).toBeGreaterThan(0);
      expect(labels.innerShort.length).toBeGreaterThan(0);
    }
  });

  it("keeps every word lowercase, so call sites control capitalisation", () => {
    for (const form of MEDICINE_FORMS) {
      const { outer, inner, outerShort, innerShort } = unitLabelsFor(form);
      for (const word of [outer, inner, outerShort, innerShort]) {
        expect(word).toBe(word.toLowerCase());
      }
    }
  });

  it("keeps the invoice abbreviations short enough for 80mm paper", () => {
    for (const form of MEDICINE_FORMS) {
      const { outerShort, innerShort } = unitLabelsFor(form);
      expect(outerShort.length).toBeLessThanOrEqual(3);
      expect(innerShort.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("isMedicineForm", () => {
  it("accepts every declared form", () => {
    for (const form of MEDICINE_FORMS) {
      expect(isMedicineForm(form)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const bad of [undefined, null, "", "ointment", "TABLET", 7, {}]) {
      expect(isMedicineForm(bad)).toBe(false);
    }
  });
});

describe("toMedicineForm", () => {
  it("passes a valid form through", () => {
    expect(toMedicineForm("syrup")).toBe("syrup");
  });

  it("narrows anything else to the default", () => {
    expect(toMedicineForm(undefined)).toBe(DEFAULT_MEDICINE_FORM);
    expect(toMedicineForm("ointment")).toBe("tablet");
  });
});

describe("capitalize", () => {
  it("uppercases the first letter only", () => {
    expect(capitalize("carton")).toBe("Carton");
    expect(capitalize("pata")).toBe("Pata");
  });

  it("handles an empty string without throwing", () => {
    expect(capitalize("")).toBe("");
  });
});

describe("isPieceOnlyForm", () => {
  it("identifies piece-only forms", () => {
    expect(isPieceOnlyForm("other")).toBe(true);
    expect(isPieceOnlyForm("syrup")).toBe(true);
    expect(isPieceOnlyForm("tablet")).toBe(false);
    expect(isPieceOnlyForm("injection")).toBe(false);
    expect(isPieceOnlyForm("cream")).toBe(false);
    expect(isPieceOnlyForm("drops")).toBe(false);
  });
});

