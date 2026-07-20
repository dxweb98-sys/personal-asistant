import { describe, expect, it } from "vitest";
import { createDebtSchema, paymentSchema } from "./debt.schema.js";

describe("debt schemas", () => {
  it("accepts a fixed vehicle financing contract", () => {
    const result = createDebtSchema.safeParse({
      name: "Cicilan motor",
      creditor: "Leasing",
      kind: "VEHICLE_FINANCING",
      originalPrincipal: 14_000_000,
      paymentPolicy: "FIXED",
      fixedMonthlyAmount: 1_500_000,
      tenorMonths: 12,
      startDate: "2026-08-01",
      dueDay: 20,
      generateInstallments: true,
      priority: "URGENT",
      alreadyPaidAmount: 3_000_000,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a fixed contract whose installments do not cover principal", () => {
    const result = createDebtSchema.safeParse({
      name: "Cicilan motor",
      creditor: "Leasing",
      originalPrincipal: 14_000_000,
      paymentPolicy: "FIXED",
      fixedMonthlyAmount: 1_000_000,
      tenorMonths: 12,
      startDate: "2026-08-01",
      dueDay: 20,
      generateInstallments: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires a bank source identifier for every payment", () => {
    expect(
      paymentSchema.safeParse({
        amount: 1_500_000,
        installmentId: "1aca3c38-df7e-4bba-a020-a08946d8234d",
      }).success,
    ).toBe(false);
  });

  it("requires a schedule when an opening paid amount is supplied", () => {
    const result = createDebtSchema.safeParse({
      name: "Pinjaman lama",
      creditor: "Koperasi",
      originalPrincipal: 10_000_000,
      paymentPolicy: "FLEXIBLE",
      alreadyPaidAmount: 2_000_000,
    });

    expect(result.success).toBe(false);
  });
});
