import {
  ChargeBillingStatus,
  DebtStatus,
  InstallmentStatus,
  LateFeeSettlementPolicy,
} from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../common/http-error.js";
import { moneyToNumber, roundMoney } from "../../common/money.js";
import { calculateLateFee } from "./late-fee.js";

const includeDetail = {
  lateFeeRule: true,
  installments: {
    orderBy: { dueDate: "asc" as const },
    include: { charges: true, adjustments: true },
  },
  charges: { orderBy: { createdAt: "asc" as const } },
  payments: {
    orderBy: { paidAt: "desc" as const },
    include: { allocations: true },
  },
  negotiations: { orderBy: { createdAt: "desc" as const } },
};
function nextPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m!, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function chargeStatus(amount: number, paid: number) {
  return paid <= 0
    ? ChargeBillingStatus.BILLED
    : paid >= amount
      ? ChargeBillingStatus.PAID
      : ChargeBillingStatus.PARTIAL;
}
async function overallSummary(tx: any, userId: string) {
  const debts = await tx.debt.findMany({
    where: { userId },
    include: { charges: true },
  });
  const active = debts.filter(
    (d: any) => ![DebtStatus.PAID, DebtStatus.CANCELLED].includes(d.status),
  );
  return {
    totalRemainingPrincipal: roundMoney(
      active.reduce(
        (a: number, d: any) => a + moneyToNumber(d.remainingPrincipal),
        0,
      ),
    ),
    totalBilledCharges: roundMoney(
      active
        .flatMap((d: any) => d.charges)
        .filter((c: any) => ["BILLED", "PARTIAL"].includes(c.billingStatus))
        .reduce(
          (a: number, c: any) =>
            a + moneyToNumber(c.amount) - moneyToNumber(c.paidAmount),
          0,
        ),
    ),
    totalPendingCharges: roundMoney(
      active
        .flatMap((d: any) => d.charges)
        .filter((c: any) => c.billingStatus === "PENDING")
        .reduce(
          (a: number, c: any) =>
            a + moneyToNumber(c.amount) - moneyToNumber(c.paidAmount),
          0,
        ),
    ),
    activeDebts: active.length,
  };
}

export const debtService = {
  list(userId: string, status?: DebtStatus) {
    return prisma.debt.findMany({
      where: { userId, ...(status ? { status } : {}) },
      include: {
        lateFeeRule: true,
        _count: {
          select: { payments: true, installments: true, charges: true },
        },
      },
      orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
    });
  },
  async find(userId: string, id: string) {
    const debt = await prisma.debt.findFirst({
      where: { id, userId },
      include: includeDetail,
    });
    if (!debt) throw new HttpError(404, "Utang tidak ditemukan");
    return debt;
  },
  async create(userId: string, input: any) {
    const { lateFeeRule, generateInstallments, ...data } = input;
    return prisma.$transaction(async (tx: any) => {
      const debt = await tx.debt.create({
        data: {
          ...data,
          userId,
          remainingPrincipal:
            input.remainingPrincipal ?? input.originalPrincipal,
          ...(lateFeeRule ? { lateFeeRule: { create: lateFeeRule } } : {}),
        },
        include: { lateFeeRule: true },
      });
      if (
        generateInstallments &&
        input.tenorMonths &&
        input.startDate &&
        input.dueDay
      ) {
        const total = moneyToNumber(input.originalPrincipal);
        const regular =
          moneyToNumber(input.fixedMonthlyAmount) > 0
            ? moneyToNumber(input.fixedMonthlyAmount)
            : roundMoney(total / input.tenorMonths);
        let allocated = 0;
        const rows: Array<{
          debtId: string;
          period: string;
          scheduledPrincipal: number;
          dueDate: Date;
        }> = [];
        for (let i = 0; i < input.tenorMonths; i++) {
          const base = new Date(
            Date.UTC(
              input.startDate.getUTCFullYear(),
              input.startDate.getUTCMonth() + i,
              1,
            ),
          );
          const y = base.getUTCFullYear();
          const m = base.getUTCMonth();
          const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
          const day = Math.min(input.dueDay, lastDay);
          const dueDate = new Date(Date.UTC(y, m, day));
          const period = `${y}-${String(m + 1).padStart(2, "0")}`;
          const amount =
            i === input.tenorMonths - 1
              ? roundMoney(total - allocated)
              : Math.min(regular, roundMoney(total - allocated));
          allocated = roundMoney(allocated + amount);
          rows.push({
            debtId: debt.id,
            period,
            scheduledPrincipal: amount,
            dueDate,
          });
        }
        await tx.debtInstallment.createMany({ data: rows });
        const maturityDate = rows.at(-1)?.dueDate;
        if (maturityDate)
          await tx.debt.update({
            where: { id: debt.id },
            data: { maturityDate },
          });
      }
      return tx.debt.findUnique({
        where: { id: debt.id },
        include: {
          lateFeeRule: true,
          installments: { orderBy: { dueDate: "asc" } },
        },
      });
    });
  },
  async update(userId: string, id: string, input: any) {
    await this.find(userId, id);
    const { lateFeeRule, ...data } = input;
    return prisma.debt.update({
      where: { id },
      data: {
        ...data,
        ...(lateFeeRule
          ? {
              lateFeeRule: {
                upsert: { create: lateFeeRule, update: lateFeeRule },
              },
            }
          : {}),
      },
      include: { lateFeeRule: true },
    });
  },
  async remove(userId: string, id: string) {
    const debt = await this.find(userId, id);
    if (debt.payments.length)
      throw new HttpError(
        409,
        "Utang yang memiliki pembayaran tidak dapat dihapus; ubah status menjadi CANCELLED",
      );
    await prisma.debt.delete({ where: { id } });
  },
  async createInstallment(userId: string, debtId: string, input: any) {
    const debt = await this.find(userId, debtId);
    if (debt.status === DebtStatus.PAID || debt.status === DebtStatus.CANCELLED)
      throw new HttpError(409, `Utang berstatus ${debt.status}`);
    return prisma.debtInstallment.create({
      data: { debtId, ...input },
      include: { charges: true },
    });
  },
  async planLate(
    userId: string,
    debtId: string,
    installmentId: string,
    input: any,
  ) {
    await this.find(userId, debtId);
    const ins = await prisma.debtInstallment.findFirst({
      where: { id: installmentId, debtId },
    });
    if (!ins) throw new HttpError(404, "Tagihan periode tidak ditemukan");
    return prisma.debtInstallment.update({
      where: { id: installmentId },
      data: {
        expectedPaymentDate: input.expectedPaymentDate,
        status: InstallmentStatus.RESCHEDULED,
      },
    });
  },
  async addCharge(userId: string, debtId: string, input: any) {
    await this.find(userId, debtId);
    let billingStatus: ChargeBillingStatus =
      input.settlementPolicy === "IMMEDIATE"
        ? ChargeBillingStatus.BILLED
        : ChargeBillingStatus.PENDING;
    let targetPeriod = input.targetPeriod;
    if (
      input.settlementPolicy === "NEXT_INSTALLMENT" &&
      !targetPeriod &&
      input.sourceInstallmentId
    ) {
      const s = await prisma.debtInstallment.findUnique({
        where: { id: input.sourceInstallmentId },
      });
      if (s) targetPeriod = nextPeriod(s.period);
    }
    return prisma.debtCharge.create({
      data: { debtId, ...input, billingStatus, targetPeriod },
    });
  },
  async negotiate(userId: string, debtId: string, input: any) {
    await this.find(userId, debtId);
    return prisma.debtNegotiation.create({ data: { debtId, ...input } });
  },
  async adjustInstallment(
    userId: string,
    debtId: string,
    installmentId: string,
    input: any,
  ) {
    await this.find(userId, debtId);
    const ins = await prisma.debtInstallment.findFirst({
      where: { id: installmentId, debtId },
    });
    if (!ins) throw new HttpError(404, "Tagihan periode tidak ditemukan");
    return prisma.$transaction(async (tx: any) => {
      const adj = await tx.debtAdjustment.create({
        data: {
          installmentId,
          type: input.type,
          previousDueDate: ins.dueDate,
          newDueDate: input.newDueDate,
          previousAmount: ins.scheduledPrincipal,
          newAmount: input.newAmount,
          lateFeeWaived: input.lateFeeWaived,
          reason: input.reason,
        },
      });
      await tx.debtInstallment.update({
        where: { id: installmentId },
        data: {
          ...(input.newDueDate
            ? {
                dueDate: input.newDueDate,
                status: InstallmentStatus.RESCHEDULED,
              }
            : {}),
          ...(input.newAmount !== undefined
            ? { scheduledPrincipal: input.newAmount }
            : {}),
        },
      });
      if (input.lateFeeWaived)
        await tx.debtCharge.updateMany({
          where: {
            sourceInstallmentId: installmentId,
            type: "LATE_FEE",
            billingStatus: { in: ["PENDING", "BILLED", "PARTIAL"] },
          },
          data: { billingStatus: "WAIVED" },
        });
      return adj;
    });
  },
  async pay(userId: string, debtId: string, input: any) {
    return prisma.$transaction(async (tx: any) => {
      if (input.idempotencyKey) {
        const existing = await tx.debtPayment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { allocations: true },
        });
        if (existing)
          return {
            payment: existing,
            idempotentReplay: true,
            overallSummary: await overallSummary(tx, userId),
          };
      }
      const debt = await tx.debt.findFirst({
        where: { id: debtId, userId },
        include: {
          lateFeeRule: true,
          installments: {
            where: {
              status: {
                in: ["UPCOMING", "DUE", "PARTIAL", "OVERDUE", "RESCHEDULED"],
              },
            },
            orderBy: { dueDate: "asc" },
          },
          charges: {
            where: { billingStatus: { in: ["BILLED", "PARTIAL"] } },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!debt) throw new HttpError(404, "Utang tidak ditemukan");
      if ([DebtStatus.PAID, DebtStatus.CANCELLED].includes(debt.status))
        throw new HttpError(409, `Utang berstatus ${debt.status}`);
      const paidAt = input.paidAt ?? new Date();
      let installment = input.installmentId
        ? debt.installments.find((i: any) => i.id === input.installmentId)
        : debt.installments[0];
      if (input.installmentId && !installment)
        throw new HttpError(404, "Tagihan periode tidak ditemukan");
      if (installment && debt.lateFeeRule) {
        const result = calculateLateFee(
          debt.lateFeeRule,
          installment,
          paidAt,
          moneyToNumber(debt.remainingPrincipal),
        );
        const exists = await tx.debtCharge.findFirst({
          where: { sourceInstallmentId: installment.id, type: "LATE_FEE" },
        });
        if (result.amount > 0 && !exists) {
          const policy = debt.lateFeeRule.settlementPolicy;
          await tx.debtCharge.create({
            data: {
              debtId,
              sourceInstallmentId: installment.id,
              type: "LATE_FEE",
              amount: result.amount,
              billingStatus:
                policy === LateFeeSettlementPolicy.IMMEDIATE
                  ? "BILLED"
                  : "PENDING",
              settlementPolicy: policy,
              sourcePeriod: installment.period,
              targetPeriod:
                policy === LateFeeSettlementPolicy.NEXT_INSTALLMENT
                  ? nextPeriod(installment.period)
                  : null,
              lateDays: result.chargeableDays,
              estimated: false,
              description: `Denda keterlambatan ${result.chargeableDays} hari`,
            },
          });
        }
      }
      const payment = await tx.debtPayment.create({
        data: {
          debtId,
          amount: input.amount,
          paidAt,
          source: input.source,
          note: input.note,
          idempotencyKey: input.idempotencyKey,
        },
      });
      let left = input.amount;
      const allocations: any[] = [];
      const freshCharges = await tx.debtCharge.findMany({
        where: { debtId, billingStatus: { in: ["BILLED", "PARTIAL"] } },
        orderBy: { createdAt: "asc" },
      });
      const allocateCharges = async () => {
        for (const c of freshCharges) {
          if (left <= 0) break;
          const outstanding = roundMoney(
            moneyToNumber(c.amount) - moneyToNumber(c.paidAmount),
          );
          const used = Math.min(left, outstanding);
          if (used <= 0) continue;
          const newPaid = roundMoney(moneyToNumber(c.paidAmount) + used);
          await tx.debtCharge.update({
            where: { id: c.id },
            data: {
              paidAmount: newPaid,
              billingStatus: chargeStatus(moneyToNumber(c.amount), newPaid),
            },
          });
          allocations.push(
            await tx.debtPaymentAllocation.create({
              data: {
                paymentId: payment.id,
                chargeId: c.id,
                chargeAmount: used,
              },
            }),
          );
          left = roundMoney(left - used);
        }
      };
      const allocatePrincipal = async () => {
        if (left <= 0) return;
        let capacity = moneyToNumber(debt.remainingPrincipal);
        if (installment)
          capacity = Math.min(
            capacity,
            Math.max(
              0,
              moneyToNumber(installment.scheduledPrincipal) -
                moneyToNumber(installment.paidPrincipal),
            ),
          );
        const used = Math.min(left, capacity);
        if (used <= 0) return;
        await tx.debt.update({
          where: { id: debtId },
          data: {
            remainingPrincipal: roundMoney(
              moneyToNumber(debt.remainingPrincipal) - used,
            ),
          },
        });
        if (installment) {
          const newPaid = roundMoney(
            moneyToNumber(installment.paidPrincipal) + used,
          );
          const late = new Date(paidAt) > new Date(installment.dueDate);
          await tx.debtInstallment.update({
            where: { id: installment.id },
            data: {
              paidPrincipal: newPaid,
              status:
                newPaid >= moneyToNumber(installment.scheduledPrincipal)
                  ? late
                    ? "PAID_LATE"
                    : "PAID"
                  : "PARTIAL",
            },
          });
        }
        allocations.push(
          await tx.debtPaymentAllocation.create({
            data: {
              paymentId: payment.id,
              installmentId: installment?.id,
              principalAmount: used,
            },
          }),
        );
        left = roundMoney(left - used);
      };
      if (debt.allocationPolicy === "OLDEST_CHARGE_FIRST") {
        await allocateCharges();
        await allocatePrincipal();
      } else {
        await allocatePrincipal();
        await allocateCharges();
      }
      if (left > 0)
        throw new HttpError(
          422,
          "Pembayaran melebihi kewajiban yang dapat dialokasikan",
          { unallocatedAmount: left },
        );
      const updated = await tx.debt.findUnique({
        where: { id: debtId },
        include: { charges: true, installments: true },
      });
      const principal = moneyToNumber(updated!.remainingPrincipal);
      const outstandingCharges = updated!.charges
        .filter((c: any) => !["PAID", "WAIVED"].includes(c.billingStatus))
        .reduce(
          (a: number, c: any) =>
            a + moneyToNumber(c.amount) - moneyToNumber(c.paidAmount),
          0,
        );
      const status =
        principal === 0
          ? outstandingCharges > 0
            ? DebtStatus.SETTLEMENT_PENDING
            : DebtStatus.PAID
          : DebtStatus.ACTIVE;
      await tx.debt.update({ where: { id: debtId }, data: { status } });
      return {
        payment: { ...payment, allocations },
        idempotentReplay: false,
        debt: {
          id: debt.id,
          name: debt.name,
          remainingPrincipal: principal,
          status,
        },
        installment: installment
          ? await tx.debtInstallment.findUnique({
              where: { id: installment.id },
              include: { charges: true },
            })
          : null,
        overallSummary: await overallSummary(tx, userId),
      };
    });
  },
};
