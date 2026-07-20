import { describe, expect, it } from "vitest";
import { resolveReportPeriod } from "./report.period.js";
import { reportQuerySchema } from "./report.schema.js";

describe("resolveReportPeriod", () => {
  const reference = new Date("2026-07-20T05:00:00.000Z");

  it("uses the user timezone for today", () => {
    const query = reportQuerySchema.parse({ preset: "TODAY" });
    const result = resolveReportPeriod(query, "Asia/Jakarta", 1, reference);

    expect(result.from?.toISOString()).toBe("2026-07-19T17:00:00.000Z");
    expect(result.to?.toISOString()).toBe("2026-07-20T16:59:59.999Z");
  });

  it("uses Monday as configurable start of week", () => {
    const query = reportQuerySchema.parse({ preset: "THIS_WEEK" });
    const result = resolveReportPeriod(query, "Asia/Jakarta", 1, reference);

    expect(result.from?.toISOString()).toBe("2026-07-19T17:00:00.000Z");
    expect(result.to?.toISOString()).toBe("2026-07-26T16:59:59.999Z");
  });

  it("resolves a selected month", () => {
    const query = reportQuerySchema.parse({ preset: "MONTH", month: "2026-06" });
    const result = resolveReportPeriod(query, "Asia/Jakarta", 1, reference);

    expect(result.from?.toISOString()).toBe("2026-05-31T17:00:00.000Z");
    expect(result.to?.toISOString()).toBe("2026-06-30T16:59:59.999Z");
  });

  it("supports all-time reports", () => {
    const query = reportQuerySchema.parse({ preset: "ALL" });
    expect(resolveReportPeriod(query, "Asia/Jakarta", 1, reference)).toEqual({
      from: null,
      to: null,
      label: "Seluruh periode",
    });
  });
});
