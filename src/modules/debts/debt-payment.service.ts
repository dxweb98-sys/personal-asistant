import { randomUUID } from "node:crypto";
import { HttpError } from "../../common/http-error.js";
import { moneyToNumber } from "../../common/money.js";
import { prisma } from "../../lib/prisma.js";
import { financeService } from "../finance/finance.service.js";
import { debtService } from "./debt.service.js";

export const debtPaymentService = {
  async payFromBank(userId: string, debtId: string, input: any) {
    const baseIdempotencyKey =
      input.idempotencyKey ?? `debt-bank-${randomUUID()}`;
    return prisma.$transaction(async (tx: any) => {
      const debt = await tx.debt.findFirst({
        where: { id: debtId, userId },
        select: { id: true, name: true, currency: true },
      });
      if (!debt) throw new HttpError(404, "Utang tidak ditemukan");
      const account = await tx.financialAccount.findFirst({
        where: {
          id: input.sourceAccountId,
          userId,
          type: "BANK",
          isActive: true,
          status: "ACTIVE",
        },
      });
      if (!account) {
        throw new HttpError(
          404,
          "Rekening bank sumber tidak ditemukan atau sudah tidak aktif",
        );
      }
      if (account.currency !== debt.currency) {
        throw new HttpError(
          400,
          `Mata uang rekening harus sama dengan utang (${debt.currency})`,
        );
      }
      const existingPayment = await tx.debtPayment.findUnique({
        where: { idempotencyKey: `${baseIdempotencyKey}:debt` },
        select: { debtId: true, amount: true, sourceAccountId: true },
      });
      if (
        existingPayment &&
        (existingPayment.debtId !== debtId ||
          moneyToNumber(existingPayment.amount) !== input.amount ||
          existingPayment.sourceAccountId !== account.id)
      ) {
        throw new HttpError(409, "Idempotency key sudah digunakan");
      }
      if (!existingPayment) {
        const reservation = await tx.financialAccount.updateMany({
          where: {
            id: account.id,
            userId,
            type: "BANK",
            isActive: true,
            status: "ACTIVE",
            currentBalance: { gte: input.amount },
          },
          data: { lastUsedAt: new Date() },
        });
        if (reservation.count !== 1) {
          const latest = await tx.financialAccount.findUnique({
            where: { id: account.id },
          });
          throw new HttpError(422, "Saldo rekening bank tidak mencukupi", {
            availableBalance: moneyToNumber(latest?.currentBalance ?? 0),
            paymentAmount: input.amount,
          });
        }
      }

      const debtResult: any = await debtService.pay(
        userId,
        debtId,
        {
          ...input,
          sourceAccountId: account.id,
          idempotencyKey: `${baseIdempotencyKey}:debt`,
        },
        tx,
      );
      const transaction = await financeService.recordWithinTransaction(
        tx,
        userId,
        {
          type: "DEBT_PAYMENT",
          sourceAccountId: account.id,
          debtId,
          amount: input.amount,
          currency: debt.currency,
          occurredAt: input.paidAt ?? new Date(),
          description: `Pembayaran utang ${debt.name}`,
          referenceType: "DEBT_PAYMENT",
          referenceId: debtResult.payment.id,
          idempotencyKey: `${baseIdempotencyKey}:cashflow`,
          metadata: {
            installmentId: input.installmentId ?? null,
            paymentSource: input.source,
          },
        },
      );
      const updatedAccount = await tx.financialAccount.findUnique({
        where: { id: account.id },
      });
      const updatedDebt =
        debtResult.debt ??
        (await tx.debt.findUnique({
          where: { id: debtId },
          select: {
            id: true,
            name: true,
            remainingPrincipal: true,
            status: true,
          },
        }));

      return {
        ...debtResult,
        debt: updatedDebt,
        financialTransaction: transaction,
        sourceAccount: updatedAccount,
      };
    });
  },
};
