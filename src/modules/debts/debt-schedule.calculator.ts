import type {
  DebtInstallmentCalculation,
  DebtScheduleInput,
  DebtScheduleResult,
  ManualScheduleItem,
} from "./debt-calculation.types.js";
import {
  addMonthsClamped,
  assertFiniteNonNegative,
  periodKey,
  roundMoney,
  utcDateOnly,
} from "./debt-calculation.shared.js";

function buildManualSchedule(input: DebtScheduleInput): DebtScheduleResult {
  const rows = input.manualSchedule;
  if (!rows?.length) {
    throw new Error("manualSchedule wajib diisi untuk MANUAL_SCHEDULE");
  }
  if (rows.length !== input.tenorMonths) {
    throw new Error("Jumlah manualSchedule harus sama dengan tenorMonths");
  }

  let openingPrincipal = roundMoney(input.principal);
  const warnings: string[] = [];
  const installments = rows
    .slice()
    .sort((a, b) => a.installmentNumber - b.installmentNumber)
    .map((row: ManualScheduleItem): DebtInstallmentCalculation => {
      assertFiniteNonNegative("principal", row.principal);
      assertFiniteNonNegative("interest", row.interest);
      assertFiniteNonNegative("fees", row.fees ?? 0);

      const principal = Math.min(openingPrincipal, roundMoney(row.principal));
      const interest = roundMoney(row.interest);
      const fees = roundMoney(row.fees ?? 0);
      const calculatedBase = roundMoney(principal + interest + fees);
      const baseInstallment = roundMoney(row.baseInstallment ?? calculatedBase);
      if (Math.abs(baseInstallment - calculatedBase) > 0.01) {
        warnings.push(
          `Cicilan ${row.installmentNumber}: cicilan dasar tidak sama dengan pokok + bunga + biaya`,
        );
      }
      const closingPrincipal = roundMoney(openingPrincipal - principal);
      const result = {
        installmentNumber: row.installmentNumber,
        period: periodKey(row.dueDate),
        dueDate: utcDateOnly(row.dueDate),
        openingPrincipal,
        principal,
        interest,
        fees,
        baseInstallment,
        closingPrincipal,
        estimated: false,
      };
      openingPrincipal = closingPrincipal;
      return result;
    });

  const totalPrincipal = roundMoney(
    installments.reduce((sum, row) => sum + row.principal, 0),
  );
  if (Math.abs(totalPrincipal - input.principal) > 0.01) {
    throw new Error("Total pokok jadwal manual tidak sama dengan pokok pinjaman");
  }
  return summarize(input, installments, false, warnings);
}

function summarize(
  input: DebtScheduleInput,
  installments: DebtInstallmentCalculation[],
  estimated: boolean,
  warnings: string[],
): DebtScheduleResult {
  const totalPrincipal = roundMoney(
    installments.reduce((sum, row) => sum + row.principal, 0),
  );
  const totalInterest = roundMoney(
    installments.reduce((sum, row) => sum + row.interest, 0),
  );
  const totalFees = roundMoney(
    installments.reduce((sum, row) => sum + row.fees, 0),
  );
  return {
    interestMethod: input.interestMethod,
    installments,
    totalPrincipal,
    totalInterest,
    averageMonthlyInterest: roundMoney(totalInterest / input.tenorMonths),
    totalFees,
    totalContractPayment: roundMoney(totalPrincipal + totalInterest + totalFees),
    estimated,
    warnings,
  };
}

export function generateDebtSchedule(
  input: DebtScheduleInput,
): DebtScheduleResult {
  assertFiniteNonNegative("principal", input.principal);
  if (input.principal <= 0) throw new Error("principal harus lebih dari 0");
  if (!Number.isInteger(input.tenorMonths) || input.tenorMonths <= 0) {
    throw new Error("tenorMonths harus berupa bilangan bulat positif");
  }
  if (Number.isNaN(input.firstDueDate.getTime())) {
    throw new Error("firstDueDate tidak valid");
  }
  assertFiniteNonNegative("annualInterestRate", input.annualInterestRate ?? 0);
  assertFiniteNonNegative(
    "recurringFeePerInstallment",
    input.recurringFeePerInstallment ?? 0,
  );
  assertFiniteNonNegative(
    "totalFeesIncludedInInstallments",
    input.totalFeesIncludedInInstallments ?? 0,
  );
  if (input.interestMethod === "MANUAL_SCHEDULE") {
    return buildManualSchedule(input);
  }

  const principal = roundMoney(input.principal);
  const tenor = input.tenorMonths;
  const monthlyRate = (input.annualInterestRate ?? 0) / 1_200;
  const monthlyFees = roundMoney(
    (input.recurringFeePerInstallment ?? 0) +
      (input.totalFeesIncludedInInstallments ?? 0) / tenor,
  );
  const warnings: string[] = [];
  let estimated = false;
  let flatInterest = 0;
  let flatInterestTotal = 0;

  if (input.interestMethod === "FLAT") {
    if ((input.annualInterestRate ?? 0) > 0) {
      flatInterestTotal = roundMoney(principal * monthlyRate * tenor);
      flatInterest = roundMoney(flatInterestTotal / tenor);
    } else if ((input.contractBaseInstallment ?? 0) > 0) {
      flatInterestTotal = roundMoney(
        Math.max(
          0,
          input.contractBaseInstallment! * tenor -
            principal -
            monthlyFees * tenor,
        ),
      );
      flatInterest = roundMoney(flatInterestTotal / tenor);
      estimated = true;
      warnings.push(
        "Bunga flat diestimasi dari cicilan tetap karena suku bunga tidak tersedia",
      );
    }
  }

  if (input.interestMethod === "MANUAL_CONTRACT") {
    if (!(input.contractBaseInstallment && input.contractBaseInstallment > 0)) {
      throw new Error(
        "contractBaseInstallment wajib diisi untuk MANUAL_CONTRACT",
      );
    }
    flatInterestTotal = roundMoney(
      Math.max(
        0,
        input.contractBaseInstallment * tenor - principal - monthlyFees * tenor,
      ),
    );
    flatInterest = roundMoney(flatInterestTotal / tenor);
    estimated = true;
    warnings.push(
      "Pokok dan bunga dipisahkan sebagai estimasi dari total pembayaran kontrak",
    );
  }

  const annuityPayment =
    input.interestMethod !== "ANNUITY"
      ? 0
      : monthlyRate === 0
        ? roundMoney(principal / tenor)
        : roundMoney(
            (principal * monthlyRate) /
              (1 - Math.pow(1 + monthlyRate, -tenor)),
          );
  const equalPrincipal = roundMoney(principal / tenor);
  const installments: DebtInstallmentCalculation[] = [];
  let openingPrincipal = principal;

  for (let index = 0; index < tenor; index += 1) {
    const dueDate = addMonthsClamped(input.firstDueDate, index);
    let interest = 0;
    let principalDue = equalPrincipal;

    if (["FLAT", "MANUAL_CONTRACT"].includes(input.interestMethod)) {
      interest = flatInterest;
    } else if (input.interestMethod === "EFFECTIVE") {
      interest = roundMoney(openingPrincipal * monthlyRate);
    } else if (input.interestMethod === "ANNUITY") {
      interest = roundMoney(openingPrincipal * monthlyRate);
      principalDue = roundMoney(annuityPayment - interest);
    }
    if (index === tenor - 1) principalDue = openingPrincipal;
    principalDue = roundMoney(
      Math.max(0, Math.min(openingPrincipal, principalDue)),
    );
    const closingPrincipal = roundMoney(openingPrincipal - principalDue);
    installments.push({
      installmentNumber: index + 1,
      period: periodKey(dueDate),
      dueDate,
      openingPrincipal,
      principal: principalDue,
      interest,
      fees: monthlyFees,
      baseInstallment: roundMoney(principalDue + interest + monthlyFees),
      closingPrincipal,
      estimated,
    });
    openingPrincipal = closingPrincipal;
  }

  if (
    ["FLAT", "MANUAL_CONTRACT"].includes(input.interestMethod) &&
    installments.length > 0
  ) {
    const allocatedInterest = roundMoney(
      installments.reduce((sum, row) => sum + row.interest, 0),
    );
    const roundingAdjustment = roundMoney(
      flatInterestTotal - allocatedInterest,
    );
    if (roundingAdjustment !== 0) {
      const lastInstallment = installments.at(-1)!;
      lastInstallment.interest = roundMoney(
        lastInstallment.interest + roundingAdjustment,
      );
      lastInstallment.baseInstallment = roundMoney(
        lastInstallment.baseInstallment + roundingAdjustment,
      );
    }
  }

  if (
    input.contractBaseInstallment &&
    input.interestMethod !== "MANUAL_CONTRACT" &&
    Math.abs(
      installments.reduce((sum, row) => sum + row.baseInstallment, 0) -
        input.contractBaseInstallment * tenor,
    ) > 1
  ) {
    warnings.push(
      "Cicilan kontrak berbeda dari hasil metode bunga; periksa bunga dan biaya",
    );
  }
  return summarize(input, installments, estimated, warnings);
}
