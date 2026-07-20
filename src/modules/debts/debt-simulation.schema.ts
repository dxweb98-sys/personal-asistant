import { z } from "zod";

const finiteNumber = z.coerce.number().finite();
const nonNegativeNumber = finiteNumber.nonnegative();
const positiveNumber = finiteNumber.positive();
const optionalNonNegativeNumber = nonNegativeNumber.optional();

const interestMethodSchema = z.enum([
  "NONE",
  "FLAT",
  "EFFECTIVE",
  "ANNUITY",
  "MANUAL_CONTRACT",
  "MANUAL_SCHEDULE",
]);

const incomeSourceSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(150),
  classification: z.enum(["FIXED", "VARIABLE", "ONE_TIME"]),
  active: z.boolean(),
  configuredMonthlyAmount: nonNegativeNumber,
  actualAverageMonthlyAmount: optionalNonNegativeNumber,
});

const savingsAccountSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(150),
  accountType: z.enum([
    "SAVINGS",
    "BANK",
    "CASH",
    "UNALLOCATED",
    "INVESTMENT",
    "STOCK",
    "CRYPTO",
    "MUTUAL_FUND",
    "GOLD",
    "PROPERTY",
    "VEHICLE",
    "CREDIT_LIMIT",
    "BORROWED_FUNDS",
    "OTHER",
  ]),
  selected: z.boolean(),
  balance: nonNegativeNumber,
  emergencyFundProtected: optionalNonNegativeNumber,
  allocatedToOtherTargets: optionalNonNegativeNumber,
  upcomingBillsReserved: optionalNonNegativeNumber,
  minimumBalance: optionalNonNegativeNumber,
  protectedBuffer: optionalNonNegativeNumber,
  explicitlyAllowInvestmentAsset: z.boolean().optional(),
});

const activeDebtSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(150),
  status: z.enum([
    "CURRENT",
    "PARTIAL",
    "OVERDUE",
    "GRACE_PERIOD",
    "RESTRUCTURED",
    "FINISHED",
  ]),
  priority: z.enum(["MANDATORY", "URGENT", "NORMAL", "NEGOTIABLE"]),
  monthlyInstallment: nonNegativeNumber,
  arrears: optionalNonNegativeNumber,
  currentPenalty: optionalNonNegativeNumber,
  nextInstallmentPenalty: optionalNonNegativeNumber,
  deferredPenalty: optionalNonNegativeNumber,
  negotiatedMonthlyAmount: optionalNonNegativeNumber,
  negotiationAgreementActive: z.boolean().optional(),
  endDate: z.coerce.date().optional(),
});

const flexibleBudgetSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(150),
  monthlyAmount: nonNegativeNumber,
  maximumReducibleAmount: nonNegativeNumber,
});

const thresholdsSchema = z.object({
  healthyMaxDsr: nonNegativeNumber,
  fairlyHealthyMaxDsr: nonNegativeNumber,
  attentionMaxDsr: nonNegativeNumber,
  unhealthyMaxDsr: nonNegativeNumber,
  minimumSafeBufferMonths: nonNegativeNumber,
  minimumStressCashFlow: finiteNumber,
  mandatoryExpenseStressPercent: nonNegativeNumber,
  incomeLossStressPercent: nonNegativeNumber,
});

const providerMonthlyPaymentsSchema = z
  .record(z.string().regex(/^[1-9]\d*$/), positiveNumber)
  .transform(
    (values) =>
      Object.fromEntries(
        Object.entries(values).map(([tenor, amount]) => [
          Number(tenor),
          amount,
        ]),
      ) as Record<number, number>,
  );

const simulationPlanSchema = z
  .object({
    kind: z.enum([
      "CASH_LOAN",
      "GOODS_CREDIT",
      "CREDIT_CARD_PURCHASE",
      "PAYLATER",
      "NON_CARD_INSTALLMENT",
      "VEHICLE_FINANCING",
      "HOME_FINANCING",
      "CUSTOM",
    ]),
    name: z.string().trim().min(2).max(150),
    itemCategory: z.string().trim().min(1).max(100).optional(),
    brand: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(100).optional(),
    specification: z.string().trim().min(1).max(500).optional(),
    cashPriceOrLoanAmount: positiveNumber,
    creditPrice: positiveNumber.optional(),
    downPayment: nonNegativeNumber,
    administrationFee: optionalNonNegativeNumber,
    insuranceFee: optionalNonNegativeNumber,
    additionalFee: optionalNonNegativeNumber,
    annualInterestRate: optionalNonNegativeNumber,
    interestMethod: interestMethodSchema,
    tenors: z.array(z.coerce.number().int().min(1).max(600)).min(1).max(30),
    providerMonthlyPayments: providerMonthlyPaymentsSchema.optional(),
    firstInstallmentDate: z.coerce.date(),
    dueDay: z.coerce.number().int().min(1).max(31),
    needLevel: z.enum([
      "WANT",
      "IMPORTANT",
      "PRIMARY_NEED",
      "URGENT",
      "EMERGENCY",
    ]),
    urgentReason: z.string().trim().min(3).max(500).optional(),
    purchaseDeadline: z.coerce.date().optional(),
    impactIfNotPurchased: z.string().trim().min(1).max(500).optional(),
    cheaperAlternativeAvailable: z.boolean().optional(),
    relatedToWorkHealthOrSafety: z.boolean().optional(),
    notes: z.string().trim().max(1_000).optional(),
  })
  .superRefine((value, context) => {
    if (value.downPayment > value.cashPriceOrLoanAmount) {
      context.addIssue({
        code: "custom",
        path: ["downPayment"],
        message: "Uang muka tidak boleh melebihi harga atau jumlah pinjaman",
      });
    }
    if (
      ["URGENT", "EMERGENCY"].includes(value.needLevel) &&
      !value.urgentReason
    ) {
      context.addIssue({
        code: "custom",
        path: ["urgentReason"],
        message: "Alasan wajib diisi untuk kebutuhan mendesak atau darurat",
      });
    }
  });

export const debtSimulationSchema = z.object({
  asOf: z.coerce.date(),
  plan: simulationPlanSchema,
  incomeSources: z.array(incomeSourceSchema).max(100),
  savingsAccounts: z.array(savingsAccountSchema).max(100),
  activeDebts: z.array(activeDebtSchema).max(100),
  mandatoryExpenses: optionalNonNegativeNumber,
  routineNeeds: optionalNonNegativeNumber,
  minimumMonthlySavings: optionalNonNegativeNumber,
  safetyBuffer: optionalNonNegativeNumber,
  emergencyNeedAmount: optionalNonNegativeNumber,
  thresholds: thresholdsSchema.partial().optional(),
  flexibleBudgets: z.array(flexibleBudgetSchema).max(100).optional(),
});

const stressTestSchema = z.object({
  scenario: z.enum([
    "SALARY_DELAY_ONE_MONTH",
    "MANDATORY_EXPENSES_INCREASE",
    "EMERGENCY_NEED",
    "EXISTING_DEBT_PENALTY",
    "PURCHASE_COST_INCREASE",
    "FIXED_INCOME_LOSS",
  ]),
  label: z.string().min(1),
  remainingCashFlow: finiteNumber,
  usableSavingsAfterScenario: finiteNumber,
  bufferMonths: finiteNumber,
  passed: z.boolean(),
  explanation: z.string().min(1),
});

const tenorSimulationSchema = z.object({
  tenorMonths: z.coerce.number().int().min(1).max(600),
  financedPrincipal: nonNegativeNumber,
  downPayment: nonNegativeNumber,
  monthlyInstallment: nonNegativeNumber,
  monthlyInterestFirst: nonNegativeNumber,
  averageMonthlyInterest: nonNegativeNumber,
  totalInterest: nonNegativeNumber,
  totalFees: nonNegativeNumber,
  totalPayment: nonNegativeNumber,
  differenceFromCashPrice: finiteNumber,
  currentDsr: finiteNumber.nullable(),
  dsrAfter: finiteNumber.nullable(),
  freeCashFlowBefore: finiteNumber.nullable(),
  freeCashFlowAfter: finiteNumber.nullable(),
  maximumNewInstallment: finiteNumber.nullable(),
  savingsAfterDownPayment: finiteNumber,
  savingsBufferMonths: nonNegativeNumber,
  healthStatus: z.enum([
    "HEALTHY",
    "FAIRLY_HEALTHY",
    "NEEDS_ATTENTION",
    "UNHEALTHY",
    "CRITICAL",
    "INSUFFICIENT_DATA",
    "URGENT_OVERRIDE",
  ]),
  activationDecision: z.enum([
    "CAN_ACTIVATE",
    "REQUIRES_EXTRA_CONFIRMATION",
    "BLOCKED",
    "URGENT_OVERRIDE_REQUIRED",
  ]),
  urgentOverrideEligible: z.boolean(),
  canActivate: z.boolean(),
  reasons: z.array(z.string()),
  suggestions: z.array(z.string()),
  stressTests: z.array(stressTestSchema),
});

export const urgentOverrideSchema = z.object({
  simulation: tenorSimulationSchema,
  needLevel: z.enum([
    "WANT",
    "IMPORTANT",
    "PRIMARY_NEED",
    "URGENT",
    "EMERGENCY",
  ]),
  reason: z.string().trim().min(3).max(500),
  cannotDelayReason: z.string().trim().min(3).max(500),
  cheaperAlternativeReviewed: z.boolean(),
  financialImpactReviewed: z.boolean(),
  affectedObligationsReviewed: z.boolean(),
  mitigationPlan: z.array(z.string().trim().min(2).max(300)).min(1).max(20),
  riskConfirmed: z.boolean(),
});
