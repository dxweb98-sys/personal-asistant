import { prisma } from "../../lib/prisma.js";
import { upsertExchangeRate } from "../../common/fx.js";

const FIAT_CODE = /^[A-Z]{3}$/;
const PROVIDER_URL = "https://api.frankfurter.dev/v1/latest";

export type FxRefreshItem = {
  fromCurrency: string;
  toCurrency: string;
  status: "UPDATED" | "SKIPPED" | "FAILED";
  rate?: number;
  previousRate?: number | null;
  changePercent?: number | null;
  capturedAt?: Date;
  reason?: string;
};

function upper(value: string) {
  return value.trim().toUpperCase();
}

async function currenciesInUse(userId: string): Promise<string[]> {
  const [accounts, debts, instruments, transactions, dividends] =
    await Promise.all([
      prisma.financialAccount.findMany({
        where: { userId, isActive: true },
        select: { currency: true },
      }),
      prisma.debt.findMany({ where: { userId }, select: { currency: true } }),
      prisma.investmentInstrument.findMany({
        where: { userId, isActive: true },
        select: { currency: true },
      }),
      prisma.financialTransaction.findMany({
        where: { userId },
        distinct: ["currency"],
        select: { currency: true },
      }),
      prisma.dividendIncome.findMany({
        where: { userId },
        distinct: ["currency"],
        select: { currency: true },
      }),
    ]);

  return [
    ...new Set(
      [
        ...accounts.map((x) => x.currency),
        ...debts.map((x) => x.currency),
        ...instruments.map((x) => x.currency),
        ...transactions.map((x) => x.currency),
        ...dividends.map((x) => x.currency),
      ]
        .map(upper)
        .filter(Boolean),
    ),
  ].sort();
}

async function fetchReferenceRate(fromCurrency: string, toCurrency: string) {
  const from = upper(fromCurrency);
  const to = upper(toCurrency);
  const url = new URL(PROVIDER_URL);
  url.searchParams.set("base", from);
  url.searchParams.set("symbols", to);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "personal-finance-os/9",
      },
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Provider merespons HTTP ${response.status}`);
    const payload = (await response.json()) as {
      date?: string;
      rates?: Record<string, number>;
    };
    const rate = Number(payload.rates?.[to]);
    if (!(rate > 0))
      throw new Error(`Kurs ${from}/${to} tidak tersedia dari provider`);
    const capturedAt = payload.date
      ? new Date(`${payload.date}T16:00:00.000Z`)
      : new Date();
    return { rate, capturedAt };
  } finally {
    clearTimeout(timeout);
  }
}

export const fxProviderService = {
  currenciesInUse,

  async preview(userId: string, baseCurrency: string) {
    const target = upper(baseCurrency);
    const currencies = await currenciesInUse(userId);
    return currencies
      .filter((code) => code !== target)
      .map((code) => ({
        currency: code,
        targetCurrency: target,
        supported: FIAT_CODE.test(code),
      }));
  },

  async refreshUsedCurrencies(
    userId: string,
    baseCurrency: string,
  ): Promise<FxRefreshItem[]> {
    const target = upper(baseCurrency);
    const preview = await this.preview(userId, target);
    const results: FxRefreshItem[] = [];

    for (const pair of preview) {
      const from = pair.currency;
      if (!pair.supported) {
        results.push({
          fromCurrency: from,
          toCurrency: target,
          status: "SKIPPED",
          reason:
            "Bukan kode fiat ISO 4217; masukkan kurs manual atau gunakan provider crypto.",
        });
        continue;
      }

      try {
        const previous = await prisma.exchangeRate.findFirst({
          where: { userId, baseCurrency: from, quoteCurrency: target },
          orderBy: { capturedAt: "desc" },
        });
        const latest = await fetchReferenceRate(from, target);
        await upsertExchangeRate(
          userId,
          from,
          target,
          latest.rate,
          "API",
          latest.capturedAt,
        );
        const previousRate = previous ? Number(previous.rate) : null;
        const changePercent =
          previousRate && previousRate > 0
            ? ((latest.rate - previousRate) / previousRate) * 100
            : null;
        results.push({
          fromCurrency: from,
          toCurrency: target,
          status: "UPDATED",
          rate: latest.rate,
          previousRate,
          changePercent,
          capturedAt: latest.capturedAt,
        });
      } catch (error) {
        results.push({
          fromCurrency: from,
          toCurrency: target,
          status: "FAILED",
          reason:
            error instanceof Error ? error.message : "Gagal mengambil kurs",
        });
      }
    }
    return results;
  },
};
