import { describe, expect, it } from "vitest";
import {
  allocateDebtPayment,
  calculateDebtHealth,
  calculatePenalty,
  generateDebtSchedule,
} from "./debt-calculation.service.js";

describe("generateDebtSchedule", () => {
  it("membuat jadwal tanpa bunga", () => {
    const result = generateDebtSchedule({
      principal: 12_000_000,
      tenorMonths: 12,
      firstDueDate: new Date("2026-08-20T00:00:00.000Z"),
      interestMethod: "NONE",
    });
    expect(result.installments).toHaveLength(12);
    expect(result.totalPrincipal).toBe(12_000_000);
    expect(result.totalInterest).toBe(0);
    expect(result.installments[0]?.baseInstallment).toBe(1_000_000);
  });

  it("menghitung bunga flat tetap", () => {
    const result = generateDebtSchedule({
      principal: 100_000_000,
      tenorMonths: 24,
      firstDueDate: new Date("2026-08-20T00:00:00.000Z"),
      interestMethod: "FLAT",
      annualInterestRate: 12,
    });
    expect(result.installments[0]?.interest).toBe(1_000_000);
    expect(result.installments[23]?.interest).toBe(1_000_000);
    expect(result.totalInterest).toBe(24_000_000);
  });

  it("menghitung bunga efektif yang menurun", () => {
    const result = generateDebtSchedule({
      principal: 12_000_000,
      tenorMonths: 12,
      firstDueDate: new Date("2026-08-20T00:00:00.000Z"),
      interestMethod: "EFFECTIVE",
      annualInterestRate: 12,
    });
    expect(result.installments[0]!.interest).toBeGreaterThan(
      result.installments[11]!.interest,
    );
    expect(result.installments[0]?.interest).toBe(120_000);
  });

  it("menghitung anuitas dengan cicilan dasar stabil", () => {
    const result = generateDebtSchedule({
      principal: 100_000_000,
      tenorMonths: 12,
      firstDueDate: new Date("2026-08-20T00:00:00.000Z"),
      interestMethod: "ANNUITY",
      annualInterestRate: 12,
    });
    expect(result.installments[0]!.baseInstallment).toBeCloseTo(
      result.installments[1]!.baseInstallment,
      0,
    );
    expect(result.installments[0]!.interest).toBeGreaterThan(
      result.installments[11]!.interest,
    );
    expect(result.installments[11]?.closingPrincipal).toBe(0);
  });

  it("menandai estimasi saat hanya cicilan kontrak diketahui", () => {
    const result = generateDebtSchedule({
      principal: 100_000_000,
      tenorMonths: 24,
      firstDueDate: new Date("2026-08-20T00:00:00.000Z"),
      interestMethod: "MANUAL_CONTRACT",
      contractBaseInstallment: 5_000_000,
    });
    expect(result.estimated).toBe(true);
    expect(result.totalInterest).toBe(20_000_000);
  });

  it("memisahkan pokok 14 juta dari kontrak 1,5 juta selama 12 bulan", () => {
    const result = generateDebtSchedule({
      principal: 14_000_000,
      tenorMonths: 12,
      firstDueDate: new Date("2026-08-20T00:00:00.000Z"),
      interestMethod: "MANUAL_CONTRACT",
      contractBaseInstallment: 1_500_000,
    });

    expect(result.totalPrincipal).toBe(14_000_000);
    expect(result.totalContractPayment).toBe(18_000_000);
    expect(result.totalInterest).toBe(4_000_000);
    expect(result.averageMonthlyInterest).toBe(333_333.33);
    expect(result.installments[0]?.baseInstallment).toBeCloseTo(1_500_000, 0);
  });
});

describe("calculatePenalty", () => {
  const base = {
    installmentId: "installment-1",
    dueDate: new Date("2026-07-10T00:00:00.000Z"),
    asOf: new Date("2026-07-20T00:00:00.000Z"),
    baseInstallment: 1_000_000,
    outstandingInstallment: 1_000_000,
    arrears: 1_000_000,
    remainingPrincipal: 10_000_000,
  };

  it("menghitung denda fixed sekali", () => {
    const result = calculatePenalty({
      ...base,
      rule: {
        calculationType: "FIXED_ONCE",
        postingStrategy: "END_OF_TENOR",
        amount: 100_000,
      },
    });
    expect(result.calculatedAmount).toBe(100_000);
    expect(result.postingStrategy).toBe("END_OF_TENOR");
  });

  it("menghitung denda harian setelah masa tenggang", () => {
    const result = calculatePenalty({
      ...base,
      rule: {
        calculationType: "FIXED_PER_DAY",
        postingStrategy: "NEXT_INSTALLMENT",
        amount: 10_000,
        graceDays: 3,
      },
    });
    expect(result.chargeableDays).toBe(7);
    expect(result.calculatedAmount).toBe(70_000);
  });

  it("menerapkan batas maksimal denda", () => {
    const result = calculatePenalty({
      ...base,
      rule: {
        calculationType: "PERCENTAGE_PER_DAY",
        postingStrategy: "CURRENT_OVERDUE_BILL",
        ratePercent: 1,
        percentageBase: "OUTSTANDING_INSTALLMENT",
        maxAmount: 50_000,
      },
    });
    expect(result.calculatedAmount).toBe(50_000);
  });

  it("tidak mengenakan denda atas denda secara default", () => {
    const result = calculatePenalty({
      ...base,
      existingPenalty: 500_000,
      rule: {
        calculationType: "PERCENTAGE_ONCE",
        postingStrategy: "CURRENT_OVERDUE_BILL",
        ratePercent: 10,
        percentageBase: "OUTSTANDING_INSTALLMENT",
      },
    });
    expect(result.calculationBase).toBe(1_000_000);
    expect(result.calculatedAmount).toBe(100_000);
  });
});

describe("allocateDebtPayment", () => {
  it("mengalokasikan denda, tunggakan, bunga lalu pokok", () => {
    const result = allocateDebtPayment({
      amount: 1_500_000,
      duePenalty: 100_000,
      arrears: 300_000,
      interest: 200_000,
      fees: 0,
      principal: 1_000_000,
    });
    expect(result.allocations).toEqual({
      DUE_PENALTY: 100_000,
      ARREARS: 300_000,
      INTEREST: 200_000,
      FEES: 0,
      PRINCIPAL: 900_000,
      DEFERRED_PENALTY: 0,
    });
    expect(result.installmentFullyPaid).toBe(false);
  });

  it("dapat membayar denda saja", () => {
    const result = allocateDebtPayment({
      amount: 100_000,
      duePenalty: 100_000,
      arrears: 300_000,
      interest: 200_000,
      fees: 0,
      principal: 900_000,
      allowedComponents: ["DUE_PENALTY"],
    });
    expect(result.allocations.DUE_PENALTY).toBe(100_000);
    expect(result.allocations.PRINCIPAL).toBe(0);
  });
});

describe("calculateDebtHealth", () => {
  it("menghasilkan DATA BELUM CUKUP", () => {
    const result = calculateDebtHealth({
      monthlyDebtService: 2_000_000,
      overdueInstallments: 0,
      maxLateDays: 0,
      activePenalty: 0,
      nextPaymentAmount: 2_000_000,
    });
    expect(result.status).toBe("INSUFFICIENT_DATA");
  });

  it("menghasilkan perlu perhatian dengan alasan", () => {
    const result = calculateDebtHealth({
      monthlyNetIncome: 10_000_000,
      mandatoryExpenses: 4_000_000,
      monthlyDebtService: 3_600_000,
      overdueInstallments: 1,
      maxLateDays: 5,
      activePenalty: 150_000,
      nextPaymentAmount: 3_600_000,
      availableCash: 4_000_000,
    });
    expect(result.status).toBe("NEEDS_ATTENTION");
    expect(result.debtServiceRatio).toBe(36);
    expect(result.reasons.some((reason) => reason.includes("36%"))).toBe(true);
  });

  it("menghasilkan kritis saat DSR di atas 50%", () => {
    const result = calculateDebtHealth({
      monthlyNetIncome: 10_000_000,
      mandatoryExpenses: 3_000_000,
      monthlyDebtService: 5_500_000,
      overdueInstallments: 0,
      maxLateDays: 0,
      activePenalty: 0,
      nextPaymentAmount: 5_500_000,
    });
    expect(result.status).toBe("CRITICAL");
  });
});
