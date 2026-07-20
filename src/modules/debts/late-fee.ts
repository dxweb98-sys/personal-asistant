import { moneyToNumber, roundMoney } from "../../common/money.js";
function calendarDaysBetween(a: Date, b: Date) {
  const x = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const y = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.floor((x - y) / 86400000);
}
export function calculateLateFee(
  rule: any,
  installment: any,
  paidAt: Date,
  remainingPrincipal: number,
) {
  const calendarLateDays = Math.max(
    0,
    calendarDaysBetween(new Date(paidAt), new Date(installment.dueDate)),
  );
  const chargeableDays = Math.max(
    0,
    Math.min(
      calendarLateDays - rule.graceDays,
      rule.maxDays ?? Number.MAX_SAFE_INTEGER,
    ),
  );
  if (
    chargeableDays === 0 ||
    rule.calculationType === "NONE" ||
    rule.calculationType === "MANUAL"
  )
    return { calendarLateDays, chargeableDays, amount: 0 };
  const unpaid = Math.max(
    0,
    moneyToNumber(installment.scheduledPrincipal) -
      moneyToNumber(installment.paidPrincipal),
  );
  const base =
    rule.percentageBase === "INSTALLMENT_AMOUNT"
      ? moneyToNumber(installment.scheduledPrincipal)
      : rule.percentageBase === "REMAINING_PRINCIPAL"
        ? remainingPrincipal
        : unpaid;
  let amount = 0;
  if (rule.calculationType === "FIXED")
    amount = moneyToNumber(rule.fixedAmount);
  if (rule.calculationType === "DAILY")
    amount = moneyToNumber(rule.dailyAmount) * chargeableDays;
  if (rule.calculationType === "PERCENTAGE_FIXED")
    amount = base * (moneyToNumber(rule.percentage) / 100);
  if (rule.calculationType === "PERCENTAGE_DAILY")
    amount = base * (moneyToNumber(rule.percentage) / 100) * chargeableDays;
  if (rule.maxAmount) amount = Math.min(amount, moneyToNumber(rule.maxAmount));
  return { calendarLateDays, chargeableDays, amount: roundMoney(amount) };
}
