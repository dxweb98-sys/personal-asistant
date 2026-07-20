import type { z } from "zod";
import { convertCurrency } from "../../common/fx.js";
import { HttpError } from "../../common/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { settingsService } from "../settings/settings.service.js";
import {
  accountArchiveSchema,
  accountSchema,
  categorySchema,
  transactionCancelSchema,
  transactionListSchema,
  transactionSchema,
} from "./finance.schema.js";

type AccountInput = z.infer<typeof accountSchema>;
type CategoryInput = z.infer<typeof categorySchema>;
type TxInput = z.infer<typeof transactionSchema>;
type ArchiveInput = z.infer<typeof accountArchiveSchema>;
type CancelInput = z.infer<typeof transactionCancelSchema>;
type ListInput = z.infer<typeof transactionListSchema>;

const db = prisma as any;
const numberValue = (value: unknown) => Number(value ?? 0) || 0;
const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
const jsonSafe = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );

async function activeAccount(
  tx: any,
  userId: string,
  id?: string,
  label = "Account",
) {
  if (!id) return null;
  const account = await tx.financialAccount.findFirst({
    where: { id, userId },
  });
  if (!account) throw new HttpError(404, `${label} tidak ditemukan`);
  if (!account.isActive || account.status === "ARCHIVED") {
    throw new HttpError(409, `${label} sudah diarsipkan`);
  }
  return account;
}

async function snapshot(userId: string, input: TxInput) {
  const pref = await settingsService.get(userId);
  const converted = await convertCurrency(
    userId,
    input.amount,
    input.currency,
    pref.baseCurrency,
    pref.fxStaleHours,
  );
  return {
    baseCurrency: pref.baseCurrency,
    baseAmount: converted.convertedAmount,
    fxRateToBase: converted.rate,
    fxCapturedAt: converted.rateAsOf,
    fxStatus: converted.status,
  };
}

async function saveHistory(
  tx: any,
  userId: string,
  fieldType: string,
  value?: string | null,
) {
  const clean = value?.trim().replace(/\s+/g, " ");
  if (!clean) return;
  await tx.transactionFieldHistory.upsert({
    where: {
      userId_fieldType_normalizedValue: {
        userId,
        fieldType,
        normalizedValue: normalize(clean),
      },
    },
    create: {
      userId,
      fieldType,
      value: clean,
      normalizedValue: normalize(clean),
      usageCount: 1,
      lastUsedAt: new Date(),
    },
    update: {
      value: clean,
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

async function recordInTransaction(
  tx: any,
  userId: string,
  input: TxInput,
  fx: any,
) {
  if (input.idempotencyKey) {
    const existing = await tx.financialTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.userId !== userId)
        throw new HttpError(409, "Idempotency key sudah digunakan");
      return existing;
    }
  }

  const source = await activeAccount(
    tx,
    userId,
    input.sourceAccountId,
    "Account sumber",
  );
  const destination = await activeAccount(
    tx,
    userId,
    input.destinationAccountId,
    "Account tujuan",
  );
  if (input.type === "INCOME" && !destination)
    throw new HttpError(400, "Pendapatan membutuhkan account tujuan");
  if (["EXPENSE", "DEBT_PAYMENT"].includes(input.type) && !source) {
    throw new HttpError(400, "Transaksi membutuhkan account sumber");
  }
  if (input.type === "TRANSFER" && (!source || !destination)) {
    throw new HttpError(400, "Transfer membutuhkan account sumber dan tujuan");
  }
  if (source && destination && source.id === destination.id) {
    throw new HttpError(400, "Account sumber dan tujuan tidak boleh sama");
  }

  const currency = (
    input.currency ??
    source?.currency ??
    destination?.currency ??
    "IDR"
  ).toUpperCase();
  if (source && source.currency !== currency) {
    throw new HttpError(400, `Mata uang transaksi harus ${source.currency}`);
  }
  if (
    destination &&
    input.type !== "TRANSFER" &&
    destination.currency !== currency
  ) {
    throw new HttpError(
      400,
      `Mata uang transaksi harus ${destination.currency}`,
    );
  }

  let destinationAmount = input.amount;
  if (
    input.type === "TRANSFER" &&
    source &&
    destination &&
    source.currency !== destination.currency
  ) {
    if (!(input.fxRate && input.fxRate > 0))
      throw new HttpError(400, "Transfer beda mata uang membutuhkan fxRate");
    destinationAmount =
      input.targetAmount ??
      input.amount * input.fxRate - (input.conversionFee ?? 0);
    if (!(destinationAmount > 0))
      throw new HttpError(400, "Nilai hasil konversi tidak valid");
  }

  if (source) {
    await tx.financialAccount.update({
      where: { id: source.id },
      data: {
        currentBalance: { decrement: input.amount },
        lastUsedAt: new Date(),
      },
    });
  }
  if (destination) {
    await tx.financialAccount.update({
      where: { id: destination.id },
      data: {
        currentBalance: { increment: destinationAmount },
        lastUsedAt: new Date(),
      },
    });
  }

  if (input.categoryId) {
    const category = await tx.transactionCategory.findFirst({
      where: { id: input.categoryId, userId },
    });
    if (!category) throw new HttpError(404, "Kategori tidak ditemukan");
  }
  if (input.debtId) {
    const debt = await tx.debt.findFirst({
      where: { id: input.debtId, userId },
    });
    if (!debt) throw new HttpError(404, "Utang tidak ditemukan");
    if (
      input.type === "EXPENSE" &&
      source &&
      ["CREDIT_CARD", "PAYLATER"].includes(source.type)
    ) {
      if (debt.currency !== currency)
        throw new HttpError(
          400,
          "Mata uang utang tidak sama dengan account kredit",
        );
      await tx.debt.update({
        where: { id: debt.id },
        data: {
          originalPrincipal: { increment: input.amount },
          remainingPrincipal: { increment: input.amount },
        },
      });
    }
  } else if (
    input.type === "EXPENSE" &&
    source &&
    ["CREDIT_CARD", "PAYLATER"].includes(source.type)
  ) {
    throw new HttpError(
      400,
      "Pengeluaran kartu kredit/paylater membutuhkan master utang",
    );
  }

  if (input.tagIds?.length) {
    const count = await tx.tag.count({
      where: { userId, id: { in: [...new Set(input.tagIds)] } },
    });
    if (count !== new Set(input.tagIds).size)
      throw new HttpError(404, "Tag tidak ditemukan");
  }

  const transaction = await tx.financialTransaction.create({
    data: {
      userId,
      type: input.type,
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(source ? { sourceAccountId: source.id } : {}),
      ...(destination ? { destinationAccountId: destination.id } : {}),
      ...(input.debtId ? { debtId: input.debtId } : {}),
      amount: input.amount,
      currency,
      occurredAt: input.occurredAt ?? new Date(),
      ...(input.description ? { description: input.description } : {}),
      ...(input.referenceType ? { referenceType: input.referenceType } : {}),
      ...(input.referenceId ? { referenceId: input.referenceId } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      status: "POSTED",
      baseCurrency: fx.baseCurrency,
      ...(fx.baseAmount !== null ? { baseAmount: fx.baseAmount } : {}),
      ...(fx.fxRateToBase !== null ? { fxRateToBase: fx.fxRateToBase } : {}),
      ...(fx.fxCapturedAt ? { fxCapturedAt: fx.fxCapturedAt } : {}),
      metadata: jsonSafe({
        ...(input.metadata ?? {}),
        fxStatus: fx.fxStatus,
        ...(input.type === "TRANSFER" && destination
          ? {
              targetCurrency: destination.currency,
              targetAmount: destinationAmount,
              fxRate: input.fxRate ?? 1,
              conversionFee: input.conversionFee ?? 0,
            }
          : {}),
      }),
      ...(input.tagIds?.length
        ? {
            tags: {
              create: input.tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            },
          }
        : {}),
    },
    include: {
      category: true,
      sourceAccount: true,
      destinationAccount: true,
      tags: { include: { tag: true } },
    },
  });
  await saveHistory(tx, userId, "DESCRIPTION", input.description);
  await auditService.create(
    userId,
    {
      action: "TRANSACTION_CREATED",
      entityType: "FinancialTransaction",
      entityId: transaction.id,
      after: transaction,
    },
    tx,
  );
  return transaction;
}

export const financeService = {
  async createAccount(userId: string, input: AccountInput) {
    const account = await db.financialAccount.create({
      data: {
        userId,
        name: input.name.trim().replace(/\s+/g, " "),
        type: input.type,
        currency: input.currency.toUpperCase(),
        openingBalance: input.openingBalance,
        currentBalance: input.openingBalance,
        status: "ACTIVE",
      },
    });
    await auditService.create(userId, {
      action: "ACCOUNT_CREATED",
      entityType: "FinancialAccount",
      entityId: account.id,
      after: account,
    });
    return account;
  },

  listAccounts(userId: string, includeArchived = false) {
    return db.financialAccount.findMany({
      where: {
        userId,
        ...(!includeArchived ? { isActive: true, status: "ACTIVE" } : {}),
      },
      orderBy: [{ isSystem: "asc" }, { name: "asc" }],
    });
  },

  async findAccount(userId: string, accountId: string) {
    const account = await db.financialAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) throw new HttpError(404, "Account tidak ditemukan");
    return account;
  },

  async getOrCreateUnallocatedAccount(
    userId: string,
    currency: string,
    tx: any = db,
  ) {
    const code = currency.toUpperCase();
    const existing = await tx.financialAccount.findFirst({
      where: { userId, isSystem: true, systemCode: `UNALLOCATED:${code}` },
    });
    if (existing) return existing;
    return tx.financialAccount.create({
      data: {
        userId,
        name: `Dana Belum Dialokasikan (${code})`,
        type: "OTHER",
        currency: code,
        openingBalance: 0,
        currentBalance: 0,
        isSystem: true,
        systemCode: `UNALLOCATED:${code}`,
        isActive: true,
        status: "ACTIVE",
      },
    });
  },

  async recommendArchiveTargets(userId: string, accountId: string) {
    const source = await this.findAccount(userId, accountId);
    const pref = await settingsService.get(userId);
    const accounts = await db.financialAccount.findMany({
      where: {
        userId,
        id: { not: source.id },
        isActive: true,
        status: "ACTIVE",
        isSystem: false,
      },
      orderBy: [{ lastUsedAt: "desc" }, { updatedAt: "desc" }],
    });
    return accounts
      .map((account: any) => ({
        account,
        score:
          (account.currency === source.currency ? 100 : 0) +
          (account.type === source.type ? 20 : 0) +
          (account.id === pref.defaultAccountId ? 40 : 0) +
          (account.lastUsedAt ? 10 : 0),
      }))
      .sort((a: any, b: any) => b.score - a.score);
  },

  async archiveAccount(userId: string, accountId: string, input: ArchiveInput) {
    const source = await this.findAccount(userId, accountId);
    if (source.isSystem)
      throw new HttpError(409, "System account tidak dapat diarsipkan");
    if (source.status === "ARCHIVED")
      return { account: source, transfer: null };
    const balance = numberValue(source.currentBalance);
    return db.$transaction(async (tx: any) => {
      let target: any = null;
      let transfer: any = null;
      if (balance !== 0) {
        if (input.targetAccountId)
          target = await activeAccount(
            tx,
            userId,
            input.targetAccountId,
            "Account tujuan",
          );
        else if (input.useUnallocatedFunds)
          target = await this.getOrCreateUnallocatedAccount(
            userId,
            source.currency,
            tx,
          );
        else
          throw new HttpError(
            409,
            "Account masih memiliki saldo; pilih account tujuan atau Dana Belum Dialokasikan",
          );
        if (target.id === source.id)
          throw new HttpError(400, "Account tujuan tidak boleh sama");
        if (balance < 0 && target.currency !== source.currency) {
          throw new HttpError(
            400,
            "Saldo negatif hanya dapat ditutup dari account dengan mata uang sama",
          );
        }
        const amount = Math.abs(balance);
        const transferInput: TxInput =
          balance > 0
            ? {
                type: "TRANSFER",
                sourceAccountId: source.id,
                destinationAccountId: target.id,
                amount,
                currency: source.currency,
                description: `Pemindahan saldo sebelum arsip ${source.name}`,
                idempotencyKey:
                  input.idempotencyKey ?? `archive-${source.id}-${Date.now()}`,
                ...(target.currency !== source.currency
                  ? {
                      fxRate: input.fxRate,
                      conversionFee: input.conversionFee ?? 0,
                    }
                  : {}),
              }
            : {
                type: "TRANSFER",
                sourceAccountId: target.id,
                destinationAccountId: source.id,
                amount,
                currency: source.currency,
                description: `Pelunasan saldo negatif sebelum arsip ${source.name}`,
                idempotencyKey:
                  input.idempotencyKey ?? `archive-${source.id}-${Date.now()}`,
              };
        transfer = await recordInTransaction(
          tx,
          userId,
          transferInput,
          await snapshot(userId, transferInput),
        );
      }
      const archived = await tx.financialAccount.update({
        where: { id: source.id },
        data: {
          isActive: false,
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedReason: input.reason,
        },
      });
      await tx.userFinancePreference.updateMany({
        where: { userId, defaultAccountId: source.id },
        data: {
          defaultAccountId: target?.isSystem ? null : (target?.id ?? null),
        },
      });
      await auditService.create(
        userId,
        {
          action: "ACCOUNT_ARCHIVED",
          entityType: "FinancialAccount",
          entityId: source.id,
          before: source,
          after: archived,
          metadata: {
            targetAccountId: target?.id,
            transferId: transfer?.id,
            originalBalance: balance,
          },
        },
        tx,
      );
      return { account: archived, transfer, targetAccount: target };
    });
  },

  async restoreAccount(userId: string, accountId: string) {
    const account = await this.findAccount(userId, accountId);
    if (account.isSystem)
      throw new HttpError(409, "System account tidak perlu dipulihkan");
    const restored = await db.financialAccount.update({
      where: { id: account.id },
      data: {
        isActive: true,
        status: "ACTIVE",
        archivedAt: null,
        archivedReason: null,
      },
    });
    await auditService.create(userId, {
      action: "ACCOUNT_RESTORED",
      entityType: "FinancialAccount",
      entityId: account.id,
      before: account,
      after: restored,
    });
    return restored;
  },

  createCategory(userId: string, input: CategoryInput) {
    return db.transactionCategory.create({
      data: { ...input, name: input.name.trim().replace(/\s+/g, " "), userId },
    });
  },

  async record(userId: string, input: TxInput) {
    const fx = await snapshot(userId, input);
    return db.$transaction((tx: any) =>
      recordInTransaction(tx, userId, input, fx),
    );
  },

  async listTransactions(
    userId: string,
    fromOrInput?: Date | ListInput,
    to?: Date,
  ) {
    const input: ListInput =
      fromOrInput instanceof Date || fromOrInput === undefined
        ? {
            ...(fromOrInput ? { from: fromOrInput } : {}),
            ...(to ? { to } : {}),
            includeCancelled: false,
            includeArchivedAccounts: false,
            page: 1,
            limit: 30,
          }
        : fromOrInput;
    const where: any = {
      userId,
      ...(input.from || input.to
        ? {
            occurredAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.status
        ? { status: input.status }
        : !input.includeCancelled
          ? { status: "POSTED" }
          : {}),
      ...(input.accountId
        ? {
            OR: [
              { sourceAccountId: input.accountId },
              { destinationAccountId: input.accountId },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.financialTransaction.findMany({
        where,
        include: {
          category: true,
          sourceAccount: true,
          destinationAccount: true,
          tags: { include: { tag: true } },
          reversalOf: true,
          reversals: true,
        },
        orderBy: { occurredAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      db.financialTransaction.count({ where }),
    ]);
    return {
      items,
      meta: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  },

  async cancelTransaction(
    userId: string,
    transactionId: string,
    input: CancelInput,
  ) {
    const existing = await db.financialTransaction.findFirst({
      where: { id: transactionId, userId },
      include: { sourceAccount: true, destinationAccount: true },
    });
    if (!existing) throw new HttpError(404, "Transaksi tidak ditemukan");
    if (existing.status !== "POSTED")
      throw new HttpError(409, "Transaksi tidak dapat dibatalkan lagi");
    if (input.idempotencyKey) {
      const replay = await db.financialTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (replay)
        return { original: existing, reversal: replay, idempotentReplay: true };
    }
    return db.$transaction(async (tx: any) => {
      const amount = numberValue(existing.amount);
      const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
      const targetAmount = numberValue(metadata.targetAmount ?? amount);
      if (existing.type === "INCOME" && existing.destinationAccountId) {
        await tx.financialAccount.update({
          where: { id: existing.destinationAccountId },
          data: { currentBalance: { decrement: amount } },
        });
      } else if (
        ["EXPENSE", "DEBT_PAYMENT"].includes(existing.type) &&
        existing.sourceAccountId
      ) {
        await tx.financialAccount.update({
          where: { id: existing.sourceAccountId },
          data: { currentBalance: { increment: amount } },
        });
      } else if (existing.type === "TRANSFER") {
        if (existing.sourceAccountId)
          await tx.financialAccount.update({
            where: { id: existing.sourceAccountId },
            data: { currentBalance: { increment: amount } },
          });
        if (existing.destinationAccountId)
          await tx.financialAccount.update({
            where: { id: existing.destinationAccountId },
            data: { currentBalance: { decrement: targetAmount } },
          });
      }
      if (
        existing.type === "EXPENSE" &&
        existing.debtId &&
        ["CREDIT_CARD", "PAYLATER"].includes(existing.sourceAccount?.type)
      ) {
        const debt = await tx.debt.findFirst({
          where: { id: existing.debtId, userId },
        });
        if (debt) {
          await tx.debt.update({
            where: { id: debt.id },
            data: {
              originalPrincipal: Math.max(
                0,
                numberValue(debt.originalPrincipal) - amount,
              ),
              remainingPrincipal: Math.max(
                0,
                numberValue(debt.remainingPrincipal) - amount,
              ),
            },
          });
        }
      }
      if (
        existing.type === "DEBT_PAYMENT" &&
        existing.referenceType === "DEBT_PAYMENT" &&
        existing.referenceId
      ) {
        const payment = await tx.debtPayment.findUnique({
          where: { id: existing.referenceId },
          include: { allocations: true, debt: true },
        });
        if (payment && payment.status !== "VOIDED") {
          for (const allocation of payment.allocations) {
            if (
              allocation.installmentId &&
              numberValue(allocation.principalAmount) > 0
            ) {
              const installment = await tx.debtInstallment.findUnique({
                where: { id: allocation.installmentId },
              });
              if (installment) {
                const paid = Math.max(
                  0,
                  numberValue(installment.paidPrincipal) -
                    numberValue(allocation.principalAmount),
                );
                await tx.debtInstallment.update({
                  where: { id: installment.id },
                  data: {
                    paidPrincipal: paid,
                    status: paid === 0 ? "UPCOMING" : "PARTIAL",
                  },
                });
              }
            }
            if (
              allocation.chargeId &&
              numberValue(allocation.chargeAmount) > 0
            ) {
              const charge = await tx.debtCharge.findUnique({
                where: { id: allocation.chargeId },
              });
              if (charge) {
                const paid = Math.max(
                  0,
                  numberValue(charge.paidAmount) -
                    numberValue(allocation.chargeAmount),
                );
                await tx.debtCharge.update({
                  where: { id: charge.id },
                  data: {
                    paidAmount: paid,
                    billingStatus: paid === 0 ? "BILLED" : "PARTIAL",
                  },
                });
              }
            }
          }
          await tx.debt.update({
            where: { id: payment.debtId },
            data: {
              remainingPrincipal: { increment: amount },
              status: "ACTIVE",
            },
          });
          await tx.debtPayment.update({
            where: { id: payment.id },
            data: {
              status: "VOIDED",
              voidedAt: new Date(),
              voidReason: input.reason,
            },
          });
        }
      }
      const reversal = await tx.financialTransaction.create({
        data: {
          userId,
          type: "ADJUSTMENT",
          ...(existing.sourceAccountId
            ? { sourceAccountId: existing.sourceAccountId }
            : {}),
          ...(existing.destinationAccountId
            ? { destinationAccountId: existing.destinationAccountId }
            : {}),
          ...(existing.debtId ? { debtId: existing.debtId } : {}),
          amount,
          currency: existing.currency,
          occurredAt: new Date(),
          description: `Pembatalan: ${existing.description ?? existing.type}`,
          referenceType: "TRANSACTION_REVERSAL",
          referenceId: existing.id,
          ...(input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey }
            : {}),
          status: "REVERSAL",
          reversalOfId: existing.id,
          baseCurrency: existing.baseCurrency,
          baseAmount: existing.baseAmount,
          fxRateToBase: existing.fxRateToBase,
          fxCapturedAt: existing.fxCapturedAt,
          metadata: jsonSafe({ reason: input.reason, actor: input.actor }),
        },
      });
      const original = await tx.financialTransaction.update({
        where: { id: existing.id },
        data: {
          status: "VOIDED",
          voidedAt: new Date(),
          voidReason: input.reason,
          voidedBy: input.actor,
        },
      });
      await auditService.create(
        userId,
        {
          action: "TRANSACTION_VOIDED",
          entityType: "FinancialTransaction",
          entityId: existing.id,
          before: existing,
          after: original,
          metadata: {
            reversalId: reversal.id,
            reason: input.reason,
            actor: input.actor,
          },
        },
        tx,
      );
      return { original, reversal, idempotentReplay: false };
    });
  },

  async cashflow(userId: string, from: Date, to: Date) {
    const pref = await settingsService.get(userId);
    const rows = await db.financialTransaction.findMany({
      where: { userId, status: "POSTED", occurredAt: { gte: from, lte: to } },
    });
    const totals = { INCOME: 0, EXPENSE: 0, DEBT_PAYMENT: 0 };
    const missing = new Set<string>();
    for (const row of rows) {
      if (!["INCOME", "EXPENSE", "DEBT_PAYMENT"].includes(row.type)) continue;
      const converted =
        row.baseCurrency === pref.baseCurrency && row.baseAmount !== null
          ? numberValue(row.baseAmount)
          : (
              await convertCurrency(
                userId,
                numberValue(row.amount),
                row.currency,
                pref.baseCurrency,
                pref.fxStaleHours,
              )
            ).convertedAmount;
      if (converted === null) {
        missing.add(row.currency);
        continue;
      }
      (totals as any)[row.type] += converted;
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
