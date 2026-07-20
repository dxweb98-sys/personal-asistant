import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../common/http-error.js";
import type { z } from "zod";
import {
  platformSchema,
  instrumentSchema,
  tradeSchema,
  priceSchema,
  dividendSchema,
} from "./investment.schema.js";
import { settingsService } from "../settings/settings.service.js";
import { convertCurrency } from "../../common/fx.js";

type PL = z.infer<typeof platformSchema>;
type I = z.infer<typeof instrumentSchema>;
type T = z.infer<typeof tradeSchema>;
type P = z.infer<typeof priceSchema>;
type D = z.infer<typeof dividendSchema>;
const ageHours = (d: Date) =>
  Math.max(0, (Date.now() - d.getTime()) / 3_600_000);

export const investmentService = {
  createPlatform: (userId: string, input: PL) =>
    prisma.investmentPlatform.create({ data: { ...input, userId } }),
  listPlatforms: (userId: string) =>
    prisma.investmentPlatform.findMany({
      where: { userId, isActive: true },
      orderBy: { name: "asc" },
    }),
  createInstrument: (userId: string, input: I) =>
    prisma.investmentInstrument.create({
      data: { ...input, currency: input.currency.toUpperCase(), userId },
    }),
  listInstruments: (userId: string) =>
    prisma.investmentInstrument.findMany({
      where: { userId },
      include: { marketPrices: { orderBy: { capturedAt: "desc" }, take: 1 } },
      orderBy: [{ type: "asc" }, { symbol: "asc" }],
    }),
  async trade(userId: string, input: T) {
    return prisma.$transaction(async (tx: any) => {
      const ins = await tx.investmentInstrument.findFirst({
        where: { id: input.instrumentId, userId },
      });
      const account = await tx.financialAccount.findFirst({
        where: { id: input.accountId, userId },
      });
      const platform = input.platformId
        ? await tx.investmentPlatform.findFirst({
            where: { id: input.platformId, userId, isActive: true },
          })
        : null;
      if (!ins || !account)
        throw new HttpError(404, "Instrumen atau akun tidak ditemukan");
      if (input.platformId && !platform)
        throw new HttpError(404, "Platform investasi tidak ditemukan");
      const priceCurrency = (input.priceCurrency ?? ins.currency).toUpperCase();
      const settlementCurrency = account.currency.toUpperCase();
      let fxRate = input.fxRateToSettlement;
      if (priceCurrency === settlementCurrency) fxRate = 1;
      if (!fxRate) {
        const cv = await convertCurrency(
          userId,
          1,
          priceCurrency,
          settlementCurrency,
        );
        if (cv.convertedAmount === null)
          throw new HttpError(
            400,
            `Kurs ${priceCurrency}/${settlementCurrency} belum tersedia. Tambahkan kurs melalui Telegram.`,
          );
        fxRate = cv.rate!;
      }
      const grossNative = input.quantity * input.pricePerUnit;
      const settlementAmount =
        grossNative * fxRate + (input.type === "BUY" ? input.fee : -input.fee);
      if (
        input.type === "BUY" &&
        Number(account.currentBalance) < settlementAmount
      )
        throw new HttpError(400, "Saldo akun tidak mencukupi");
      await tx.financialAccount.update({
        where: { id: account.id },
        data: {
          currentBalance:
            input.type === "BUY"
              ? { decrement: settlementAmount }
              : { increment: settlementAmount },
        },
      });
      return tx.investmentTrade.create({
        data: {
          instrumentId: input.instrumentId,
          accountId: input.accountId,
          platformId: input.platformId,
          type: input.type,
          quantity: input.quantity,
          pricePerUnit: input.pricePerUnit,
          fee: input.fee,
          priceCurrency,
          settlementCurrency,
          fxRateToSettlement: fxRate,
          settlementAmount,
          userId,
          tradedAt: input.tradedAt ?? new Date(),
          notes: input.notes,
        },
        include: { instrument: true, account: true, platform: true },
      });
    });
  },
  addPrice: async (userId: string, input: P) => {
    const ins = await prisma.investmentInstrument.findFirst({
      where: { id: input.instrumentId, userId },
    });
    if (!ins) throw new HttpError(404, "Instrumen tidak ditemukan");
    const pref = await settingsService.get(userId);
    const data = {
      ...input,
      currency: (input.currency ?? ins.currency).toUpperCase(),
      userId,
      capturedAt: input.capturedAt ?? new Date(),
    };
    if (pref.priceStorageMode === "LATEST_ONLY") {
      const latest = await prisma.marketPrice.findFirst({
        where: { userId, instrumentId: input.instrumentId },
        orderBy: { capturedAt: "desc" },
      });
      if (latest)
        return prisma.marketPrice.update({ where: { id: latest.id }, data });
    }
    return prisma.marketPrice.create({ data });
  },
  async addDividend(userId: string, input: D) {
    return prisma.$transaction(async (tx: any) => {
      const ins = await tx.investmentInstrument.findFirst({
        where: { id: input.instrumentId, userId },
      });
      const acc = await tx.financialAccount.findFirst({
        where: { id: input.accountId, userId },
      });
      if (!ins || !acc)
        throw new HttpError(404, "Instrumen atau akun tidak ditemukan");
      const currency = (input.currency ?? ins.currency).toUpperCase();
      let credited = input.amount;
      if (currency !== acc.currency) {
        const cv = await convertCurrency(
          userId,
          input.amount,
          currency,
          acc.currency,
        );
        if (cv.convertedAmount === null)
          throw new HttpError(
            400,
            `Kurs ${currency}/${acc.currency} belum tersedia`,
          );
        credited = cv.convertedAmount;
      }
      await tx.financialAccount.update({
        where: { id: acc.id },
        data: { currentBalance: { increment: credited } },
      });
      return tx.dividendIncome.create({
        data: {
          ...input,
          currency,
          userId,
          receivedAt: input.receivedAt ?? new Date(),
        },
        include: { instrument: true, account: true, platform: true },
      });
    });
  },
  async portfolio(userId: string) {
    const pref = await settingsService.get(userId);
    const displayCurrency = pref.baseCurrency;
    const instruments = await prisma.investmentInstrument.findMany({
      where: { userId },
      include: {
        trades: { orderBy: { tradedAt: "asc" }, include: { platform: true } },
        marketPrices: { orderBy: { capturedAt: "desc" }, take: 1 },
        dividends: { include: { platform: true } },
      },
    });
    let confirmedMarketValue = 0,
      estimatedMarketValue = 0,
      recordedCost = 0,
      unpricedCost = 0,
      totalRealizedProfit = 0,
      totalDividend = 0;
    const missingCurrencies = new Set<string>();
    const items = [] as any[];
    for (const ins of instruments) {
      let qty = 0,
        costNative = 0,
        realizedNative = 0;
      const platforms = new Map<
        string,
        { name: string; quantity: number; cost: number }
      >();
      for (const t of ins.trades) {
        const q = Number(t.quantity),
          price = Number(t.pricePerUnit),
          fee = Number(t.fee),
          rate = Number(t.fxRateToSettlement || 1);
        const nativeFee = fee / rate;
        const key = t.platform?.name ?? "Tanpa platform";
        const pf = platforms.get(key) ?? { name: key, quantity: 0, cost: 0 };
        if (t.type === "BUY") {
          qty += q;
          costNative += q * price + nativeFee;
          pf.quantity += q;
          pf.cost += q * price + nativeFee;
        } else {
          if (q > qty + 1e-8)
            throw new HttpError(
              409,
              `Riwayat ${ins.symbol} memiliki penjualan melebihi kepemilikan`,
            );
          const avg = qty ? costNative / qty : 0;
          realizedNative += q * price - nativeFee - q * avg;
          qty -= q;
          costNative -= q * avg;
          pf.quantity -= q;
          pf.cost -= q * avg;
        }
        platforms.set(key, pf);
      }
      const latest = ins.marketPrices[0];
      const pAge = latest ? ageHours(latest.capturedAt) : null;
      const stale = latest ? pAge! > ins.staleAfterHours : false;
      const status = !latest
        ? qty > 0
          ? "PURCHASE_PRICE_ONLY"
          : "UNPRICED"
        : stale
          ? "STALE_PRICE"
          : latest.source === "API"
            ? "MARKET_PRICE"
            : "MANUAL_PRICE";
      const currentPrice = latest ? Number(latest.price) : null;
      const marketValueNative =
        currentPrice === null ? null : qty * currentPrice;
      const costCv = await convertCurrency(
        userId,
        costNative,
        ins.currency,
        displayCurrency,
        pref.fxStaleHours,
      );
      const marketCv =
        marketValueNative === null
          ? null
          : await convertCurrency(
              userId,
              marketValueNative,
              latest?.currency ?? ins.currency,
              displayCurrency,
              pref.fxStaleHours,
            );
      const realizedCv = await convertCurrency(
        userId,
        realizedNative,
        ins.currency,
        displayCurrency,
        pref.fxStaleHours,
      );
      const dividendNative = ins.dividends.reduce(
        (s: number, d: any) => s + Number(d.amount),
        0,
      );
      const dividendCv = await convertCurrency(
        userId,
        dividendNative,
        ins.currency,
        displayCurrency,
        pref.fxStaleHours,
      );
      if (costCv.convertedAmount === null) missingCurrencies.add(ins.currency);
      if (marketCv?.convertedAmount === null)
        missingCurrencies.add(latest?.currency ?? ins.currency);
      const cost = costCv.convertedAmount;
      const market = marketCv?.convertedAmount ?? null;
      const unrealized =
        market === null || cost === null ? null : market - cost;
      const unrealizedPercent =
        unrealized === null || !cost ? null : (unrealized / cost) * 100;
      if (cost !== null) recordedCost += cost;
      if (realizedCv.convertedAmount !== null)
        totalRealizedProfit += realizedCv.convertedAmount;
      if (dividendCv.convertedAmount !== null)
        totalDividend += dividendCv.convertedAmount;
      if (status === "PURCHASE_PRICE_ONLY" || status === "UNPRICED") {
        if (cost !== null) unpricedCost += cost;
      } else if (status === "STALE_PRICE" || marketCv?.status === "STALE") {
        if (market !== null) estimatedMarketValue += market;
      } else if (market !== null) confirmedMarketValue += market;
      items.push({
        instrumentId: ins.id,
        type: ins.type,
        symbol: ins.symbol,
        name: ins.name,
        exchange: ins.exchange,
        nativeCurrency: ins.currency,
        displayCurrency,
        quantity: qty,
        unitsPerLot: Number(ins.unitsPerLot),
        averageBuyPriceNative: qty ? costNative / qty : 0,
        costBasisNative: costNative,
        costBasis: cost,
        currentPriceNative: currentPrice,
        marketValueNative,
        marketValue: market,
        valuationStatus: status,
        liquidityLevel: ins.liquidityLevel,
        priceSource: latest?.source ?? null,
        priceCurrency: latest?.currency ?? ins.currency,
        priceCapturedAt: latest?.capturedAt ?? null,
        priceAgeHours: pAge,
        staleAfterHours: ins.staleAfterHours,
        fxStatus: marketCv?.status ?? costCv.status,
        fxRate: marketCv?.rate ?? costCv.rate,
        unrealizedProfit: unrealized,
        unrealizedPercent,
        realizedProfit: realizedCv.convertedAmount,
        totalDividend: dividendCv.convertedAmount,
        platforms: [...platforms.values()].filter(
          (x: any) => Math.abs(x.quantity) > 1e-8,
        ),
      });
    }
    return {
      asOf: new Date(),
      displayCurrency,
      confirmedMarketValue,
      estimatedMarketValue,
      knownMarketValue: confirmedMarketValue + estimatedMarketValue,
      recordedCost,
      unpricedInvestmentCost: unpricedCost,
      totalUnrealizedProfit:
        confirmedMarketValue +
        estimatedMarketValue -
        (recordedCost - unpricedCost),
      totalRealizedProfit,
      totalDividend,
      missingCurrencies: [...missingCurrencies],
      items,
    };
  },
};
