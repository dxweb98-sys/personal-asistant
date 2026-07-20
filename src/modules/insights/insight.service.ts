import { financeService } from "../finance/finance.service.js";
import { investmentService } from "../investments/investment.service.js";
import { getSummary } from "../summary/summary.service.js";
import { prisma } from "../../lib/prisma.js";
import { settingsService } from "../settings/settings.service.js";
import { convertCurrency } from "../../common/fx.js";
export const insightService = {
  async dashboard(userId: string) {
    const now = new Date(),
      from = new Date(now.getFullYear(), now.getMonth(), 1),
      pref = await settingsService.get(userId);
    const [cashflow, portfolio, debt, accounts, debts] = await Promise.all([
      financeService.cashflow(userId, from, now),
      investmentService.portfolio(userId),
      getSummary(userId),
      prisma.financialAccount.findMany({ where: { userId, isActive: true } }),
      prisma.debt.findMany({ where: { userId, status: { not: "PAID" } } }),
    ]);
    let liquid = 0,
      totalDebt = 0;
    const missing = new Set<string>([
      ...cashflow.missingCurrencies,
      ...portfolio.missingCurrencies,
    ]);
    for (const a of accounts.filter((a) =>
      ["CASH", "BANK", "E_WALLET", "CRYPTO_WALLET"].includes(a.type),
    )) {
      const cv = await convertCurrency(
        userId,
        Number(a.currentBalance),
        a.currency,
        pref.baseCurrency,
        pref.fxStaleHours,
      );
      if (cv.convertedAmount === null) missing.add(a.currency);
      else liquid += cv.convertedAmount;
    }
    for (const d of debts) {
      const cv = await convertCurrency(
        userId,
        Number(d.remainingPrincipal),
        d.currency,
        pref.baseCurrency,
        pref.fxStaleHours,
      );
      if (cv.convertedAmount === null) missing.add(d.currency);
      else totalDebt += cv.convertedAmount;
    }
    const confirmedAssets = liquid + portfolio.confirmedMarketValue;
    const estimatedAssets = confirmedAssets + portfolio.estimatedMarketValue;
    const confirmedNetWorth = confirmedAssets - totalDebt;
    const estimatedNetWorth = estimatedAssets - totalDebt;
    const insights: string[] = [];
    if (missing.size)
      insights.push(
        `Total belum lengkap karena kurs ${[...missing].join(", ")} ke ${pref.baseCurrency} belum tersedia.`,
      );
    if (cashflow.netCashFlow < 0)
      insights.push(
        "Arus kas bulan ini negatif. Prioritaskan kebutuhan wajib dan evaluasi pengeluaran terbesar.",
      );
    else
      insights.push(`Arus kas bulan ini positif dalam ${pref.baseCurrency}.`);
    return {
      asOf: now,
      currency: pref.baseCurrency,
      liquidAssets: liquid,
      confirmedInvestmentValue: portfolio.confirmedMarketValue,
      estimatedInvestmentValue: portfolio.estimatedMarketValue,
      totalDebt,
      confirmedNetWorth,
      estimatedNetWorth,
      cashflow,
      portfolio,
      debt,
      missingCurrencies: [...missing],
      insights,
    };
  },
};
