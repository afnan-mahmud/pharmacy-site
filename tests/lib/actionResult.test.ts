import { describe, it, expect } from "vitest";
import { actionResult } from "@/lib/actionResult";

describe("actionResult", () => {
  it("wraps a successful value", async () => {
    expect(await actionResult(async () => 42)).toEqual({ ok: true, data: 42 });
  });

  it("passes a null result through as success", async () => {
    // getX() actions legitimately resolve to null; that is not a failure.
    expect(await actionResult(async () => null)).toEqual({
      ok: true,
      data: null,
    });
  });

  // The whole point: Next.js replaces the message of any error thrown out of a
  // Server Action in production. A message the user is meant to read has to
  // come back as data instead.
  it("returns a thrown domain message as data", async () => {
    expect(
      await actionResult(async () => {
        throw new Error("Ei phone number already exists");
      }),
    ).toEqual({ ok: false, error: "Ei phone number already exists" });
  });

  it("falls back to a readable message for a non-Error throw", async () => {
    expect(
      await actionResult(async () => {
        throw "just a string";
      }),
    ).toEqual({ ok: false, error: "Kichu ekta bhul holo" });
  });

  it("does not swallow a redirect", async () => {
    // next/navigation's redirect() and notFound() work by throwing a control
    // -flow error that the framework must see. Catching it here would turn a
    // redirect into a silent failure message on the page it was leaving.
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });

    await expect(
      actionResult(async () => {
        throw redirectError;
      }),
    ).rejects.toBe(redirectError);
  });

  it("does not swallow a notFound", async () => {
    const notFoundError = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });

    await expect(
      actionResult(async () => {
        throw notFoundError;
      }),
    ).rejects.toBe(notFoundError);
  });
});
