import { describe, expect, it } from "vitest";
import { simulateNewDebt } from "./debt-simulation.service.js";
import { debtSimulationSchema } from "./debt-simulation.schema.js";

describe("debt simulation API schema", () => {
  it("coerces API dates and provider tenor keys before calculation", () => {
    const input = debtSimulationSchema.parse({
      asOf: "2026-07-20T00:00:00.000Z",
      plan: {
        kind: "GOODS_CREDIT",
        name: "Laptop kerja",
        cashPriceOrLoanAmount: 18_000_000,
        downPayment: 3_000_000,
        interestMethod: "MANUAL_CONTRACT",
        tenors: [12],
        providerMonthlyPayments: { "12": 1_500_000 },
        firstInstallmentDate: "2026-08-20T00:00:00.000Z",
        dueDay: 20,
        needLevel: "IMPORTANT",
      },
      incomeSources: [
        {
          id: "salary",
          name: "Gaji",
          classification: "FIXED",
          active: true,
          configuredMonthlyAmount: 12_000_000,
        },
      ],
      savingsAccounts: [
        {
          id: "savings",
          name: "Tabungan",
          accountType: "SAVINGS",
          selected: true,
          balance: 20_000_000,
        },
      ],
      activeDebts: [],
      mandatoryExpenses: 5_000_000,
    });

    const result = simulateNewDebt(input);

    expect(input.asOf).toBeInstanceOf(Date);
    expect(input.plan.firstInstallmentDate).toBeInstanceOf(Date);
    expect(input.plan.providerMonthlyPayments?.[12]).toBe(1_500_000);
    expect(result.simulationOnly).toBe(true);
    expect(result.tenorComparisons[0]?.monthlyInstallment).toBe(1_500_000);
  });
});
