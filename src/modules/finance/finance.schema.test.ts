import { describe, expect, it } from "vitest";
import {
  accountArchiveSchema,
  transactionCancelSchema,
  transactionSchema,
} from "./finance.schema.js";

describe("finance validation", () => {
  it("keeps conversion metadata optional for same-currency transactions", () => {
    const input = transactionSchema.parse({
      type: "EXPENSE",
      sourceAccountId: "11111111-1111-4111-8111-111111111111",
      amount: 45_000,
      currency: "IDR",
      description: "Makan siang",
    });

    expect(input.amount).toBe(45_000);
    expect(input.conversionFee).toBeUndefined();
  });

  it("requires a cancellation reason", () => {
    expect(() => transactionCancelSchema.parse({ reason: "" })).toThrow();
  });

  it("supports moving account balance to unallocated funds", () => {
    const input = accountArchiveSchema.parse({
      useUnallocatedFunds: true,
      reason: "Rekening ditutup",
    });

    expect(input.useUnallocatedFunds).toBe(true);
  });
});
