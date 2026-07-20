import { prisma } from "../lib/prisma.js";

export type Conversion = {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number | null;
  targetCurrency: string;
  rate: number | null;
  rateAsOf: Date | null;
  status: "SAME_CURRENCY" | "FRESH" | "STALE" | "MISSING";
};

const upper = (v: string) => v.trim().toUpperCase();

export async function convertCurrency(
  userId: string,
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  staleAfterHours = 24,
): Promise<Conversion> {
  const from = upper(fromCurrency);
  const to = upper(toCurrency);
  if (from === to)
    return {
      originalAmount: amount,
      originalCurrency: from,
      convertedAmount: amount,
      targetCurrency: to,
      rate: 1,
      rateAsOf: null,
      status: "SAME_CURRENCY",
    };

  const direct = await prisma.exchangeRate.findFirst({
    where: { userId, baseCurrency: from, quoteCurrency: to },
    orderBy: { capturedAt: "desc" },
  });
  const inverse = direct
    ? null
    : await prisma.exchangeRate.findFirst({
        where: { userId, baseCurrency: to, quoteCurrency: from },
        orderBy: { capturedAt: "desc" },
      });
  const row = direct ?? inverse;
  if (!row)
    return {
      originalAmount: amount,
      originalCurrency: from,
      convertedAmount: null,
      targetCurrency: to,
      rate: null,
      rateAsOf: null,
      status: "MISSING",
    };

  const rate = direct ? Number(row.rate) : 1 / Number(row.rate);
  const ageHours = Math.max(
    0,
    (Date.now() - row.capturedAt.getTime()) / 3_600_000,
  );
  return {
    originalAmount: amount,
    originalCurrency: from,
    convertedAmount: amount * rate,
    targetCurrency: to,
    rate,
    rateAsOf: row.capturedAt,
    status: ageHours > staleAfterHours ? "STALE" : "FRESH",
  };
}

export async function upsertExchangeRate(
  userId: string,
  baseCurrency: string,
  quoteCurrency: string,
  rate: number,
  source: "MANUAL" | "API" | "IMPORT" = "MANUAL",
  capturedAt = new Date(),
) {
  const base = upper(baseCurrency),
    quote = upper(quoteCurrency);
  if (base === quote)
    throw new Error("Mata uang asal dan tujuan tidak boleh sama");
  if (!(rate > 0)) throw new Error("Kurs harus lebih dari 0");
  const existing = await prisma.exchangeRate.findFirst({
    where: { userId, baseCurrency: base, quoteCurrency: quote },
  });
  const data = {
    userId,
    baseCurrency: base,
    quoteCurrency: quote,
    rate,
    source,
    capturedAt,
  } as const;
  return existing
    ? prisma.exchangeRate.update({ where: { id: existing.id }, data })
    : prisma.exchangeRate.create({ data });
}
