import type {
  PaymentAllocationInput,
  PaymentAllocationResult,
  PaymentComponent,
  PenaltyCalculationInput,
  PenaltyCalculationResult,
  PenaltyRoundingRule,
} from "./debt-calculation.types.js";
import {
  assertFiniteNonNegative,
  daysBetween,
  roundMoney,
  utcDateOnly,
} from "./debt-calculation.shared.js";

const DEFAULT_ORDER: PaymentComponent[] = [
  "DUE_PENALTY",
  "ARREARS",
  "INTEREST",
  "FEES",
  "PRINCIPAL",
];

function applyRounding(
  value: number,
  rule: PenaltyRoundingRule = "NONE",
): number {
  if (rule === "NONE") return roundMoney(value);
  const unit = rule.endsWith("THOUSAND")
    ? 1_000
    : rule.endsWith("HUNDRED")
      ? 100
      : 1;
  return roundMoney(
    (rule.startsWith("UP_TO") ? Math.ceil(value / unit) : Math.round(value / unit)) *
      unit,
  );
}

export function calculatePenalty(
  input: PenaltyCalculationInput,
): PenaltyCalculationResult {
  const { rule } = input;
  const stopDate =
    rule.stopOnPayment !== false && input.paidAt && input.paidAt < input.asOf
      ? input.paidAt
      : input.asOf;
  const lateDays = daysBetween(input.dueDate, stopDate);
  const chargeableDays = Math.max(
    0,
    lateDays - Math.max(0, Math.floor(rule.graceDays ?? 0)),
  );
  const bases = {
    BASE_INSTALLMENT: input.baseInstallment,
    OUTSTANDING_INSTALLMENT: input.outstandingInstallment,
    ARREARS: input.arrears,
    REMAINING_PRINCIPAL: input.remainingPrincipal,
  } as const;
  const rawBase = Math.max(
    0,
    bases[rule.percentageBase ?? "OUTSTANDING_INSTALLMENT"],
  );
  const calculationBase = roundMoney(
    rawBase + (rule.allowPenaltyOnPenalty ? input.existingPenalty ?? 0 : 0),
  );

  let rawAmount = 0;
  if (chargeableDays > 0) {
    if (rule.calculationType === "FIXED_ONCE") rawAmount = rule.amount ?? 0;
    if (rule.calculationType === "FIXED_PER_DAY") {
      rawAmount = (rule.amount ?? 0) * chargeableDays;
    }
    if (rule.calculationType === "PERCENTAGE_ONCE") {
      rawAmount = calculationBase * ((rule.ratePercent ?? 0) / 100);
    }
    if (rule.calculationType === "PERCENTAGE_PER_DAY") {
      rawAmount =
        calculationBase * ((rule.ratePercent ?? 0) / 100) * chargeableDays;
    }
    if (rule.calculationType === "MANUAL") {
      rawAmount = input.manualAmount ?? 0;
    }
  }
  if (rule.maxAmount !== undefined) {
    rawAmount = Math.min(rawAmount, Math.max(0, rule.maxAmount));
  }
  const calculatedAmount = applyRounding(rawAmount, rule.roundingRule);
  const accruedThrough = utcDateOnly(stopDate);
  return {
    installmentId: input.installmentId,
    lateDays,
    chargeableDays,
    calculationBase,
    calculatedAmount,
    totalPenalty: roundMoney((input.existingPenalty ?? 0) + calculatedAmount),
    postingStrategy: rule.postingStrategy,
    sourceDueDate: utcDateOnly(input.dueDate),
    accruedThrough,
    idempotencyKey: `${input.installmentId}:${rule.version ?? 1}:${accruedThrough.toISOString().slice(0, 10)}`,
    estimated: rule.calculationType === "MANUAL",
  };
}

export function allocateDebtPayment(
  input: PaymentAllocationInput,
): PaymentAllocationResult {
  assertFiniteNonNegative("amount", input.amount);
  const remaining: Record<PaymentComponent, number> = {
    DUE_PENALTY: roundMoney(input.duePenalty),
    ARREARS: roundMoney(input.arrears),
    INTEREST: roundMoney(input.interest),
    FEES: roundMoney(input.fees),
    PRINCIPAL: roundMoney(input.principal),
    DEFERRED_PENALTY: roundMoney(input.deferredPenalty ?? 0),
  };
  for (const [component, amount] of Object.entries(remaining)) {
    assertFiniteNonNegative(component, amount);
  }

  const allowed = new Set<PaymentComponent>(
    input.allowedComponents ?? [
      ...DEFAULT_ORDER,
      ...(input.includeDeferredPenalty ? ["DEFERRED_PENALTY" as const] : []),
    ],
  );
  const order = input.order ?? [
    ...DEFAULT_ORDER,
    ...(input.includeDeferredPenalty ? ["DEFERRED_PENALTY" as const] : []),
  ];
  const allocations: Record<PaymentComponent, number> = {
    DUE_PENALTY: 0,
    ARREARS: 0,
    INTEREST: 0,
    FEES: 0,
    PRINCIPAL: 0,
    DEFERRED_PENALTY: 0,
  };
  let unallocatedAmount = roundMoney(input.amount);

  for (const component of order) {
    if (!allowed.has(component) || unallocatedAmount <= 0) continue;
    const allocated = Math.min(unallocatedAmount, remaining[component]);
    allocations[component] = roundMoney(allocated);
    remaining[component] = roundMoney(remaining[component] - allocated);
    unallocatedAmount = roundMoney(unallocatedAmount - allocated);
  }

  return {
    requestedAmount: roundMoney(input.amount),
    allocatedAmount: roundMoney(input.amount - unallocatedAmount),
    unallocatedAmount,
    allocations,
    remaining,
    installmentFullyPaid:
      remaining.DUE_PENALTY === 0 &&
      remaining.ARREARS === 0 &&
      remaining.INTEREST === 0 &&
      remaining.FEES === 0 &&
      remaining.PRINCIPAL === 0,
  };
}
