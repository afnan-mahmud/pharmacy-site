import { describe, it, expect } from "vitest";

describe("test infrastructure", () => {
  it("runs tests in the Asia/Dhaka timezone", () => {
    expect(process.env.TZ).toBe("Asia/Dhaka");
  });
});
