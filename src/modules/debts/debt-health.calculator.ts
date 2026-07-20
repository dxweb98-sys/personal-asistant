import type {
  DebtHealthInput,
  DebtHealthResult,
  DebtHealthThresholds,
} from "./debt-calculation.types.js";
import { roundMoney } from "./debt-calculation.shared.js";

const DEFAULT_THRESHOLDS: DebtHealthThresholds = {
  healthyMaxDsr: 30,
  attentionMaxDsr: 40,
  unhealthyMaxDsr: 50,
  severeLateDays: 30,
  criticalLateDays: 60,
};

export function calculateDebtHealth(input: DebtHealthInput): DebtHealthResult {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  if (
    input.monthlyNetIncome === undefined ||
    input.mandatoryExpenses === undefined ||
    input.monthlyNetIncome <= 0
  ) {
    return {
      status: "INSUFFICIENT_DATA",
      debtServiceRatio: null,
      freeCashFlow: null,
      reasons: ["Pendapatan bersih atau pengeluaran wajib belum tersedia"],
      suggestions: [
        "Lengkapi pendapatan dan pengeluaran wajib agar indikator dapat dihitung",
      ],
      thresholds,
    };
  }

  const debtServiceRatio = roundMoney(
    (input.monthlyDebtService / input.monthlyNetIncome) * 100,
  );
  const freeCashFlow = roundMoney(
    input.freeCashFlow ??
      input.monthlyNetIncome - input.mandatoryExpenses - input.monthlyDebtService,
  );
  const cannotPayNext =
    input.availableCash !== undefined && input.availableCash < input.nextPaymentAmount;
  let status: DebtHealthResult["status"] = "HEALTHY";

  if (
    debtServiceRatio > thresholds.unhealthyMaxDsr ||
    input.overdueInstallments >= 3 ||
    input.maxLateDays >= thresholds.criticalLateDays ||
    freeCashFlow < 0
  ) {
    status = "CRITICAL";
  } else if (
    debtServiceRatio > thresholds.attentionMaxDsr ||
    input.overdueInstallments >= 2 ||
    input.maxLateDays >= thresholds.severeLateDays ||
    freeCashFlow < input.nextPaymentAmount * 0.5
  ) {
    status = "UNHEALTHY";
  } else if (
    debtServiceRatio > thresholds.healthyMaxDsr ||
    input.overdueInstallments > 0 ||
    input.activePenalty > 0 ||
    freeCashFlow < input.nextPaymentAmount ||
    cannotPayNext
  ) {
    status = "NEEDS_ATTENTION";
  }

  const reasons = [`Rasio cicilan terhadap pendapatan: ${debtServiceRatio}%`];
  if (input.overdueInstallments > 0) {
    reasons.push(`${input.overdueInstallments} cicilan memiliki tunggakan aktif`);
  }
  if (input.maxLateDays > 0) {
    reasons.push(`Keterlambatan terberat: ${input.maxLateDays} hari`);
  }
  if (input.activePenalty > 0) {
    reasons.push(`Denda berjalan: ${roundMoney(input.activePenalty)}`);
  }
  if (freeCashFlow < 0) reasons.push("Arus kas bebas negatif");
  else if (freeCashFlow < input.nextPaymentAmount) {
    reasons.push("Arus kas bebas belum cukup untuk tagihan berikutnya");
  }
  if (cannotPayNext) {
    reasons.push("Dana tersedia belum cukup untuk tagihan berikutnya");
  }
  if ((input.emergencyFundMonths ?? 0) < 1) {
    reasons.push("Dana darurat kurang dari satu bulan pengeluaran wajib");
  }

  const suggestions: string[] = [];
  if (status === "HEALTHY") {
    suggestions.push("Pertahankan pembayaran tepat waktu dan arus kas positif");
  } else {
    if (input.overdueInstallments > 0 || input.activePenalty > 0) {
      suggestions.push("Prioritaskan tunggakan dan denda yang sudah jatuh tempo");
    }
    if (debtServiceRatio > thresholds.healthyMaxDsr) {
      suggestions.push("Hindari cicilan baru sampai rasio pembayaran menurun");
    }
    if (freeCashFlow < input.nextPaymentAmount || cannotPayNext) {
      suggestions.push("Kurangi pengeluaran tidak wajib atau negosiasikan pembayaran");
    }
  }

  return {
    status,
    debtServiceRatio,
    freeCashFlow,
    reasons,
    suggestions,
    thresholds,
  };
}
