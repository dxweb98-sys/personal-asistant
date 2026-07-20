import { z } from "zod";
const money = z.coerce.number().nonnegative();
const optionalDate = z.coerce.date().optional();
const lateFeeRuleSchema = z
  .object({
    calculationType: z
      .enum([
        "NONE",
        "FIXED",
        "DAILY",
        "PERCENTAGE_DAILY",
        "PERCENTAGE_FIXED",
        "MANUAL",
      ])
      .default("NONE"),
    fixedAmount: money.default(0),
    dailyAmount: money.default(0),
    percentage: money.default(0),
    percentageBase: z
      .enum(["INSTALLMENT_AMOUNT", "UNPAID_INSTALLMENT", "REMAINING_PRINCIPAL"])
      .default("UNPAID_INSTALLMENT"),
    graceDays: z.coerce.number().int().min(0).default(0),
    maxDays: z.coerce.number().int().positive().optional(),
    maxAmount: money.optional(),
    settlementPolicy: z
      .enum(["IMMEDIATE", "NEXT_INSTALLMENT", "END_OF_TERM", "MANUAL"])
      .default("MANUAL"),
  })
  .superRefine((v, ctx) => {
    if (v.calculationType === "FIXED" && v.fixedAmount <= 0)
      ctx.addIssue({
        code: "custom",
        message: "fixedAmount wajib lebih dari 0",
      });
    if (v.calculationType === "DAILY" && v.dailyAmount <= 0)
      ctx.addIssue({
        code: "custom",
        message: "dailyAmount wajib lebih dari 0",
      });
    if (
      ["PERCENTAGE_DAILY", "PERCENTAGE_FIXED"].includes(v.calculationType) &&
      v.percentage <= 0
    )
      ctx.addIssue({
        code: "custom",
        message: "percentage wajib lebih dari 0",
      });
  });
const debtBaseSchema = z.object({
  name: z.string().min(2),
  creditor: z.string().min(2),
  description: z.string().optional(),
  originalPrincipal: money.positive(),
  remainingPrincipal: money.optional(),
  paymentPolicy: z.enum(["FIXED", "FLEXIBLE", "NEGOTIABLE"]),
  fixedMonthlyAmount: money.default(0),
  minimumMonthlyAmount: money.default(0),
  targetMonthlyAmount: money.default(0),
  interestRateAnnual: money.default(0),
  startDate: optionalDate,
  maturityDate: optionalDate,
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  tenorMonths: z.coerce.number().int().positive().max(600).optional(),
  generateInstallments: z.boolean().default(false),
  priority: z.enum(["CRITICAL", "URGENT", "NORMAL", "SLOW"]).default("NORMAL"),
  canBeNegotiated: z.boolean().default(false),
  allocationPolicy: z
    .enum([
      "OLDEST_CHARGE_FIRST",
      "CURRENT_INSTALLMENT_FIRST",
      "PRINCIPAL_FIRST",
      "MANUAL",
    ])
    .default("CURRENT_INSTALLMENT_FIRST"),
  notes: z.string().optional(),
  lateFeeRule: lateFeeRuleSchema.optional(),
});

const debtPartialSchema = debtBaseSchema.partial();
type PartialDebtInput = z.output<typeof debtPartialSchema>;

const validateDebt = (v: PartialDebtInput, ctx: z.RefinementCtx) => {
  if (v.paymentPolicy === "FIXED" && Number(v.fixedMonthlyAmount ?? 0) <= 0)
    ctx.addIssue({
      code: "custom",
      message: "fixedMonthlyAmount wajib untuk FIXED",
      path: ["fixedMonthlyAmount"],
    });
  if (v.generateInstallments === true && !v.tenorMonths)
    ctx.addIssue({
      code: "custom",
      message: "tenorMonths wajib jika generateInstallments=true",
      path: ["tenorMonths"],
    });
  if (v.generateInstallments === true && !v.startDate)
    ctx.addIssue({
      code: "custom",
      message: "startDate wajib jika generateInstallments=true",
      path: ["startDate"],
    });
  if (v.generateInstallments === true && !v.dueDay)
    ctx.addIssue({
      code: "custom",
      message: "dueDay wajib jika generateInstallments=true",
      path: ["dueDay"],
    });
};

export const createDebtSchema = debtBaseSchema.superRefine(validateDebt);
export const updateDebtSchema = debtPartialSchema.superRefine(validateDebt);
export const createInstallmentSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  scheduledPrincipal: money.positive(),
  dueDate: z.coerce.date(),
  expectedPaymentDate: optionalDate,
});
export const planLateSchema = z.object({
  expectedPaymentDate: z.coerce.date(),
  estimatedLateFee: money.optional(),
  note: z.string().optional(),
});
export const paymentSchema = z.object({
  amount: money.positive(),
  paidAt: z.coerce.date().optional(),
  source: z.enum(["MANUAL", "TELEGRAM", "SYSTEM"]).default("MANUAL"),
  note: z.string().optional(),
  idempotencyKey: z.string().min(8).optional(),
  installmentId: z.string().uuid().optional(),
});
export const chargeSchema = z.object({
  type: z.enum(["LATE_FEE", "INTEREST", "ADMIN_FEE", "OTHER"]),
  amount: money.positive(),
  settlementPolicy: z.enum([
    "IMMEDIATE",
    "NEXT_INSTALLMENT",
    "END_OF_TERM",
    "MANUAL",
  ]),
  sourceInstallmentId: z.string().uuid().optional(),
  targetPeriod: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  estimated: z.boolean().default(false),
  description: z.string().optional(),
});
export const negotiationSchema = z.object({
  status: z.enum(["AVAILABLE", "IN_PROGRESS", "AGREED", "REJECTED", "EXPIRED"]),
  previousMonthlyAmount: money.optional(),
  agreedMonthlyAmount: money.optional(),
  effectiveFrom: optionalDate,
  effectiveUntil: optionalDate,
  reason: z.string().optional(),
  notes: z.string().optional(),
});
export const adjustmentSchema = z.object({
  type: z.enum([
    "DUE_DATE_EXTENSION",
    "PAYMENT_REDUCTION",
    "PAYMENT_HOLIDAY",
    "LATE_FEE_WAIVER",
    "OTHER",
  ]),
  newDueDate: optionalDate,
  newAmount: money.optional(),
  lateFeeWaived: z.boolean().default(false),
  reason: z.string().optional(),
});
