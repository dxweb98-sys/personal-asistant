export type DebtInterestMethod =
  | "NONE"
  | "FLAT"
  | "EFFECTIVE"
  | "ANNUITY"
  | "MANUAL_CONTRACT"
  | "MANUAL_SCHEDULE";

export type PenaltyCalculationType =
  | "NONE"
  | "FIXED_ONCE"
  | "FIXED_PER_DAY"
  | "PERCENTAGE_ONCE"
  | "PERCENTAGE_PER_DAY"
  | "MANUAL";

export type PenaltyPostingStrategy =
  | "CURRENT_OVERDUE_BILL"
  | "NEXT_INSTALLMENT"
  | "END_OF_TENOR";

export type PenaltyPercentageBase =
  | "BASE_INSTALLMENT"
  | "OUTSTANDING_INSTALLMENT"
  | "ARREARS"
  | "REMAINING_PRINCIPAL";

export type PenaltyRoundingRule =
  | "NONE"
  | "UP_TO_UNIT"
  | "UP_TO_HUNDRED"
  | "UP_TO_THOUSAND"
  | "NEAREST_UNIT"
  | "NEAREST_HUNDRED"
  | "NEAREST_THOUSAND";

export type DebtHealthStatus =
  | "HEALTHY"
  | "NEEDS_ATTENTION"
  | "UNHEALTHY"
  | "CRITICAL"
  | "INSUFFICIENT_DATA";

export type PaymentComponent =
  | "DUE_PENALTY"
  | "ARREARS"
  | "INTEREST"
  | "FEES"
  | "PRINCIPAL"
  | "DEFERRED_PENALTY";

export type ManualScheduleItem = {
  installmentNumber: number;
  dueDate: Date;
  principal: number;
  interest: number;
  fees?: number;
  baseInstallment?: number;
};

export type DebtScheduleInput = {
  principal: number;
  tenorMonths: number;
  firstDueDate: Date;
  interestMethod: DebtInterestMethod;
  annualInterestRate?: number;
  contractBaseInstallment?: number;
  recurringFeePerInstallment?: number;
  totalFeesIncludedInInstallments?: number;
  manualSchedule?: ManualScheduleItem[];
};

export type DebtInstallmentCalculation = {
  installmentNumber: number;
  period: string;
  dueDate: Date;
  openingPrincipal: number;
  principal: number;
  interest: number;
  fees: number;
  baseInstallment: number;
  closingPrincipal: number;
  estimated: boolean;
};

export type DebtScheduleResult = {
  interestMethod: DebtInterestMethod;
  installments: DebtInstallmentCalculation[];
  totalPrincipal: number;
  totalInterest: number;
  averageMonthlyInterest: number;
  totalFees: number;
  totalContractPayment: number;
  estimated: boolean;
  warnings: string[];
};

export type PenaltyRuleInput = {
  calculationType: PenaltyCalculationType;
  postingStrategy: PenaltyPostingStrategy;
  amount?: number;
  ratePercent?: number;
  percentageBase?: PenaltyPercentageBase;
  graceDays?: number;
  maxAmount?: number;
  roundingRule?: PenaltyRoundingRule;
  stopOnPayment?: boolean;
  allowPenaltyOnPenalty?: boolean;
  version?: number;
};

export type PenaltyCalculationInput = {
  installmentId: string;
  dueDate: Date;
  asOf: Date;
  paidAt?: Date;
  baseInstallment: number;
  outstandingInstallment: number;
  arrears: number;
  remainingPrincipal: number;
  existingPenalty?: number;
  manualAmount?: number;
  rule: PenaltyRuleInput;
};

export type PenaltyCalculationResult = {
  installmentId: string;
  lateDays: number;
  chargeableDays: number;
  calculationBase: number;
  calculatedAmount: number;
  totalPenalty: number;
  postingStrategy: PenaltyPostingStrategy;
  sourceDueDate: Date;
  accruedThrough: Date;
  idempotencyKey: string;
  estimated: boolean;
};

export type PaymentAllocationInput = {
  amount: number;
  duePenalty: number;
  arrears: number;
  interest: number;
  fees: number;
  principal: number;
  deferredPenalty?: number;
  order?: PaymentComponent[];
  allowedComponents?: PaymentComponent[];
  includeDeferredPenalty?: boolean;
};

export type PaymentAllocationResult = {
  requestedAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  allocations: Record<PaymentComponent, number>;
  remaining: Record<PaymentComponent, number>;
  installmentFullyPaid: boolean;
};

export type DebtHealthThresholds = {
  healthyMaxDsr: number;
  attentionMaxDsr: number;
  unhealthyMaxDsr: number;
  severeLateDays: number;
  criticalLateDays: number;
};

export type DebtHealthInput = {
  monthlyNetIncome?: number;
  mandatoryExpenses?: number;
  monthlyDebtService: number;
  freeCashFlow?: number;
  overdueInstallments: number;
  maxLateDays: number;
  activePenalty: number;
  nextPaymentAmount: number;
  availableCash?: number;
  emergencyFundMonths?: number;
  thresholds?: Partial<DebtHealthThresholds>;
};

export type DebtHealthResult = {
  status: DebtHealthStatus;
  debtServiceRatio: number | null;
  freeCashFlow: number | null;
  reasons: string[];
  suggestions: string[];
  thresholds: DebtHealthThresholds;
};
