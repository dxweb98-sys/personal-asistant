import { moneyToNumber, roundMoney } from "../../common/money.js";
import { prisma } from "../../lib/prisma.js";
import { settingsService } from "../settings/settings.service.js";
import { calculateDebtHealth } from "./debt-health.calculator.js";
import { debtService } from "./debt.service.js";

const unpaidCharge = (charge: any) =>
  ["PAID", "WAIVED"].includes(charge.billingStatus)
    ? 0
    : roundMoney(
        moneyToNumber(charge.amount) - moneyToNumber(charge.paidAmount),
      );

export function summarizeDebtContract(debt: any) {
  const originalPrincipal = moneyToNumber(debt.originalPrincipal);
  const scheduledInterest = debt.charges
    .filter((charge: any) => charge.type === "INTEREST")
    .reduce(
      (sum: number, charge: any) => sum + moneyToNumber(charge.amount),
      0,
    );
  const scheduledFees = debt.charges
    .filter((charge: any) => charge.type === "ADMIN_FEE")
    .reduce(
      (sum: number, charge: any) => sum + moneyToNumber(charge.amount),
      0,
    );
  const fixedContract =
    moneyToNumber(debt.fixedMonthlyAmount) > 0 && debt.tenorMonths
      ? roundMoney(
          moneyToNumber(debt.fixedMonthlyAmount) * Number(debt.tenorMonths),
        )
      : 0;
  const totalContractPayment = roundMoney(
    moneyToNumber(debt.totalContractAmount ?? 0) ||
      fixedContract ||
      originalPrincipal + scheduledInterest + scheduledFees,
  );
  const totalInterest = roundMoney(
    scheduledInterest ||
      Math.max(0, totalContractPayment - originalPrincipal - scheduledFees),
  );
  const postedPayments = debt.payments.filter(
    (payment: any) => payment.status === "POSTED",
  );
  const chargeById = new Map(
    debt.charges.map((charge: any) => [charge.id, charge]),
  );
  const totalPaid = roundMoney(
    postedPayments
      .flatMap((payment: any) => payment.allocations)
      .reduce((sum: number, allocation: any) => {
        const charge: any = allocation.chargeId
          ? chargeById.get(allocation.chargeId)
          : null;
        const contractCharge =
          charge && ["INTEREST", "ADMIN_FEE"].includes(charge.type)
            ? moneyToNumber(allocation.chargeAmount)
            : 0;
        return (
          sum + moneyToNumber(allocation.principalAmount) + contractCharge
        );
      }, 0),
  );
  const interestPaid = roundMoney(
    debt.charges
      .filter((charge: any) => charge.type === "INTEREST")
      .reduce(
        (sum: number, charge: any) => sum + moneyToNumber(charge.paidAmount),
        0,
      ),
  );
  const totalPenalty = roundMoney(
    debt.charges
      .filter((charge: any) => charge.type === "LATE_FEE")
      .reduce(
        (sum: number, charge: any) => sum + moneyToNumber(charge.amount),
        0,
      ),
  );
  const penaltyPaid = roundMoney(
    debt.charges
      .filter((charge: any) => charge.type === "LATE_FEE")
      .reduce(
        (sum: number, charge: any) => sum + moneyToNumber(charge.paidAmount),
        0,
      ),
  );

  return {
    originalPrincipal,
    totalContractPayment,
    totalInterest,
    averageMonthlyInterest:
      debt.tenorMonths && Number(debt.tenorMonths) > 0
        ? roundMoney(totalInterest / Number(debt.tenorMonths))
        : 0,
    totalFees: roundMoney(scheduledFees),
    effectiveContractInterestPercent:
      originalPrincipal > 0
        ? roundMoney((totalInterest / originalPrincipal) * 100)
        : 0,
    totalPaid,
    principalPaid: roundMoney(
      originalPrincipal - moneyToNumber(debt.remainingPrincipal),
    ),
    interestPaid,
    totalPenalty,
    penaltyPaid,
    outstandingPenalty: roundMoney(totalPenalty - penaltyPaid),
    remainingContractPayment: roundMoney(
      Math.max(0, totalContractPayment - totalPaid),
    ),
    progressPercent:
      totalContractPayment > 0
        ? roundMoney(Math.min(100, (totalPaid / totalContractPayment) * 100))
        : 0,
    estimated:
      debt.interestMethod === "MANUAL_CONTRACT" ||
      debt.charges.some(
        (charge: any) => charge.type === "INTEREST" && charge.estimated,
      ),
  };
}

function healthLabel(status: string) {
  return {
    HEALTHY: "SEHAT",
    NEEDS_ATTENTION: "PERLU_PERHATIAN",
    UNHEALTHY: "MENCEKIK",
    CRITICAL: "KRITIS",
    INSUFFICIENT_DATA: "DATA_BELUM_CUKUP",
  }[status];
}

function dateOnly(value: Date) {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

export const debtOverviewService = {
  async get(userId: string, debtId: string, asOf = new Date()) {
    const debt: any = await debtService.find(userId, debtId);
    const today = dateOnly(asOf);
    const [preference, activeDebts, overdueInstallments, bankAccounts] =
      await Promise.all([
        settingsService.get(userId),
        prisma.debt.findMany({
          where: {
            userId,
            status: {
              in: [
                "ACTIVE",
                "OVERDUE",
                "PRINCIPAL_PAID",
                "SETTLEMENT_PENDING",
              ],
            },
          },
          select: {
            paymentPolicy: true,
            fixedMonthlyAmount: true,
            minimumMonthlyAmount: true,
            targetMonthlyAmount: true,
          },
        }),
        prisma.debtInstallment.findMany({
          where: {
            debt: { userId },
            dueDate: { lt: new Date(today) },
            status: {
              in: ["UPCOMING", "DUE", "PARTIAL", "OVERDUE", "RESCHEDULED"],
            },
          },
          select: { dueDate: true },
        }),
        prisma.financialAccount.findMany({
          where: {
            userId,
            type: "BANK",
            currency: debt.currency,
            isActive: true,
            status: "ACTIVE",
          },
          select: { currentBalance: true },
        }),
      ]);

    const installments = debt.installments.map(
      (installment: any, installmentIndex: number) => {
        const relatedCharges = debt.charges.filter(
          (charge: any) =>
            charge.billedInstallmentId === installment.id ||
            (!charge.billedInstallmentId &&
              charge.targetPeriod === installment.period) ||
            (!charge.billedInstallmentId &&
              !charge.targetPeriod &&
              charge.sourceInstallmentId === installment.id &&
              charge.settlementPolicy === "IMMEDIATE") ||
            (charge.settlementPolicy === "END_OF_TERM" &&
              installmentIndex === debt.installments.length - 1),
        );
        const interest = relatedCharges
          .filter((charge: any) => charge.type === "INTEREST")
          .reduce(
            (sum: number, charge: any) => sum + moneyToNumber(charge.amount),
            0,
          );
        const fees = relatedCharges
          .filter((charge: any) => charge.type === "ADMIN_FEE")
          .reduce(
            (sum: number, charge: any) => sum + moneyToNumber(charge.amount),
            0,
          );
        const penalty = relatedCharges
          .filter((charge: any) => charge.type === "LATE_FEE")
          .reduce((sum: number, charge: any) => sum + unpaidCharge(charge), 0);
        const outstandingPrincipal = roundMoney(
          Math.max(
            0,
            moneyToNumber(installment.scheduledPrincipal) -
              moneyToNumber(installment.paidPrincipal),
          ),
        );
        const outstandingCharges = relatedCharges.reduce(
          (sum: number, charge: any) => sum + unpaidCharge(charge),
          0,
        );
        const totalOutstanding = roundMoney(
          outstandingPrincipal + outstandingCharges,
        );
        const isOverdue =
          totalOutstanding > 0 && dateOnly(installment.dueDate) < today;
        const currentStatus = isOverdue
          ? "OVERDUE"
          : totalOutstanding > 0 && dateOnly(installment.dueDate) === today
            ? "DUE"
            : installment.status;
        return {
          id: installment.id,
          period: installment.period,
          dueDate: installment.dueDate,
          status: installment.status,
          currentStatus,
          isOverdue,
          scheduledPrincipal: moneyToNumber(installment.scheduledPrincipal),
          paidPrincipal: moneyToNumber(installment.paidPrincipal),
          interest: roundMoney(interest),
          fees: roundMoney(fees),
          penalty: roundMoney(penalty),
          baseInstallment: roundMoney(
            moneyToNumber(installment.scheduledPrincipal) + interest + fees,
          ),
          outstandingPrincipal,
          outstandingCharges: roundMoney(outstandingCharges),
          totalOutstanding,
        };
      },
    );
    const nextInstallment = installments.find(
      (installment: any) => installment.totalOutstanding > 0,
    );
    const monthlyDebtService = roundMoney(
      activeDebts.reduce((sum: number, item: any) => {
        const amount =
          item.paymentPolicy === "FIXED"
            ? moneyToNumber(item.fixedMonthlyAmount)
            : moneyToNumber(item.minimumMonthlyAmount) ||
              moneyToNumber(item.targetMonthlyAmount);
        return sum + amount;
      }, 0),
    );
    const activePenalty = roundMoney(
      debt.charges
        .filter((charge: any) => charge.type === "LATE_FEE")
        .reduce((sum: number, charge: any) => sum + unpaidCharge(charge), 0),
    );
    const maxLateDays = overdueInstallments.reduce(
      (max: number, installment: any) =>
        Math.max(
          max,
          Math.max(
            0,
            Math.floor((today - dateOnly(installment.dueDate)) / 86_400_000),
          ),
        ),
      0,
    );
    const availableBankCash = roundMoney(
      bankAccounts.reduce(
        (sum: number, account: any) =>
          sum + Math.max(0, moneyToNumber(account.currentBalance)),
        0,
      ),
    );
    const fixedMonthlyIncome = moneyToNumber(
      (preference as any).fixedMonthlyIncome,
    );
    const mandatoryMonthlyExpenses = moneyToNumber(
      (preference as any).mandatoryMonthlyExpenses,
    );
    const debtSafetyBuffer = moneyToNumber((preference as any).debtSafetyBuffer);
    const currentDebtService =
      debt.paymentPolicy === "FIXED"
        ? moneyToNumber(debt.fixedMonthlyAmount)
        : moneyToNumber(debt.minimumMonthlyAmount) ||
          moneyToNumber(debt.targetMonthlyAmount);
    const availableBeforeCurrentDebt = roundMoney(
      fixedMonthlyIncome -
        mandatoryMonthlyExpenses -
        debtSafetyBuffer -
        Math.max(0, monthlyDebtService - currentDebtService),
    );
    const minimumRequired = moneyToNumber(debt.minimumMonthlyAmount);
    const flexibleTarget =
      moneyToNumber(debt.targetMonthlyAmount) ||
      moneyToNumber(debt.remainingPrincipal);
    const recommendedMonthlyPayment = roundMoney(
      debt.paymentPolicy === "FIXED"
        ? moneyToNumber(debt.fixedMonthlyAmount)
        : fixedMonthlyIncome > 0
          ? Math.max(
              minimumRequired,
              Math.min(flexibleTarget, Math.max(0, availableBeforeCurrentDebt)),
            )
          : minimumRequired,
    );
    const health = calculateDebtHealth({
      ...(fixedMonthlyIncome > 0 ? { monthlyNetIncome: fixedMonthlyIncome } : {}),
      mandatoryExpenses: mandatoryMonthlyExpenses + debtSafetyBuffer,
      monthlyDebtService,
      overdueInstallments: overdueInstallments.length,
      maxLateDays,
      activePenalty,
      nextPaymentAmount: nextInstallment?.totalOutstanding ?? 0,
      availableCash: availableBankCash,
    });

    return {
      debt: {
        ...debt,
        currentStatus: installments.some(
          (installment: any) => installment.isOverdue,
        )
          ? "OVERDUE"
          : debt.status,
      },
      contract: summarizeDebtContract(debt),
      installments,
      nextInstallment: nextInstallment ?? null,
      affordability: {
        fixedMonthlyIncome,
        mandatoryMonthlyExpenses,
        debtSafetyBuffer,
        monthlyDebtService,
        availableBankCash,
        minimumRequired,
        recommendedMonthlyPayment,
        recommendedPaymentShortfall: roundMoney(
          Math.max(0, recommendedMonthlyPayment - availableBeforeCurrentDebt),
        ),
        paymentCapacity: roundMoney(
          fixedMonthlyIncome -
            mandatoryMonthlyExpenses -
            debtSafetyBuffer -
            monthlyDebtService,
        ),
      },
      health: { ...health, label: healthLabel(health.status) },
    };
  },
};
