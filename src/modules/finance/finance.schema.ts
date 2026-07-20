import { z } from "zod";
export const accountSchema = z.object({
  name: z.string().min(2),
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
  currency: z.string().default("IDR"),
  openingBalance: z.coerce.number().default(0),
});
export const categorySchema = z.object({
  name: z.string().min(2),
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
  currency: z.string().default("IDR"),
  occurredAt: z.coerce.date().optional(),
  description: z.string().optional(),
  idempotencyKey: z.string().optional(),
});
