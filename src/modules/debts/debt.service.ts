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
import { generateDebtSchedule } from "./debt-schedule.calculator.js";
import type { DebtInterestMethod } from "./debt-calculation.types.js";

const includeDetail = {
  lateFeeRule: true,
  installments: {
    orderBy: { dueDate: "asc" as const },
    include: { charges: true, billedCharges: true, adjustments: true },
  },
  charges: { orderBy: { createdAt: "asc" as const } },
  payments: {
    orderBy: { paidAt: "desc" as const },
    include: { allocations: true, sourceAccount: true },
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
    const {
      lateFeeRule,
      generateInstallments,
      interestMethod: requestedInterestMethod,
      alreadyPaidAmount,
      ...data
    } = input;
    return prisma.$transaction(async (tx: any) => {
      const principal = moneyToNumber(input.originalPrincipal);
      const fixedMonthlyAmount = moneyToNumber(input.fixedMonthlyAmount);
      const inferredInterestMethod: DebtInterestMethod =
        requestedInterestMethod ??
        (input.paymentPolicy === "FIXED" &&
        input.tenorMonths &&
        fixedMonthlyAmount * input.tenorMonths > principal
          ? "MANUAL_CONTRACT"
          : moneyToNumber(input.interestRateAnnual) > 0
            ? "FLAT"
            : "NONE");
      let schedule: ReturnType<typeof generateDebtSchedule> | null = null;
      if (
        generateInstallments &&
        input.tenorMonths &&
        input.startDate &&
        input.dueDay
      ) {
        const start = new Date(input.startDate);
        const lastDay = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
        ).getUTCDate();
        const firstDueDate = new Date(
          Date.UTC(
            start.getUTCFullYear(),
            start.getUTCMonth(),
            Math.min(input.dueDay, lastDay),
          ),
        );
        schedule = generateDebtSchedule({
          principal,
          tenorMonths: input.tenorMonths,
          firstDueDate,
          interestMethod: inferredInterestMethod,
          annualInterestRate: moneyToNumber(input.interestRateAnnual),
          ...(fixedMonthlyAmount > 0
            ? { contractBaseInstallment: fixedMonthlyAmount }
            : {}),
        });
        if (
          moneyToNumber(alreadyPaidAmount ?? 0) >
          schedule.totalContractPayment
        ) {
          throw new HttpError(
            400,
            "Jumlah yang sudah terbayar melebihi total kontrak",
          );
        }
      }
      const debt = await tx.debt.create({
        data: {
          ...data,
          userId,
          interestMethod: inferredInterestMethod,
          totalContractAmount:
            schedule?.totalContractPayment ??
            (fixedMonthlyAmount > 0 && input.tenorMonths
              ? roundMoney(fixedMonthlyAmount * input.tenorMonths)
              : null),
          remainingPrincipal:
            input.remainingPrincipal ?? input.originalPrincipal,
          ...(lateFeeRule ? { lateFeeRule: { create: lateFeeRule } } : {}),
        },
        include: { lateFeeRule: true },
      });
      const createdInstallments: Array<{
        id: string;
        dueDate: Date;
        baseInstallment: number;
      }> = [];
      if (schedule) {
        for (const row of schedule.installments) {
          const installment = await tx.debtInstallment.create({
            data: {
              debtId: debt.id,
              period: row.period,
              scheduledPrincipal: row.principal,
              dueDate: row.dueDate,
            },
          });
          createdInstallments.push({
            id: installment.id,
            dueDate: row.dueDate,
            baseInstallment: row.baseInstallment,
          });
          const charges = [
            ...(row.interest > 0
              ? [
                  {
                    type: "INTEREST",
                    amount: row.interest,
                    description: `Bunga cicilan periode ${row.period}`,
                  },
                ]
              : []),
            ...(row.fees > 0
              ? [
                  {
                    type: "ADMIN_FEE",
                    amount: row.fees,
                    description: `Biaya cicilan periode ${row.period}`,
                  },
                ]
              : []),
          ];
          for (const charge of charges) {
            await tx.debtCharge.create({
              data: {
                debtId: debt.id,
                billedInstallmentId: installment.id,
                type: charge.type,
                amount: charge.amount,
                billingStatus: "PENDING",
                settlementPolicy: "IMMEDIATE",
                targetPeriod: row.period,
                estimated: row.estimated,
                description: charge.description,
              },
            });
          }
        }
        const maturityDate = schedule.installments.at(-1)?.dueDate;
        if (maturityDate)
          await tx.debt.update({
            where: { id: debt.id },
            data: { maturityDate },
          });
        let openingPaid = moneyToNumber(alreadyPaidAmount ?? 0);
        for (const installment of createdInstallments) {
          if (openingPaid <= 0) break;
          const amount = Math.min(openingPaid, installment.baseInstallment);
          await debtService.pay(
            userId,
            debt.id,
            {
              amount,
              paidAt: installment.dueDate,
              source: "SYSTEM",
              note: "Saldo pembayaran sebelum utang ditambahkan",
              installmentId: installment.id,
              idempotencyKey: `opening-${debt.id}-${installment.id}`,
            },
            tx,
          );
          openingPaid = roundMoney(openingPaid - amount);
        }
      }
      return tx.debt.findUnique({
        where: { id: debt.id },
        include: {
          lateFeeRule: true,
          installments: {
            orderBy: { dueDate: "asc" },
            include: { billedCharges: true },
          },
        },
      });
    });
  },
  async update(userId: string, id: string, input: any) {
    await this.find(userId, id);
    const {
      lateFeeRule,
      generateInstallments: _generateInstallments,
      alreadyPaidAmount: _alreadyPaidAmount,
      ...data
    } = input;
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
  async pay(userId: string, debtId: string, input: any, transaction?: any) {
    const execute = async (tx: any) => {
      if (input.idempotencyKey) {
        const existing = await tx.debtPayment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { allocations: true, debt: true, sourceAccount: true },
        });
        if (existing) {
          if (existing.debt.userId !== userId || existing.debtId !== debtId) {
            throw new HttpError(409, "Idempotency key sudah digunakan");
          }
          return {
            payment: existing,
            idempotentReplay: true,
            overallSummary: await overallSummary(tx, userId),
          };
        }
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
      if (installment) {
        await tx.debtCharge.updateMany({
          where: {
            debtId,
            billingStatus: "PENDING",
            OR: [
              { billedInstallmentId: installment.id },
              { targetPeriod: installment.period },
            ],
          },
          data: { billingStatus: "BILLED" },
        });
        if (
          debt.installments.length === 1 &&
          debt.installments[0]?.id === installment.id
        ) {
          await tx.debtCharge.updateMany({
            where: {
              debtId,
              billingStatus: "PENDING",
              settlementPolicy: "END_OF_TERM",
            },
            data: {
              billingStatus: "BILLED",
              billedInstallmentId: installment.id,
            },
          });
        }
      }
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
        } else if (
          exists &&
          ["DAILY", "PERCENTAGE_DAILY"].includes(
            debt.lateFeeRule.calculationType,
          ) &&
          result.chargeableDays > Number(exists.lateDays ?? 0)
        ) {
          const additionalDays =
            result.chargeableDays - Number(exists.lateDays ?? 0);
          const dailyAccrual =
            debt.lateFeeRule.calculationType === "DAILY"
              ? moneyToNumber(debt.lateFeeRule.dailyAmount)
              : result.amount / result.chargeableDays;
          let amount = roundMoney(
            moneyToNumber(exists.amount) + dailyAccrual * additionalDays,
          );
          if (debt.lateFeeRule.maxAmount) {
            amount = Math.min(
              amount,
              moneyToNumber(debt.lateFeeRule.maxAmount),
            );
          }
          const paidAmount = moneyToNumber(exists.paidAmount);
          const policy = debt.lateFeeRule.settlementPolicy;
          await tx.debtCharge.update({
            where: { id: exists.id },
            data: {
              amount,
              lateDays: result.chargeableDays,
              billingStatus:
                policy === LateFeeSettlementPolicy.IMMEDIATE
                  ? chargeStatus(amount, paidAmount)
                  : exists.billingStatus === "PAID"
                    ? "PENDING"
                    : exists.billingStatus,
              description: `Denda keterlambatan ${result.chargeableDays} hari`,
            },
          });
        }
      }
      const payment = await tx.debtPayment.create({
        data: {
          debtId,
          amount: input.amount,
          sourceAccountId: input.sourceAccountId,
          paidAt,
          source: input.source,
          note: input.note,
          idempotencyKey: input.idempotencyKey,
        },
      });
      let left = input.amount;
      const allocations: any[] = [];
      const freshCharges = await tx.debtCharge.findMany({
        where: {
          debtId,
          billingStatus: { in: ["BILLED", "PARTIAL"] },
          ...(installment
            ? {
                OR: [
                  { billedInstallmentId: installment.id },
                  { sourceInstallmentId: installment.id },
                  { targetPeriod: installment.period },
                  { settlementPolicy: "END_OF_TERM" },
                ],
              }
            : {}),
        },
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
      if (installment) {
        const currentInstallment = await tx.debtInstallment.findUnique({
          where: { id: installment.id },
        });
        const installmentCharges = await tx.debtCharge.findMany({
          where: {
            debtId,
            OR: [
              { billedInstallmentId: installment.id },
              { sourceInstallmentId: installment.id },
              { targetPeriod: installment.period },
              { settlementPolicy: "END_OF_TERM" },
            ],
            billingStatus: { in: ["BILLED", "PARTIAL"] },
          },
        });
        const chargesPaid = installmentCharges.every(
          (charge: any) =>
            moneyToNumber(charge.paidAmount) >= moneyToNumber(charge.amount),
        );
        const principalPaid =
          moneyToNumber(currentInstallment?.paidPrincipal) >=
          moneyToNumber(currentInstallment?.scheduledPrincipal);
        const late = new Date(paidAt) > new Date(installment.dueDate);
        await tx.debtInstallment.update({
          where: { id: installment.id },
          data: {
            status:
              principalPaid && chargesPaid
                ? late
                  ? "PAID_LATE"
                  : "PAID"
                : "PARTIAL",
          },
        });
      }
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
              include: { charges: true, billedCharges: true },
            })
          : null,
        overallSummary: await overallSummary(tx, userId),
      };
    };
    return transaction ? execute(transaction) : prisma.$transaction(execute);
  },
};
