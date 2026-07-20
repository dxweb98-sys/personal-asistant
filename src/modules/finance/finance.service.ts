import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../common/http-error.js";
import type { z } from "zod";
import {
  accountSchema,
  categorySchema,
  transactionSchema,
} from "./finance.schema.js";
import { settingsService } from "../settings/settings.service.js";
import { convertCurrency } from "../../common/fx.js";
type AccountInput = z.infer<typeof accountSchema>;
type CategoryInput = z.infer<typeof categorySchema>;
type TxInput = z.infer<typeof transactionSchema>;
export const financeService = {
  async createAccount(userId: string, input: AccountInput) {
    return prisma.financialAccount.create({
      data: {
        ...input,
        currency: input.currency.toUpperCase(),
        userId,
        currentBalance: input.openingBalance,
      },
    });
  },
  async listAccounts(userId: string) {
    return prisma.financialAccount.findMany({
      where: { userId, isActive: true },
      orderBy: { name: "asc" },
    });
  },
  async createCategory(userId: string, input: CategoryInput) {
    return prisma.transactionCategory.create({ data: { ...input, userId } });
  },
  async listTransactions(userId: string, from?: Date, to?: Date) {
    return prisma.financialTransaction.findMany({
      where: { userId, occurredAt: { gte: from, lte: to } },
      include: {
        category: true,
        sourceAccount: true,
        destinationAccount: true,
      },
      orderBy: { occurredAt: "desc" },
    });
  },
  async record(userId: string, input: TxInput) {
    if (input.idempotencyKey) {
      const old = await prisma.financialTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (old) return old;
    }
    return prisma.$transaction(async (tx) => {
      const source = input.sourceAccountId
        ? await tx.financialAccount.findFirst({
            where: { id: input.sourceAccountId, userId },
          })
        : null;
      const dest = input.destinationAccountId
        ? await tx.financialAccount.findFirst({
            where: { id: input.destinationAccountId, userId },
          })
        : null;
      if (input.sourceAccountId && !source)
        throw new HttpError(404, "Akun sumber tidak ditemukan");
      if (input.destinationAccountId && !dest)
        throw new HttpError(404, "Akun tujuan tidak ditemukan");
      if (input.type === "INCOME" && !dest)
        throw new HttpError(400, "Income membutuhkan destinationAccountId");
      if (["EXPENSE", "DEBT_PAYMENT"].includes(input.type) && !source)
        throw new HttpError(400, "Transaksi membutuhkan sourceAccountId");
      if (input.type === "TRANSFER" && (!source || !dest))
        throw new HttpError(400, "Transfer membutuhkan akun sumber dan tujuan");
      const currency = (
        input.currency ??
        source?.currency ??
        dest?.currency ??
        "IDR"
      ).toUpperCase();
      if (source && source.currency !== currency)
        throw new HttpError(
          400,
          `Nominal transaksi harus menggunakan mata uang akun sumber (${source.currency})`,
        );
      if (dest && dest.currency !== currency && input.type !== "TRANSFER")
        throw new HttpError(
          400,
          `Nominal transaksi harus menggunakan mata uang akun tujuan (${dest.currency})`,
        );
      if (source)
        await tx.financialAccount.update({
          where: { id: source.id },
          data: { currentBalance: { decrement: input.amount } },
        });
      if (dest)
        await tx.financialAccount.update({
          where: { id: dest.id },
          data: { currentBalance: { increment: input.amount } },
        });
      if (
        input.type === "EXPENSE" &&
        source &&
        ["CREDIT_CARD", "PAYLATER"].includes(source.type)
      ) {
        if (!input.debtId)
          throw new HttpError(
            400,
            "Pengeluaran kartu kredit/paylater membutuhkan debtId",
          );
        const debt = await tx.debt.findFirst({
          where: { id: input.debtId, userId },
        });
        if (!debt) throw new HttpError(404, "Debt tidak ditemukan");
        if (debt.currency !== currency)
          throw new HttpError(
            400,
            "Mata uang debt harus sama dengan kartu kredit/paylater",
          );
        await tx.debt.update({
          where: { id: debt.id },
          data: {
            originalPrincipal: { increment: input.amount },
            remainingPrincipal: { increment: input.amount },
          },
        });
      }
      return tx.financialTransaction.create({
        data: {
          ...input,
          currency,
          userId,
          occurredAt: input.occurredAt ?? new Date(),
        },
      });
    });
  },
  async cashflow(userId: string, from: Date, to: Date) {
    const pref = await settingsService.get(userId);
    const rows = await prisma.financialTransaction.findMany({
      where: { userId, occurredAt: { gte: from, lte: to } },
    });
    const totals = { INCOME: 0, EXPENSE: 0, DEBT_PAYMENT: 0 };
    const missing = new Set<string>();
    for (const r of rows) {
      if (!["INCOME", "EXPENSE", "DEBT_PAYMENT"].includes(r.type)) continue;
      const cv = await convertCurrency(
        userId,
        Number(r.amount),
        r.currency,
        pref.baseCurrency,
        pref.fxStaleHours,
      );
      if (cv.convertedAmount === null) {
        missing.add(r.currency);
        continue;
      }
      (totals as any)[r.type] += cv.convertedAmount;
    }
    return {
      from,
      to,
      currency: pref.baseCurrency,
      income: totals.INCOME,
      expense: totals.EXPENSE,
      debtPayment: totals.DEBT_PAYMENT,
      netCashFlow: totals.INCOME - totals.EXPENSE - totals.DEBT_PAYMENT,
      missingCurrencies: [...missing],
    };
  },
};
