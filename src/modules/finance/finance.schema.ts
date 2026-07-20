import { z } from "zod";

export const accountSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.enum([
    "CASH",
    "BANK",
    "E_WALLET",
    "CREDIT_CARD",
    "PAYLATER",
    "CRYPTO_WALLET",
    "INVESTMENT",
    "OTHER",
  ]),
  currency: z.string().trim().min(3).max(5).default("IDR"),
  openingBalance: z.coerce.number().default(0),
});

export const accountArchiveSchema = z.object({
  targetAccountId: z.string().uuid().optional(),
  useUnallocatedFunds: z.boolean().default(false),
  reason: z.string().trim().min(2).max(500).default("Diarsipkan oleh pengguna"),
  fxRate: z.coerce.number().positive().optional(),
  conversionFee: z.coerce.number().min(0).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  transactionType: z.enum([
    "INCOME",
    "EXPENSE",
    "TRANSFER",
    "INVESTMENT_BUY",
    "INVESTMENT_SELL",
    "DIVIDEND",
    "DEBT_PAYMENT",
    "ADJUSTMENT",
  ]),
});

export const transactionSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER", "DEBT_PAYMENT", "ADJUSTMENT"]),
  categoryId: z.string().uuid().optional(),
  sourceAccountId: z.string().uuid().optional(),
  destinationAccountId: z.string().uuid().optional(),
  debtId: z.string().uuid().optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().min(3).max(5).default("IDR"),
  occurredAt: z.coerce.date().optional(),
  description: z.string().trim().max(500).optional(),
  referenceType: z.string().trim().max(100).optional(),
  referenceId: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  tagIds: z.array(z.string().uuid()).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  fxRate: z.coerce.number().positive().optional(),
  targetAmount: z.coerce.number().positive().optional(),
  conversionFee: z.coerce.number().min(0).optional(),
});

export const transactionCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  actor: z.string().trim().min(2).max(100).default("USER"),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export const transactionListSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  accountId: z.string().uuid().optional(),
  type: z
    .enum(["INCOME", "EXPENSE", "TRANSFER", "DEBT_PAYMENT", "ADJUSTMENT"])
    .optional(),
  status: z.enum(["POSTED", "VOIDED", "REVERSAL"]).optional(),
  includeCancelled: z.coerce.boolean().default(false),
  includeArchivedAccounts: z.coerce.boolean().default(false),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(30),
});

export const templateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  payload: transactionSchema.omit({ idempotencyKey: true }).partial({ amount: true }),
  isFavorite: z.boolean().default(false),
});

export const templateUpdateSchema = templateSchema.partial();

export const historyQuerySchema = z.object({
  fieldType: z.string().trim().min(2).max(100),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export const tagSchema = z.object({
  name: z.string().trim().min(1).max(50),
});
