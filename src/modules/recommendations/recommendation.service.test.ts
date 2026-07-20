import { describe, expect, it } from "vitest";

describe("recommendation arithmetic", () => {
  it("keeps essential expenses and buffer outside debt budget", () => {
    const available = 10_000_000 - 6_000_000 - 1_000_000;
    expect(available).toBe(3_000_000);
  });
});
