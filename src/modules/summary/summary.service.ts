import { DebtStatus } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { moneyToNumber, roundMoney } from "../../common/money.js";
export async function getSummary(userId: string) {
  const debts = await prisma.debt.findMany({
    where: { userId },
    include: { charges: true, installments: true },
  });
  const active = debts.filter(
    (d: any) => ![DebtStatus.PAID, DebtStatus.CANCELLED].includes(d.status),
  );
  const totalOriginal = debts.reduce(
    (a: number, d: any) => a + moneyToNumber(d.originalPrincipal),
    0,
  );
  const totalRemainingPrincipal = active.reduce(
    (a: number, d: any) => a + moneyToNumber(d.remainingPrincipal),
    0,
  );
  const totalBilledCharges = active
    .flatMap((d: any) => d.charges)
    .filter((c: any) => ["BILLED", "PARTIAL"].includes(c.billingStatus))
    .reduce(
      (a: number, c: any) =>
        a + moneyToNumber(c.amount) - moneyToNumber(c.paidAmount),
      0,
    );
  const totalPendingCharges = active
    .flatMap((d: any) => d.charges)
    .filter((c: any) => c.billingStatus === "PENDING")
    .reduce(
      (a: number, c: any) =>
        a + moneyToNumber(c.amount) - moneyToNumber(c.paidAmount),
      0,
    );
  const mandatoryMonthly = active.reduce(
    (a: number, d: any) =>
      a +
      (d.paymentPolicy === "FIXED"
        ? moneyToNumber(d.fixedMonthlyAmount)
        : moneyToNumber(d.minimumMonthlyAmount)),
    0,
  );
  const byPriority = Object.fromEntries(
    ["CRITICAL", "URGENT", "NORMAL", "SLOW"].map((p) => [
      p,
      {
        count: active.filter((d: any) => d.priority === p).length,
        remainingPrincipal: roundMoney(
          active
            .filter((d: any) => d.priority === p)
            .reduce(
              (a: number, d: any) => a + moneyToNumber(d.remainingPrincipal),
              0,
            ),
        ),
      },
    ]),
  );
  return {
    totalDebts: debts.length,
    activeDebts: active.length,
    paidDebts: debts.filter((d: any) => d.status === DebtStatus.PAID).length,
    totalOriginal: roundMoney(totalOriginal),
    totalRemainingPrincipal: roundMoney(totalRemainingPrincipal),
    totalBilledCharges: roundMoney(totalBilledCharges),
    totalPendingCharges: roundMoney(totalPendingCharges),
    totalOutstanding: roundMoney(
      totalRemainingPrincipal + totalBilledCharges + totalPendingCharges,
    ),
    mandatoryMonthly: roundMoney(mandatoryMonthly),
    byPriority,
  };
}
