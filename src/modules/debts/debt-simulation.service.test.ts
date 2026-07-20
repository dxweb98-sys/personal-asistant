import { describe, expect, it } from "vitest";
import {
  applyUrgentOverride,
  calculateActiveDebtCommitments,
  calculateFixedIncome,
  calculateUsableSavings,
  simulateNewDebt,
} from "./debt-calculation.service.js";
import type { DebtSimulationInput } from "./debt-simulation.types.js";

function baseInput(): DebtSimulationInput {
  return {
    asOf: new Date("2026-07-20T00:00:00.000Z"),
    plan: {
      kind: "GOODS_CREDIT",
      name: "Handphone",
      itemCategory: "Handphone",
      brand: "Apple",
      model: "iPhone",
      cashPriceOrLoanAmount: 20_000_000,
      downPayment: 2_000_000,
      administrationFee: 200_000,
      insuranceFee: 0,
      additionalFee: 0,
      interestMethod: "MANUAL_CONTRACT",
      tenors: [6, 12, 18, 24],
      providerMonthlyPayments: {
        6: 3_400_000,
        12: 1_850_000,
        18: 1_350_000,
        24: 1_100_000,
      },
      firstInstallmentDate: new Date("2026-08-20T00:00:00.000Z"),
      dueDay: 20,
      needLevel: "IMPORTANT",
    },
    incomeSources: [
      {
        id: "salary",
        name: "Gaji bulanan",
        classification: "FIXED",
        active: true,
        configuredMonthlyAmount: 15_000_000,
        actualAverageMonthlyAmount: 15_000_000,
      },
      {
        id: "bonus",
        name: "Bonus",
        classification: "VARIABLE",
        active: true,
        configuredMonthlyAmount: 3_000_000,
      },
      {
        id: "sale",
        name: "Penjualan barang",
        classification: "ONE_TIME",
        active: true,
        configuredMonthlyAmount: 5_000_000,
      },
    ],
    savingsAccounts: [
      {
        id: "bank",
        name: "Tabungan BCA",
        accountType: "BANK",
        selected: true,
        balance: 30_000_000,
        emergencyFundProtected: 8_000_000,
        allocatedToOtherTargets: 2_000_000,
        upcomingBillsReserved: 1_000_000,
        minimumBalance: 1_000_000,
      },
      {
        id: "crypto",
        name: "Crypto",
        accountType: "CRYPTO",
        selected: true,
        balance: 50_000_000,
      },
    ],
    activeDebts: [
      {
        id: "vehicle",
        name: "Cicilan kendaraan",
        status: "CURRENT",
        priority: "MANDATORY",
        monthlyInstallment: 3_500_000,
        endDate: new Date("2026-11-20T00:00:00.000Z"),
      },
    ],
    mandatoryExpenses: 7_000_000,
    routineNeeds: 500_000,
    minimumMonthlySavings: 500_000,
    safetyBuffer: 500_000,
    emergencyNeedAmount: 2_000_000,
    flexibleBudgets: [
      {
        id: "dining",
        name: "Makan di luar",
        monthlyAmount: 800_000,
        maximumReducibleAmount: 500_000,
      },
      {
        id: "subscription",
        name: "Langganan digital",
        monthlyAmount: 300_000,
        maximumReducibleAmount: 200_000,
      },
    ],
  };
}

describe("pendapatan simulasi", () => {
  it("hanya menghitung pendapatan FIXED aktif", () => {
    const result = calculateFixedIncome(baseInput().incomeSources);
    expect(result.total).toBe(15_000_000);
    expect(result.used.map((item) => item.id)).toEqual(["salary"]);
    expect(result.excluded).toHaveLength(2);
  });

  it("memberi peringatan ketika konfigurasi berbeda besar dari aktual", () => {
    const result = calculateFixedIncome([
      {
        id: "salary",
        name: "Gaji",
        classification: "FIXED",
        active: true,
        configuredMonthlyAmount: 15_000_000,
        actualAverageMonthlyAmount: 11_000_000,
      },
    ]);
    expect(result.warnings).toHaveLength(1);
  });
});

describe("tabungan simulasi", () => {
  it("mengecualikan investasi dan dana terlindungi", () => {
    const result = calculateUsableSavings(baseInput().savingsAccounts);
    expect(result.selectedGrossBalance).toBe(30_000_000);
    expect(result.protectedAmount).toBe(12_000_000);
    expect(result.usableSavings).toBe(18_000_000);
    expect(result.excludedAccounts[0]?.name).toBe("Crypto");
  });

  it("menghitung investasi hanya saat diaktifkan khusus", () => {
    const result = calculateUsableSavings([
      {
        id: "stock",
        name: "Saham",
        accountType: "STOCK",
        selected: true,
        balance: 10_000_000,
        explicitlyAllowInvestmentAsset: true,
      },
    ]);
    expect(result.usableSavings).toBe(10_000_000);
  });
});

describe("cicilan aktif", () => {
  it("tetap menghitung penuh utang negotiable tanpa kesepakatan", () => {
    const result = calculateActiveDebtCommitments([
      {
        id: "debt",
        name: "Utang keluarga",
        status: "CURRENT",
        priority: "NEGOTIABLE",
        monthlyInstallment: 2_000_000,
        negotiatedMonthlyAmount: 500_000,
        negotiationAgreementActive: false,
      },
    ]);
    expect(result.monthlyDebtService).toBe(2_000_000);
    expect(result.includedDebts[0]?.usedNegotiatedAmount).toBe(false);
  });

  it("menggunakan restrukturisasi yang benar-benar disepakati", () => {
    const result = calculateActiveDebtCommitments([
      {
        id: "debt",
        name: "Utang keluarga",
        status: "RESTRUCTURED",
        priority: "NEGOTIABLE",
        monthlyInstallment: 2_000_000,
        negotiatedMonthlyAmount: 750_000,
        negotiationAgreementActive: true,
      },
    ]);
    expect(result.monthlyDebtService).toBe(750_000);
    expect(result.includedDebts[0]?.usedNegotiatedAmount).toBe(true);
  });

  it("memasukkan tunggakan dan denda yang sudah terbentuk", () => {
    const result = calculateActiveDebtCommitments([
      {
        id: "debt",
        name: "Paylater",
        status: "OVERDUE",
        priority: "URGENT",
        monthlyInstallment: 1_000_000,
        arrears: 300_000,
        currentPenalty: 100_000,
        nextInstallmentPenalty: 50_000,
        deferredPenalty: 200_000,
      },
    ]);
    expect(result.monthlyDebtService).toBe(1_450_000);
    expect(result.deferredPenalty).toBe(200_000);
  });
});

describe("simulasi utang baru", () => {
  it("membandingkan tenor tanpa membuat utang aktif", () => {
    const result = simulateNewDebt(baseInput());
    expect(result.simulationOnly).toBe(true);
    expect(result.fixedIncomeUsed).toBe(15_000_000);
    expect(result.tenorComparisons.map((item) => item.tenorMonths)).toEqual([
      6,
      12,
      18,
      24,
    ]);
    expect(result.tenorComparisons[0]!.monthlyInstallment).toBe(3_400_000);
    expect(result.tenorComparisons[3]!.totalPayment).toBe(28_600_000);
  });

  it("menghitung DSR sebelum dan sesudah", () => {
    const result = simulateNewDebt(baseInput());
    const twelveMonths = result.tenorComparisons.find((item) => item.tenorMonths === 12)!;
    expect(result.currentDsr).toBeCloseTo(23.33, 2);
    expect(twelveMonths.dsrAfter).toBeCloseTo(35.67, 2);
    expect(twelveMonths.freeCashFlowAfter).toBe(1_150_000);
  });

  it("menghasilkan enam stress test", () => {
    const result = simulateNewDebt(baseInput());
    expect(result.tenorComparisons[0]!.stressTests).toHaveLength(6);
    expect(
      result.tenorComparisons[0]!.stressTests.some(
        (item) => item.scenario === "FIXED_INCOME_LOSS",
      ),
    ).toBe(true);
  });

  it("memblokir aktivasi ketika data pendapatan tetap belum tersedia", () => {
    const input = baseInput();
    input.incomeSources = input.incomeSources.map((source) => ({
      ...source,
      classification: "VARIABLE",
    }));
    const result = simulateNewDebt(input);
    expect(result.tenorComparisons[0]!.healthStatus).toBe("INSUFFICIENT_DATA");
    expect(result.tenorComparisons[0]!.canActivate).toBe(false);
    expect(result.tenorComparisons[0]!.activationDecision).toBe("BLOCKED");
  });

  it("menampilkan trade-off tanpa mengubah budget", () => {
    const result = simulateNewDebt(baseInput());
    const tradeOff = result.tradeOffs[6]!;
    expect(tradeOff.monthlyCapacityGap).toBeGreaterThan(0);
    expect(tradeOff.reducibleBudgets[0]?.name).toBe("Makan di luar");
    expect(baseInput().flexibleBudgets?.[0]?.monthlyAmount).toBe(800_000);
  });

  it("mencari waktu lebih aman setelah cicilan lama selesai", () => {
    const input = baseInput();
    input.plan.tenors = [24];
    input.plan.providerMonthlyPayments = { 24: 1_000_000 };
    // Buffer belum aman selama cicilan kendaraan masih aktif,
    // tetapi menjadi aman setelah kewajiban tersebut selesai.
    input.savingsAccounts[0]!.balance = 44_000_000;
    input.minimumMonthlySavings = 1_000_000;
    const result = simulateNewDebt(input);
    expect(result.safePurchaseProjection.found).toBe(true);
    expect(result.safePurchaseProjection.earliestSafeMonth).not.toBeNull();
    expect(
      result.safePurchaseProjection.earliestSafeMonth!.getTime(),
    ).toBeGreaterThan(new Date("2026-11-20T00:00:00.000Z").getTime());
  });
});

describe("urgent override", () => {
  it("menolak override tanpa checklist risiko", () => {
    const simulation = simulateNewDebt(baseInput()).tenorComparisons[0]!;
    const result = applyUrgentOverride({
      simulation,
      needLevel: "URGENT",
      reason: "Perangkat kerja rusak",
      cannotDelayReason: "Pekerjaan berhenti",
      cheaperAlternativeReviewed: false,
      financialImpactReviewed: true,
      affectedObligationsReviewed: true,
      mitigationPlan: [],
      riskConfirmed: false,
    });
    expect(result.approved).toBe(false);
  });

  it("menyimpan status URGENT_OVERRIDE tanpa mengubahnya menjadi sehat", () => {
    const input = baseInput();
    input.plan.needLevel = "URGENT";
    input.plan.urgentReason = "Perangkat utama untuk bekerja rusak";
    const simulation = simulateNewDebt(input).tenorComparisons[0]!;
    const result = applyUrgentOverride({
      simulation,
      needLevel: "URGENT",
      reason: "Perangkat utama untuk bekerja rusak",
      cannotDelayReason: "Tidak dapat menjalankan pekerjaan",
      cheaperAlternativeReviewed: true,
      financialImpactReviewed: true,
      affectedObligationsReviewed: true,
      mitigationPlan: ["Pilih barang lebih murah", "Kurangi pengeluaran tidak wajib"],
      riskConfirmed: true,
    });
    expect(result.approved).toBe(true);
    expect(result.status).toBe("URGENT_OVERRIDE");
    expect(result.auditMetadata.originalHealthStatus).toBe(simulation.healthStatus);
  });
});
