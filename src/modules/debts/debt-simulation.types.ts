import type { DebtInterestMethod } from "./debt-calculation.types.js";

export type IncomeClassification = "FIXED" | "VARIABLE" | "ONE_TIME";
export type SimulationKind =
  | "CASH_LOAN"
  | "GOODS_CREDIT"
  | "CREDIT_CARD_PURCHASE"
  | "PAYLATER"
  | "NON_CARD_INSTALLMENT"
  | "VEHICLE_FINANCING"
  | "HOME_FINANCING"
  | "CUSTOM";
export type NeedLevel =
  | "WANT"
  | "IMPORTANT"
  | "PRIMARY_NEED"
  | "URGENT"
  | "EMERGENCY";
export type SimulationHealthStatus =
  | "HEALTHY"
  | "FAIRLY_HEALTHY"
  | "NEEDS_ATTENTION"
  | "UNHEALTHY"
  | "CRITICAL"
  | "INSUFFICIENT_DATA"
  | "URGENT_OVERRIDE";
export type SimulationActivationDecision =
  | "CAN_ACTIVATE"
  | "REQUIRES_EXTRA_CONFIRMATION"
  | "BLOCKED"
  | "URGENT_OVERRIDE_REQUIRED";
export type ActiveInstallmentStatus =
  | "CURRENT"
  | "PARTIAL"
  | "OVERDUE"
  | "GRACE_PERIOD"
  | "RESTRUCTURED"
  | "FINISHED";
export type DebtPaymentPriority = "MANDATORY" | "URGENT" | "NORMAL" | "NEGOTIABLE";

export type IncomeSourceInput = {
  id: string;
  name: string;
  classification: IncomeClassification;
  active: boolean;
  configuredMonthlyAmount: number;
  actualAverageMonthlyAmount?: number;
};

export type SavingsAccountInput = {
  id: string;
  name: string;
  accountType:
    | "SAVINGS"
    | "BANK"
    | "CASH"
    | "UNALLOCATED"
    | "INVESTMENT"
    | "STOCK"
    | "CRYPTO"
    | "MUTUAL_FUND"
    | "GOLD"
    | "PROPERTY"
    | "VEHICLE"
    | "CREDIT_LIMIT"
    | "BORROWED_FUNDS"
    | "OTHER";
  selected: boolean;
  balance: number;
  emergencyFundProtected?: number;
  allocatedToOtherTargets?: number;
  upcomingBillsReserved?: number;
  minimumBalance?: number;
  protectedBuffer?: number;
  explicitlyAllowInvestmentAsset?: boolean;
};

export type ActiveDebtCommitmentInput = {
  id: string;
  name: string;
  status: ActiveInstallmentStatus;
  priority: DebtPaymentPriority;
  monthlyInstallment: number;
  arrears?: number;
  currentPenalty?: number;
  nextInstallmentPenalty?: number;
  deferredPenalty?: number;
  negotiatedMonthlyAmount?: number;
  negotiationAgreementActive?: boolean;
  endDate?: Date;
};

export type FlexibleBudgetInput = {
  id: string;
  name: string;
  monthlyAmount: number;
  maximumReducibleAmount: number;
};

export type SimulationThresholds = {
  healthyMaxDsr: number;
  fairlyHealthyMaxDsr: number;
  attentionMaxDsr: number;
  unhealthyMaxDsr: number;
  minimumSafeBufferMonths: number;
  minimumStressCashFlow: number;
  mandatoryExpenseStressPercent: number;
  incomeLossStressPercent: number;
};

export type LoanSimulationPlanInput = {
  kind: SimulationKind;
  name: string;
  itemCategory?: string;
  brand?: string;
  model?: string;
  specification?: string;
  cashPriceOrLoanAmount: number;
  creditPrice?: number;
  downPayment: number;
  administrationFee?: number;
  insuranceFee?: number;
  additionalFee?: number;
  annualInterestRate?: number;
  interestMethod: DebtInterestMethod;
  tenors: number[];
  providerMonthlyPayments?: Record<number, number>;
  firstInstallmentDate: Date;
  dueDay: number;
  needLevel: NeedLevel;
  urgentReason?: string;
  purchaseDeadline?: Date;
  impactIfNotPurchased?: string;
  cheaperAlternativeAvailable?: boolean;
  relatedToWorkHealthOrSafety?: boolean;
  notes?: string;
};

export type DebtSimulationInput = {
  asOf: Date;
  plan: LoanSimulationPlanInput;
  incomeSources: IncomeSourceInput[];
  savingsAccounts: SavingsAccountInput[];
  activeDebts: ActiveDebtCommitmentInput[];
  mandatoryExpenses?: number;
  routineNeeds?: number;
  minimumMonthlySavings?: number;
  safetyBuffer?: number;
  emergencyNeedAmount?: number;
  thresholds?: Partial<SimulationThresholds>;
  flexibleBudgets?: FlexibleBudgetInput[];
};

export type SavingsCalculationResult = {
  selectedGrossBalance: number;
  protectedAmount: number;
  usableSavings: number;
  includedAccounts: string[];
  excludedAccounts: Array<{ name: string; reason: string }>;
};

export type ActiveDebtCalculationResult = {
  monthlyDebtService: number;
  arrearsAndDuePenalty: number;
  deferredPenalty: number;
  includedDebts: Array<{
    id: string;
    name: string;
    monthlyAmount: number;
    usedNegotiatedAmount: boolean;
  }>;
};

export type StressTestResult = {
  scenario:
    | "SALARY_DELAY_ONE_MONTH"
    | "MANDATORY_EXPENSES_INCREASE"
    | "EMERGENCY_NEED"
    | "EXISTING_DEBT_PENALTY"
    | "PURCHASE_COST_INCREASE"
    | "FIXED_INCOME_LOSS";
  label: string;
  remainingCashFlow: number;
  usableSavingsAfterScenario: number;
  bufferMonths: number;
  passed: boolean;
  explanation: string;
};

export type TenorSimulationResult = {
  tenorMonths: number;
  financedPrincipal: number;
  downPayment: number;
  monthlyInstallment: number;
  monthlyInterestFirst: number;
  averageMonthlyInterest: number;
  totalInterest: number;
  totalFees: number;
  totalPayment: number;
  differenceFromCashPrice: number;
  currentDsr: number | null;
  dsrAfter: number | null;
  freeCashFlowBefore: number | null;
  freeCashFlowAfter: number | null;
  maximumNewInstallment: number | null;
  savingsAfterDownPayment: number;
  savingsBufferMonths: number;
  healthStatus: SimulationHealthStatus;
  activationDecision: SimulationActivationDecision;
  urgentOverrideEligible: boolean;
  canActivate: boolean;
  reasons: string[];
  suggestions: string[];
  stressTests: StressTestResult[];
};

export type TradeOffRecommendation = {
  monthlyCapacityGap: number;
  reducibleBudgets: Array<{ id: string; name: string; suggestedReduction: number }>;
  totalSuggestedReduction: number;
  estimatedAdditionalDownPayment: number;
  maximumAffordablePrice: number;
  waitUntil?: Date;
  notes: string[];
};

export type SafePurchaseProjectionResult = {
  found: boolean;
  earliestSafeMonth: Date | null;
  projectedUsableSavings: number;
  projectedDsr: number | null;
  projectedFreeCashFlow: number | null;
  reasons: string[];
};

export type DebtSimulationResult = {
  generatedAt: Date;
  fixedIncomeUsed: number;
  incomeSourcesUsed: Array<{ id: string; name: string; amount: number }>;
  excludedIncomeSources: Array<{ id: string; name: string; reason: string }>;
  incomeWarnings: string[];
  savings: SavingsCalculationResult;
  activeDebt: ActiveDebtCalculationResult;
  currentDsr: number | null;
  freeCashFlowBefore: number | null;
  maximumNewInstallment: number | null;
  tenorComparisons: TenorSimulationResult[];
  recommendedTenorMonths: number | null;
  recommendationReasons: string[];
  safePurchaseProjection: SafePurchaseProjectionResult;
  tradeOffs: Record<number, TradeOffRecommendation>;
  simulationOnly: true;
};

export type UrgentOverrideInput = {
  simulation: TenorSimulationResult;
  needLevel: NeedLevel;
  reason: string;
  cannotDelayReason: string;
  cheaperAlternativeReviewed: boolean;
  financialImpactReviewed: boolean;
  affectedObligationsReviewed: boolean;
  mitigationPlan: string[];
  riskConfirmed: boolean;
};

export type UrgentOverrideResult = {
  approved: boolean;
  status: "URGENT_OVERRIDE" | "REJECTED";
  reasons: string[];
  recoveryPlan: string[];
  auditMetadata: Record<string, unknown>;
};
