import { convertCurrency } from "../../common/fx.js";
import { prisma } from "../../lib/prisma.js";
import { investmentService } from "../investments/investment.service.js";
import { settingsService } from "../settings/settings.service.js";
import type { ReportQuery } from "./report.schema.js";
import { groupKey, resolveReportPeriod } from "./report.period.js";

const db = prisma as any;
const numberValue = (value: unknown) => Number(value ?? 0) || 0;

function transactionNativeEffect(transaction: any, accountId: string) {
  const amount = numberValue(transaction.amount);
  const metadata = transaction.metadata ?? {};
  const targetAmount = numberValue(metadata.targetAmount ?? amount);
  let effect = 0;
  if (transaction.destinationAccountId === accountId) {
    effect += transaction.type === "TRANSFER" ? targetAmount : amount;
  }
  if (transaction.sourceAccountId === accountId) effect -= amount;
  return effect;
}

async function convertedAmount(
  userId: string,
  amount: number,
  currency: string,
  baseCurrency: string,
  fxStaleHours: number,
) {
  const conversion = await convertCurrency(
    userId,
    amount,
    currency,
    baseCurrency,
    fxStaleHours,
  );
  return conversion.convertedAmount;
}

export const reportService = {
  async build(
    userId: string,
    query: ReportQuery,
    options: { allTransactions?: boolean } = {},
  ) {
    const preference = await settingsService.get(userId);
    const period = resolveReportPeriod(
      query,
      preference.timeZone,
      preference.weekStartsOn,
    );
    const dateFilter =
      period.from || period.to
        ? {
            occurredAt: {
              ...(period.from ? { gte: period.from } : {}),
              ...(period.to ? { lte: period.to } : {}),
            },
          }
        : {};
    const statusFilter = query.statuses?.length
      ? { status: { in: query.statuses } }
      : query.includeCancelled
        ? {}
        : { status: "POSTED" };
    const where: any = {
      userId,
      ...dateFilter,
      ...statusFilter,
      ...(query.types?.length ? { type: { in: query.types } } : {}),
      ...(query.categoryIds?.length
        ? { categoryId: { in: query.categoryIds } }
        : {}),
      ...(query.accountIds?.length
        ? {
            OR: [
              { sourceAccountId: { in: query.accountIds } },
              { destinationAccountId: { in: query.accountIds } },
            ],
          }
        : {}),
      ...(query.tagIds?.length
        ? { tags: { some: { tagId: { in: query.tagIds } } } }
        : {}),
    };

    const [transactions, totalTransactions, accounts, debts, portfolio] =
      await Promise.all([
        db.financialTransaction.findMany({
          where,
          include: {
            category: true,
            sourceAccount: true,
            destinationAccount: true,
            tags: { include: { tag: true } },
          },
          orderBy: { occurredAt: "desc" },
        }),
        db.financialTransaction.count({ where }),
        db.financialAccount.findMany({
          where: {
            userId,
            ...(query.accountIds?.length
              ? { id: { in: query.accountIds } }
              : {}),
            ...(!query.includeArchivedAccounts
              ? { status: "ACTIVE", isActive: true }
              : {}),
          },
          orderBy: { name: "asc" },
        }),
        db.debt.findMany({
          where: { userId, status: { notIn: ["PAID", "CANCELLED"] } },
          include: { installments: true, charges: true },
        }),
        investmentService.portfolio(userId).catch(() => null),
      ]);

    const totals = {
      income: 0,
      expense: 0,
      debtPayment: 0,
      transferIn: 0,
      transferOut: 0,
      adjustment: 0,
      netCashFlow: 0,
    };
    const categoryMap = new Map<string, number>();
    const tagMap = new Map<string, number>();
    const groupMap = new Map<string, typeof totals>();
    const missingCurrencies = new Set<string>();

    for (const transaction of transactions) {
      const native = numberValue(transaction.amount);
      const converted =
        transaction.baseCurrency === preference.baseCurrency &&
        transaction.baseAmount !== null
          ? numberValue(transaction.baseAmount)
          : await convertedAmount(
              userId,
              native,
              transaction.currency,
              preference.baseCurrency,
              preference.fxStaleHours,
            );
      if (converted === null) {
        missingCurrencies.add(transaction.currency);
        continue;
      }
      const group = groupKey(
        transaction.occurredAt,
        query.grouping,
        preference.timeZone,
        preference.weekStartsOn,
      );
      const bucket = groupMap.get(group) ?? {
        income: 0,
        expense: 0,
        debtPayment: 0,
        transferIn: 0,
        transferOut: 0,
        adjustment: 0,
        netCashFlow: 0,
      };
      if (transaction.type === "INCOME") {
        totals.income += converted;
        bucket.income += converted;
      } else if (transaction.type === "EXPENSE") {
        totals.expense += converted;
        bucket.expense += converted;
      } else if (transaction.type === "DEBT_PAYMENT") {
        totals.debtPayment += converted;
        bucket.debtPayment += converted;
      } else if (transaction.type === "TRANSFER") {
        totals.transferOut += converted;
        bucket.transferOut += converted;
        const targetCurrency = String(
          transaction.metadata?.targetCurrency ?? transaction.currency,
        );
        const targetNative = numberValue(
          transaction.metadata?.targetAmount ?? native,
        );
        const targetConverted = await convertedAmount(
          userId,
          targetNative,
          targetCurrency,
          preference.baseCurrency,
          preference.fxStaleHours,
        );
        if (targetConverted !== null) {
          totals.transferIn += targetConverted;
          bucket.transferIn += targetConverted;
        }
      } else if (transaction.type === "ADJUSTMENT") {
        totals.adjustment += converted;
        bucket.adjustment += converted;
      }
      bucket.netCashFlow = bucket.income - bucket.expense - bucket.debtPayment;
      groupMap.set(group, bucket);

      if (transaction.category) {
        categoryMap.set(
          transaction.category.name,
          (categoryMap.get(transaction.category.name) ?? 0) + converted,
        );
      }
      for (const item of transaction.tags ?? []) {
        tagMap.set(item.tag.name, (tagMap.get(item.tag.name) ?? 0) + converted);
      }
    }
    totals.netCashFlow = totals.income - totals.expense - totals.debtPayment;

    const accountReports: any[] = [];
    for (const account of accounts) {
      const beforeRows = period.from
        ? await db.financialTransaction.findMany({
            where: {
              userId,
              status: "POSTED",
              occurredAt: { lt: period.from },
              OR: [
                { sourceAccountId: account.id },
                { destinationAccountId: account.id },
              ],
            },
          })
        : [];
      const openingBalance = beforeRows.reduce(
        (sum: number, row: any) =>
          sum + transactionNativeEffect(row, account.id),
        numberValue(account.openingBalance),
      );
      const inPeriod = transactions.filter(
        (row: any) =>
          row.sourceAccountId === account.id ||
          row.destinationAccountId === account.id,
      );
      const accountTotals = {
        income: 0,
        expense: 0,
        debtPayment: 0,
        transferIn: 0,
        transferOut: 0,
        adjustment: 0,
      };
      for (const row of inPeriod) {
        const amount = numberValue(row.amount);
        const targetAmount = numberValue(row.metadata?.targetAmount ?? amount);
        if (row.type === "INCOME" && row.destinationAccountId === account.id)
          accountTotals.income += amount;
        if (row.type === "EXPENSE" && row.sourceAccountId === account.id)
          accountTotals.expense += amount;
        if (row.type === "DEBT_PAYMENT" && row.sourceAccountId === account.id)
          accountTotals.debtPayment += amount;
        if (row.type === "TRANSFER") {
          if (row.sourceAccountId === account.id)
            accountTotals.transferOut += amount;
          if (row.destinationAccountId === account.id)
            accountTotals.transferIn += targetAmount;
        }
        if (row.type === "ADJUSTMENT")
          accountTotals.adjustment += transactionNativeEffect(row, account.id);
      }
      const closingBalance =
        openingBalance +
        accountTotals.income -
        accountTotals.expense -
        accountTotals.debtPayment +
        accountTotals.transferIn -
        accountTotals.transferOut +
        accountTotals.adjustment;
      const convertedClosing = await convertedAmount(
        userId,
        closingBalance,
        account.currency,
        preference.baseCurrency,
        preference.fxStaleHours,
      );
      accountReports.push({
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        status: account.status,
        currency: account.currency,
        openingBalance,
        ...accountTotals,
        closingBalance,
        convertedClosingBalance: convertedClosing,
        baseCurrency: preference.baseCurrency,
      });
    }

    let totalDebt = 0;
    let totalBills = 0;
    let unpaidBills = 0;
    let overdueBills = 0;
    for (const debt of debts) {
      const convertedDebt = await convertedAmount(
        userId,
        numberValue(debt.remainingPrincipal),
        debt.currency,
        preference.baseCurrency,
        preference.fxStaleHours,
      );
      if (convertedDebt !== null) totalDebt += convertedDebt;
      for (const installment of debt.installments) {
        if (
          period.from &&
          period.to &&
          (installment.dueDate < period.from || installment.dueDate > period.to)
        ) {
          continue;
        }
        const scheduled = await convertedAmount(
          userId,
          numberValue(installment.scheduledPrincipal),
          debt.currency,
          preference.baseCurrency,
          preference.fxStaleHours,
        );
        const remaining = await convertedAmount(
          userId,
          Math.max(
            0,
            numberValue(installment.scheduledPrincipal) -
              numberValue(installment.paidPrincipal),
          ),
          debt.currency,
          preference.baseCurrency,
          preference.fxStaleHours,
        );
        if (scheduled !== null) totalBills += scheduled;
        if (remaining !== null && remaining > 0) {
          unpaidBills += remaining;
          if (["OVERDUE", "DUE"].includes(installment.status))
            overdueBills += remaining;
        }
      }
    }

    const duration =
      period.from && period.to
        ? period.to.getTime() - period.from.getTime() + 1
        : null;
    let previous: any = null;
    if (duration && period.from) {
      const previousTo = new Date(period.from.getTime() - 1);
      const previousFrom = new Date(previousTo.getTime() - duration + 1);
      const previousRows = await db.financialTransaction.findMany({
        where: {
          userId,
          status: "POSTED",
          occurredAt: { gte: previousFrom, lte: previousTo },
          ...(query.accountIds?.length
            ? {
                OR: [
                  { sourceAccountId: { in: query.accountIds } },
                  { destinationAccountId: { in: query.accountIds } },
                ],
              }
            : {}),
        },
      });
      const previousTotals = { income: 0, expense: 0, debtPayment: 0 };
      for (const row of previousRows) {
        if (!["INCOME", "EXPENSE", "DEBT_PAYMENT"].includes(row.type)) continue;
        const converted = await convertedAmount(
          userId,
          numberValue(row.amount),
          row.currency,
          preference.baseCurrency,
          preference.fxStaleHours,
        );
        if (converted !== null)
          (previousTotals as any)[
            row.type === "INCOME"
              ? "income"
              : row.type === "EXPENSE"
                ? "expense"
                : "debtPayment"
          ] += converted;
      }
      const previousNet =
        previousTotals.income -
        previousTotals.expense -
        previousTotals.debtPayment;
      previous = {
        from: previousFrom,
        to: previousTo,
        ...previousTotals,
        netCashFlow: previousNet,
        comparison: {
          incomePercent:
            previousTotals.income === 0
              ? null
              : ((totals.income - previousTotals.income) /
                  previousTotals.income) *
                100,
          expensePercent:
            previousTotals.expense === 0
              ? null
              : ((totals.expense - previousTotals.expense) /
                  previousTotals.expense) *
                100,
          netCashFlowPercent:
            previousNet === 0
              ? null
              : ((totals.netCashFlow - previousNet) / Math.abs(previousNet)) *
                100,
        },
      };
    }

    const unallocated = accountReports
      .filter((account: any) =>
        String(account.accountName).startsWith("Dana Belum Dialokasikan"),
      )
      .reduce(
        (sum: number, account: any) =>
          sum + numberValue(account.convertedClosingBalance),
        0,
      );

    return {
      filters: query,
      period,
      timeZone: preference.timeZone,
      weekStartsOn: preference.weekStartsOn,
      currency: preference.baseCurrency,
      totals: {
        ...totals,
        totalBills,
        unpaidBills,
        overdueBills,
        totalDebt,
        totalReceivables: 0,
        investmentValue: numberValue(portfolio?.confirmedMarketValue),
        unallocatedFunds: unallocated,
      },
      previous,
      groups: [...groupMap.entries()]
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      byCategory: [...categoryMap.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount),
      byTag: [...tagMap.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount),
      accounts: accountReports,
      transactions: options.allTransactions
        ? transactions
        : transactions.slice(
            (query.page - 1) * query.limit,
            query.page * query.limit,
          ),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: totalTransactions,
        totalPages: Math.ceil(totalTransactions / query.limit),
      },
      missingCurrencies: [...missingCurrencies],
    };
  },
};
