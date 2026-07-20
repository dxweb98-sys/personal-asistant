import { generateDebtSchedule } from "./debt-schedule.calculator.js";
import {
  addMonthsClamped,
  assertFiniteNonNegative,
  roundMoney,
  utcDateOnly,
} from "./debt-calculation.shared.js";
import type {
  ActiveDebtCalculationResult,
  ActiveDebtCommitmentInput,
  DebtSimulationInput,
  DebtSimulationResult,
  IncomeSourceInput,
  NeedLevel,
  SafePurchaseProjectionResult,
  SavingsAccountInput,
  SavingsCalculationResult,
  SimulationActivationDecision,
  SimulationHealthStatus,
  SimulationThresholds,
  StressTestResult,
  TenorSimulationResult,
  TradeOffRecommendation,
  UrgentOverrideInput,
  UrgentOverrideResult,
} from "./debt-simulation.types.js";

const DEFAULT_THRESHOLDS: SimulationThresholds = {
  healthyMaxDsr: 30,
  fairlyHealthyMaxDsr: 35,
  attentionMaxDsr: 40,
  unhealthyMaxDsr: 50,
  minimumSafeBufferMonths: 3,
  minimumStressCashFlow: 0,
  mandatoryExpenseStressPercent: 15,
  incomeLossStressPercent: 20,
};

const ELIGIBLE_SAVINGS_TYPES = new Set(["SAVINGS", "BANK", "CASH", "UNALLOCATED"]);
const INVESTMENT_TYPES = new Set([
  "INVESTMENT",
  "STOCK",
  "CRYPTO",
  "MUTUAL_FUND",
  "GOLD",
  "PROPERTY",
  "VEHICLE",
]);

function thresholdsOf(input: DebtSimulationInput): SimulationThresholds {
  return { ...DEFAULT_THRESHOLDS, ...input.thresholds };
}

function validateSimulation(input: DebtSimulationInput): void {
  const plan = input.plan;
  assertFiniteNonNegative("cashPriceOrLoanAmount", plan.cashPriceOrLoanAmount);
  assertFiniteNonNegative("downPayment", plan.downPayment);
  if (plan.cashPriceOrLoanAmount <= 0) throw new Error("Harga atau jumlah pinjaman wajib lebih dari 0");
  if (plan.downPayment > plan.cashPriceOrLoanAmount) throw new Error("Uang muka tidak boleh melebihi harga");
  if (!plan.tenors.length) throw new Error("Minimal satu tenor wajib dipilih");
  if (plan.tenors.some((tenor) => !Number.isInteger(tenor) || tenor < 1 || tenor > 600)) {
    throw new Error("Tenor harus berupa bilangan bulat 1 sampai 600 bulan");
  }
  if (!Number.isInteger(plan.dueDay) || plan.dueDay < 1 || plan.dueDay > 31) {
    throw new Error("Tanggal jatuh tempo harus antara 1 dan 31");
  }
  if (Number.isNaN(plan.firstInstallmentDate.getTime())) throw new Error("Tanggal cicilan pertama tidak valid");
  if (["URGENT", "EMERGENCY"].includes(plan.needLevel) && !plan.urgentReason?.trim()) {
    throw new Error("Alasan kebutuhan wajib diisi untuk kebutuhan mendesak atau darurat");
  }
}

export function calculateFixedIncome(sources: IncomeSourceInput[]) {
  const used: Array<{ id: string; name: string; amount: number }> = [];
  const excluded: Array<{ id: string; name: string; reason: string }> = [];
  const warnings: string[] = [];
  let total = 0;
  for (const source of sources) {
    assertFiniteNonNegative(source.name, source.configuredMonthlyAmount);
    if (!source.active) {
      excluded.push({ id: source.id, name: source.name, reason: "Sumber tidak aktif" });
      continue;
    }
    if (source.classification !== "FIXED") {
      excluded.push({
        id: source.id,
        name: source.name,
        reason: source.classification === "VARIABLE" ? "Pendapatan tidak tetap tidak dihitung" : "Pendapatan satu kali tidak dihitung",
      });
      continue;
    }
    used.push({ id: source.id, name: source.name, amount: roundMoney(source.configuredMonthlyAmount) });
    total += source.configuredMonthlyAmount;
    if (source.actualAverageMonthlyAmount !== undefined && source.configuredMonthlyAmount > 0) {
      const differencePercent = Math.abs(source.actualAverageMonthlyAmount - source.configuredMonthlyAmount) / source.configuredMonthlyAmount * 100;
      if (differencePercent >= 15) {
        warnings.push(`${source.name}: konfigurasi berbeda ${roundMoney(differencePercent)}% dari rata-rata aktual`);
      }
    }
  }
  return { total: roundMoney(total), used, excluded, warnings };
}

export function calculateUsableSavings(accounts: SavingsAccountInput[]): SavingsCalculationResult {
  let selectedGrossBalance = 0;
  let protectedAmount = 0;
  let usableSavings = 0;
  const includedAccounts: string[] = [];
  const excludedAccounts: Array<{ name: string; reason: string }> = [];
  for (const account of accounts) {
    assertFiniteNonNegative(account.name, account.balance);
    if (!account.selected) {
      excludedAccounts.push({ name: account.name, reason: "Account tidak dipilih" });
      continue;
    }
    const investment = INVESTMENT_TYPES.has(account.accountType);
    const eligible = ELIGIBLE_SAVINGS_TYPES.has(account.accountType) || (investment && account.explicitlyAllowInvestmentAsset);
    if (!eligible || ["CREDIT_LIMIT", "BORROWED_FUNDS"].includes(account.accountType)) {
      excludedAccounts.push({
        name: account.name,
        reason: investment ? "Aset investasi tidak dihitung secara default" : "Saldo bukan tabungan yang dapat digunakan",
      });
      continue;
    }
    const protectedForAccount = roundMoney(
      (account.emergencyFundProtected ?? 0) +
      (account.allocatedToOtherTargets ?? 0) +
      (account.upcomingBillsReserved ?? 0) +
      (account.minimumBalance ?? 0) +
      (account.protectedBuffer ?? 0),
    );
    selectedGrossBalance += account.balance;
    protectedAmount += protectedForAccount;
    usableSavings += Math.max(0, account.balance - protectedForAccount);
    includedAccounts.push(account.name);
  }
  return {
    selectedGrossBalance: roundMoney(selectedGrossBalance),
    protectedAmount: roundMoney(protectedAmount),
    usableSavings: roundMoney(usableSavings),
    includedAccounts,
    excludedAccounts,
  };
}

function activeDebtMonthlyAmount(debt: ActiveDebtCommitmentInput): { amount: number; negotiated: boolean } {
  if (debt.status === "FINISHED") return { amount: 0, negotiated: false };
  const negotiated = Boolean(
    debt.negotiationAgreementActive &&
    debt.negotiatedMonthlyAmount !== undefined &&
    debt.negotiatedMonthlyAmount >= 0,
  );
  const base = negotiated ? debt.negotiatedMonthlyAmount! : debt.monthlyInstallment;
  return {
    amount: roundMoney(
      base +
      (debt.arrears ?? 0) +
      (debt.currentPenalty ?? 0) +
      (debt.nextInstallmentPenalty ?? 0),
    ),
    negotiated,
  };
}

export function calculateActiveDebtCommitments(debts: ActiveDebtCommitmentInput[]): ActiveDebtCalculationResult {
  let monthlyDebtService = 0;
  let arrearsAndDuePenalty = 0;
  let deferredPenalty = 0;
  const includedDebts: ActiveDebtCalculationResult["includedDebts"] = [];
  for (const debt of debts) {
    assertFiniteNonNegative(debt.name, debt.monthlyInstallment);
    if (debt.status === "FINISHED") continue;
    const calculated = activeDebtMonthlyAmount(debt);
    const arrears = roundMoney(
      (debt.arrears ?? 0) +
      (debt.currentPenalty ?? 0) +
      (debt.nextInstallmentPenalty ?? 0),
    );
    monthlyDebtService += calculated.amount;
    arrearsAndDuePenalty += arrears;
    deferredPenalty += debt.deferredPenalty ?? 0;
    includedDebts.push({
      id: debt.id,
      name: debt.name,
      monthlyAmount: calculated.amount,
      usedNegotiatedAmount: calculated.negotiated,
    });
  }
  return {
    monthlyDebtService: roundMoney(monthlyDebtService),
    arrearsAndDuePenalty: roundMoney(arrearsAndDuePenalty),
    deferredPenalty: roundMoney(deferredPenalty),
    includedDebts,
  };
}

function upfrontFees(input: DebtSimulationInput): number {
  return roundMoney(
    (input.plan.administrationFee ?? 0) +
    (input.plan.insuranceFee ?? 0) +
    (input.plan.additionalFee ?? 0),
  );
}

function buildStressTests(params: {
  input: DebtSimulationInput;
  fixedIncome: number;
  activeDebtService: number;
  newInstallment: number;
  savingsAfterDownPayment: number;
  thresholds: SimulationThresholds;
}): StressTestResult[] {
  const mandatory = params.input.mandatoryExpenses ?? 0;
  const routine = params.input.routineNeeds ?? 0;
  const monthlySavings = params.input.minimumMonthlySavings ?? 0;
  const make = (
    scenario: StressTestResult["scenario"],
    label: string,
    income: number,
    mandatoryExpenses: number,
    activeDebtService: number,
    installment: number,
    savings: number,
    explanation: string,
  ): StressTestResult => {
    const obligations = mandatoryExpenses + routine + activeDebtService + installment;
    const remainingCashFlow = roundMoney(income - obligations - monthlySavings);
    return {
      scenario,
      label,
      remainingCashFlow,
      usableSavingsAfterScenario: roundMoney(Math.max(0, savings)),
      bufferMonths: obligations > 0 ? roundMoney(Math.max(0, savings) / obligations) : 0,
      passed: remainingCashFlow >= params.thresholds.minimumStressCashFlow && savings >= 0,
      explanation,
    };
  };
  const obligations = mandatory + routine + params.activeDebtService + params.newInstallment;
  const penaltyShock = Math.max(100_000, params.newInstallment * 0.1);
  return [
    make("SALARY_DELAY_ONE_MONTH", "Pendapatan terlambat satu bulan", 0, mandatory, params.activeDebtService, params.newInstallment, params.savingsAfterDownPayment - obligations, "Tabungan menutup seluruh kewajiban satu bulan"),
    make("MANDATORY_EXPENSES_INCREASE", `Pengeluaran wajib naik ${params.thresholds.mandatoryExpenseStressPercent}%`, params.fixedIncome, mandatory * (1 + params.thresholds.mandatoryExpenseStressPercent / 100), params.activeDebtService, params.newInstallment, params.savingsAfterDownPayment, "Pendapatan tambahan tidak pasti tidak digunakan"),
    make("EMERGENCY_NEED", "Terdapat kebutuhan mendadak", params.fixedIncome, mandatory, params.activeDebtService, params.newInstallment, params.savingsAfterDownPayment - (params.input.emergencyNeedAmount ?? params.input.safetyBuffer ?? 0), "Kebutuhan mendadak menggunakan tabungan tidak terlindungi"),
    make("EXISTING_DEBT_PENALTY", "Salah satu cicilan terkena denda", params.fixedIncome, mandatory, params.activeDebtService + penaltyShock, params.newInstallment, params.savingsAfterDownPayment, `Tambahan denda ${roundMoney(penaltyShock)}`),
    make("PURCHASE_COST_INCREASE", "Biaya pembelian bertambah 10%", params.fixedIncome, mandatory, params.activeDebtService, params.newInstallment * 1.1, params.savingsAfterDownPayment, "Cicilan dinaikkan 10%"),
    make("FIXED_INCOME_LOSS", `Pendapatan tetap turun ${params.thresholds.incomeLossStressPercent}%`, params.fixedIncome * (1 - params.thresholds.incomeLossStressPercent / 100), mandatory, params.activeDebtService, params.newInstallment, params.savingsAfterDownPayment, "Bonus dan pendapatan tidak tetap tetap dikecualikan"),
  ];
}

function classifyHealth(params: {
  fixedIncome: number;
  mandatoryKnown: boolean;
  dsrAfter: number | null;
  freeCashFlowAfter: number | null;
  bufferMonths: number;
  arrears: number;
  overdueCount: number;
  stressTests: StressTestResult[];
  thresholds: SimulationThresholds;
}): SimulationHealthStatus {
  if (!params.mandatoryKnown || params.fixedIncome <= 0 || params.dsrAfter === null) return "INSUFFICIENT_DATA";
  const failed = params.stressTests.filter((test) => !test.passed).length;
  if (params.dsrAfter > params.thresholds.unhealthyMaxDsr || (params.freeCashFlowAfter ?? 0) < 0 || params.overdueCount >= 2 || failed >= 4) return "CRITICAL";
  if (params.dsrAfter > params.thresholds.attentionMaxDsr || params.arrears > 0 || (params.freeCashFlowAfter ?? 0) < params.fixedIncome * 0.05 || failed >= 3) return "UNHEALTHY";
  if (params.dsrAfter > params.thresholds.fairlyHealthyMaxDsr || params.bufferMonths < 1.5 || failed >= 2) return "NEEDS_ATTENTION";
  if (params.dsrAfter > params.thresholds.healthyMaxDsr || params.bufferMonths < params.thresholds.minimumSafeBufferMonths || failed >= 1) return "FAIRLY_HEALTHY";
  return "HEALTHY";
}

function activation(status: SimulationHealthStatus, needLevel: NeedLevel): { decision: SimulationActivationDecision; canActivate: boolean } {
  if (["HEALTHY", "FAIRLY_HEALTHY"].includes(status)) return { decision: "CAN_ACTIVATE", canActivate: true };
  if (status === "NEEDS_ATTENTION") return { decision: "REQUIRES_EXTRA_CONFIRMATION", canActivate: true };
  if (["URGENT", "EMERGENCY"].includes(needLevel)) return { decision: "URGENT_OVERRIDE_REQUIRED", canActivate: false };
  return { decision: "BLOCKED", canActivate: false };
}

function buildTenorResult(params: {
  input: DebtSimulationInput;
  tenor: number;
  fixedIncome: number;
  activeDebt: ActiveDebtCalculationResult;
  savings: SavingsCalculationResult;
  currentDsr: number | null;
  freeCashFlowBefore: number | null;
  maximumNewInstallment: number | null;
  thresholds: SimulationThresholds;
}): TenorSimulationResult {
  const plan = params.input.plan;
  const financedPrincipal = roundMoney(plan.cashPriceOrLoanAmount - plan.downPayment);
  const fees = upfrontFees(params.input);
  const providerPayment = plan.providerMonthlyPayments?.[params.tenor];
  const creditPricePayment = plan.creditPrice && plan.creditPrice > plan.downPayment ? (plan.creditPrice - plan.downPayment) / params.tenor : undefined;
  const schedule = generateDebtSchedule({
    principal: financedPrincipal,
    tenorMonths: params.tenor,
    firstDueDate: plan.firstInstallmentDate,
    interestMethod: plan.interestMethod,
    annualInterestRate: plan.annualInterestRate,
    contractBaseInstallment: providerPayment ?? creditPricePayment,
  });
  const monthlyInstallment = roundMoney(providerPayment ?? creditPricePayment ?? schedule.installments[0]!.baseInstallment);
  const installmentTotal = roundMoney(monthlyInstallment * params.tenor);
  const totalInterest = roundMoney(providerPayment || creditPricePayment ? Math.max(0, installmentTotal - financedPrincipal) : schedule.totalInterest);
  const totalPayment = roundMoney(plan.downPayment + installmentTotal + fees);
  const freeCashFlowAfter = params.freeCashFlowBefore === null ? null : roundMoney(params.freeCashFlowBefore - monthlyInstallment);
  const dsrAfter = params.fixedIncome > 0 ? roundMoney((params.activeDebt.monthlyDebtService + monthlyInstallment) / params.fixedIncome * 100) : null;
  const savingsAfterDownPayment = roundMoney(params.savings.usableSavings - plan.downPayment - fees);
  const monthlyObligations = roundMoney((params.input.mandatoryExpenses ?? 0) + (params.input.routineNeeds ?? 0) + params.activeDebt.monthlyDebtService + monthlyInstallment);
  const savingsBufferMonths = monthlyObligations > 0 ? roundMoney(Math.max(0, savingsAfterDownPayment) / monthlyObligations) : 0;
  const stressTests = buildStressTests({ input: params.input, fixedIncome: params.fixedIncome, activeDebtService: params.activeDebt.monthlyDebtService, newInstallment: monthlyInstallment, savingsAfterDownPayment, thresholds: params.thresholds });
  const overdueCount = params.input.activeDebts.filter((debt) => ["PARTIAL", "OVERDUE"].includes(debt.status)).length;
  const healthStatus = classifyHealth({
    fixedIncome: params.fixedIncome,
    mandatoryKnown: params.input.mandatoryExpenses !== undefined,
    dsrAfter,
    freeCashFlowAfter,
    bufferMonths: savingsBufferMonths,
    arrears: params.activeDebt.arrearsAndDuePenalty,
    overdueCount,
    stressTests,
    thresholds: params.thresholds,
  });
  const activationResult = activation(healthStatus, plan.needLevel);
  const reasons: string[] = [];
  if (dsrAfter !== null) reasons.push(`DSR setelah cicilan: ${dsrAfter}%`);
  if (freeCashFlowAfter !== null) reasons.push(`Sisa arus kas bulanan: ${freeCashFlowAfter}`);
  if (savingsBufferMonths < params.thresholds.minimumSafeBufferMonths) reasons.push(`Buffer tabungan hanya ${savingsBufferMonths} bulan`);
  if (params.activeDebt.arrearsAndDuePenalty > 0) reasons.push("Terdapat tunggakan atau denda aktif");
  const failedStress = stressTests.filter((test) => !test.passed).length;
  if (failedStress) reasons.push(`${failedStress} stress test tidak memenuhi batas aman`);
  const suggestions: string[] = [];
  if (params.maximumNewInstallment !== null && monthlyInstallment > params.maximumNewInstallment) suggestions.push("Naikkan DP, turunkan harga, atau tunggu cicilan lama selesai");
  if (totalPayment - plan.cashPriceOrLoanAmount > plan.cashPriceOrLoanAmount * 0.2) suggestions.push("Total biaya kredit tinggi dibanding harga cash");
  return {
    tenorMonths: params.tenor,
    financedPrincipal,
    downPayment: plan.downPayment,
    monthlyInstallment,
    monthlyInterestFirst: schedule.installments[0]?.interest ?? 0,
    averageMonthlyInterest: roundMoney(totalInterest / params.tenor),
    totalInterest,
    totalFees: fees,
    totalPayment,
    differenceFromCashPrice: roundMoney(totalPayment - plan.cashPriceOrLoanAmount),
    currentDsr: params.currentDsr,
    dsrAfter,
    freeCashFlowBefore: params.freeCashFlowBefore,
    freeCashFlowAfter,
    maximumNewInstallment: params.maximumNewInstallment,
    savingsAfterDownPayment,
    savingsBufferMonths,
    healthStatus,
    activationDecision: activationResult.decision,
    urgentOverrideEligible: ["URGENT", "EMERGENCY"].includes(plan.needLevel),
    canActivate: activationResult.canActivate,
    reasons,
    suggestions,
    stressTests,
  };
}

function statusRank(status: SimulationHealthStatus): number {
  return ({ HEALTHY: 0, FAIRLY_HEALTHY: 1, NEEDS_ATTENTION: 2, UNHEALTHY: 3, CRITICAL: 4, INSUFFICIENT_DATA: 5, URGENT_OVERRIDE: 6 })[status];
}

function recommendTenor(comparisons: TenorSimulationResult[], principal: number): TenorSimulationResult | null {
  const eligible = comparisons.filter((item) => item.activationDecision !== "BLOCKED");
  if (!eligible.length) return null;
  return [...eligible].sort((a, b) => {
    const score = (item: TenorSimulationResult) =>
      statusRank(item.healthStatus) * 1_000 +
      (principal > 0 ? item.differenceFromCashPrice / principal * 100 : 0) +
      item.tenorMonths * 0.5 -
      Math.min(20, Math.max(0, (item.freeCashFlowAfter ?? 0) / Math.max(1, item.monthlyInstallment) * 5));
    return score(a) - score(b);
  })[0]!;
}

function buildTradeOff(input: DebtSimulationInput, comparison: TenorSimulationResult): TradeOffRecommendation {
  const capacityGap = roundMoney(Math.max(0, comparison.monthlyInstallment - (comparison.maximumNewInstallment ?? 0)));
  let remainingGap = capacityGap;
  const reducibleBudgets = [...(input.flexibleBudgets ?? [])]
    .filter((budget) => budget.maximumReducibleAmount > 0)
    .sort((a, b) => b.maximumReducibleAmount - a.maximumReducibleAmount)
    .map((budget) => {
      const suggestedReduction = roundMoney(Math.min(remainingGap, budget.maximumReducibleAmount));
      remainingGap = roundMoney(Math.max(0, remainingGap - suggestedReduction));
      return { id: budget.id, name: budget.name, suggestedReduction };
    })
    .filter((budget) => budget.suggestedReduction > 0);
  const estimatedAdditionalDownPayment = comparison.monthlyInstallment > 0
    ? roundMoney(Math.min(comparison.financedPrincipal, comparison.financedPrincipal * capacityGap / comparison.monthlyInstallment))
    : 0;
  const endDates = input.activeDebts.map((debt) => debt.endDate).filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime());
  return {
    monthlyCapacityGap: capacityGap,
    reducibleBudgets,
    totalSuggestedReduction: roundMoney(reducibleBudgets.reduce((sum, item) => sum + item.suggestedReduction, 0)),
    estimatedAdditionalDownPayment,
    maximumAffordablePrice: roundMoney(Math.max(0, input.plan.cashPriceOrLoanAmount - estimatedAdditionalDownPayment)),
    waitUntil: endDates[0],
    notes: [
      "Rekomendasi hanya menggunakan kategori pengeluaran yang dapat dinegosiasikan",
      "Perubahan budget atau target tidak diterapkan otomatis",
    ],
  };
}

function activeDebtAt(debt: ActiveDebtCommitmentInput, date: Date): boolean {
  return debt.status !== "FINISHED" && (!debt.endDate || utcDateOnly(debt.endDate) >= utcDateOnly(date));
}

function findSafePurchaseMonth(input: DebtSimulationInput, comparison: TenorSimulationResult, fixedIncome: number, savings: SavingsCalculationResult, thresholds: SimulationThresholds): SafePurchaseProjectionResult {
  if (fixedIncome <= 0 || input.mandatoryExpenses === undefined) {
    return { found: false, earliestSafeMonth: null, projectedUsableSavings: savings.usableSavings, projectedDsr: null, projectedFreeCashFlow: null, reasons: ["Pendapatan tetap atau pengeluaran wajib belum lengkap"] };
  }
  const monthlySavingsGrowth = Math.max(0, input.minimumMonthlySavings ?? 0);
  const fees = upfrontFees(input);
  for (let month = 0; month <= 60; month += 1) {
    const projectedDate = addMonthsClamped(input.asOf, month);
    const activeDebts = input.activeDebts.filter((debt) => activeDebtAt(debt, projectedDate));
    const monthlyDebt = roundMoney(activeDebts.reduce((sum, debt) => sum + activeDebtMonthlyAmount(debt).amount, 0));
    const overdue = activeDebts.some((debt) => ["PARTIAL", "OVERDUE"].includes(debt.status) && ["MANDATORY", "URGENT"].includes(debt.priority));
    const projectedSavings = roundMoney(savings.usableSavings + monthlySavingsGrowth * month);
    const dsr = roundMoney((monthlyDebt + comparison.monthlyInstallment) / fixedIncome * 100);
    const freeCash = roundMoney(fixedIncome - (input.mandatoryExpenses ?? 0) - (input.routineNeeds ?? 0) - monthlyDebt - comparison.monthlyInstallment - monthlySavingsGrowth);
    const savingsAfterDp = projectedSavings - input.plan.downPayment - fees;
    const obligations = (input.mandatoryExpenses ?? 0) + (input.routineNeeds ?? 0) + monthlyDebt + comparison.monthlyInstallment;
    const buffer = obligations > 0 ? savingsAfterDp / obligations : 0;
    if (!overdue && dsr <= thresholds.healthyMaxDsr && freeCash > 0 && savingsAfterDp >= 0 && buffer >= thresholds.minimumSafeBufferMonths) {
      return {
        found: true,
        earliestSafeMonth: projectedDate,
        projectedUsableSavings: projectedSavings,
        projectedDsr: dsr,
        projectedFreeCashFlow: freeCash,
        reasons: ["DSR berada dalam batas sehat", "Tidak ada tunggakan prioritas", "DP tidak mengganggu buffer minimum"],
      };
    }
  }
  return {
    found: false,
    earliestSafeMonth: null,
    projectedUsableSavings: roundMoney(savings.usableSavings + monthlySavingsGrowth * 60),
    projectedDsr: null,
    projectedFreeCashFlow: null,
    reasons: ["Tidak ditemukan bulan aman dalam proyeksi 60 bulan berdasarkan data saat ini"],
  };
}

export function simulateNewDebt(input: DebtSimulationInput): DebtSimulationResult {
  validateSimulation(input);
  const thresholds = thresholdsOf(input);
  const income = calculateFixedIncome(input.incomeSources);
  const savings = calculateUsableSavings(input.savingsAccounts);
  const activeDebt = calculateActiveDebtCommitments(input.activeDebts);
  const fixedIncome = income.total;
  const currentDsr = fixedIncome > 0 ? roundMoney(activeDebt.monthlyDebtService / fixedIncome * 100) : null;
  const freeCashFlowBefore = input.mandatoryExpenses === undefined || fixedIncome <= 0
    ? null
    : roundMoney(fixedIncome - input.mandatoryExpenses - (input.routineNeeds ?? 0) - activeDebt.monthlyDebtService - (input.minimumMonthlySavings ?? 0));
  const dsrCapacity = fixedIncome > 0 ? roundMoney(fixedIncome * thresholds.healthyMaxDsr / 100 - activeDebt.monthlyDebtService) : null;
  const cashCapacity = freeCashFlowBefore === null ? null : roundMoney(freeCashFlowBefore - (input.safetyBuffer ?? 0));
  const maximumNewInstallment = dsrCapacity === null || cashCapacity === null ? null : roundMoney(Math.max(0, Math.min(dsrCapacity, cashCapacity)));
  const tenorComparisons = [...new Set(input.plan.tenors)].sort((a, b) => a - b).map((tenor) => buildTenorResult({ input, tenor, fixedIncome, activeDebt, savings, currentDsr, freeCashFlowBefore, maximumNewInstallment, thresholds }));
  const recommended = recommendTenor(tenorComparisons, input.plan.cashPriceOrLoanAmount);
  const tradeOffs = Object.fromEntries(tenorComparisons.map((comparison) => [comparison.tenorMonths, buildTradeOff(input, comparison)]));
  const projectionBase = recommended ?? tenorComparisons[0]!;
  const safePurchaseProjection = findSafePurchaseMonth(input, projectionBase, fixedIncome, savings, thresholds);
  const recommendationReasons = recommended
    ? [
        `Tenor ${recommended.tenorMonths} bulan memberi keseimbangan risiko, arus kas, dan total biaya terbaik dari pilihan yang tersedia`,
        ...recommended.reasons,
      ]
    : ["Belum ada pilihan tenor yang dapat diaktifkan berdasarkan batas saat ini"];
  return {
    generatedAt: new Date(),
    fixedIncomeUsed: fixedIncome,
    incomeSourcesUsed: income.used,
    excludedIncomeSources: income.excluded,
    incomeWarnings: income.warnings,
    savings,
    activeDebt,
    currentDsr,
    freeCashFlowBefore,
    maximumNewInstallment,
    tenorComparisons,
    recommendedTenorMonths: recommended?.tenorMonths ?? null,
    recommendationReasons,
    safePurchaseProjection,
    tradeOffs,
    simulationOnly: true,
  };
}

export function applyUrgentOverride(input: UrgentOverrideInput): UrgentOverrideResult {
  const reasons: string[] = [];
  if (!["URGENT", "EMERGENCY"].includes(input.needLevel)) reasons.push("Tingkat kebutuhan bukan mendesak atau darurat");
  if (!input.reason.trim()) reasons.push("Alasan kebutuhan belum diisi");
  if (!input.cannotDelayReason.trim()) reasons.push("Alasan tidak dapat ditunda belum diisi");
  if (!input.cheaperAlternativeReviewed) reasons.push("Alternatif lebih murah belum ditinjau");
  if (!input.financialImpactReviewed) reasons.push("Dampak terhadap tabungan belum ditinjau");
  if (!input.affectedObligationsReviewed) reasons.push("Kewajiban yang berpotensi terganggu belum ditinjau");
  if (!input.mitigationPlan.length) reasons.push("Rencana mitigasi belum dipilih");
  if (!input.riskConfirmed) reasons.push("Konfirmasi risiko belum diberikan");
  if (reasons.length) {
    return { approved: false, status: "REJECTED", reasons, recoveryPlan: [], auditMetadata: { rejectedAt: new Date().toISOString(), healthStatus: input.simulation.healthStatus } };
  }
  return {
    approved: true,
    status: "URGENT_OVERRIDE",
    reasons: ["Kondisi finansial tetap berisiko dan tidak diubah menjadi sehat"],
    recoveryPlan: input.mitigationPlan,
    auditMetadata: {
      approvedAt: new Date().toISOString(),
      originalHealthStatus: input.simulation.healthStatus,
      reason: input.reason,
      cannotDelayReason: input.cannotDelayReason,
      mitigationPlan: input.mitigationPlan,
      stricterRemindersRequired: true,
    },
  };
}
