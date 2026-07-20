import { z } from "zod";

export const platformSchema = z.object({
  name: z.string().min(2),
  type: z.enum([
    "BROKER",
    "EXCHANGE",
    "GOLD_PROVIDER",
    "BANK",
    "WALLET",
    "MARKETPLACE",
    "OTHER",
  ]),
  accountReference: z.string().optional(),
  website: z.string().url().optional(),
  notes: z.string().optional(),
});

export const instrumentSchema = z.object({
  type: z.enum([
    "STOCK",
    "CRYPTO",
    "GOLD",
    "MUTUAL_FUND",
    "DEPOSIT",
    "PROPERTY",
    "OTHER",
  ]),
  symbol: z
    .string()
    .min(1)
    .transform((value) => value.toUpperCase()),
  name: z.string().min(2),
  exchange: z.string().optional(),
  currency: z.string().default("IDR"),
  unitName: z.string().default("unit"),
  unitsPerLot: z.coerce.number().positive().default(1),
  liquidityLevel: z
    .enum(["INSTANT", "HIGH", "MEDIUM", "LOW", "LOCKED"])
    .default("MEDIUM"),
  staleAfterHours: z.coerce.number().int().positive().default(24),
});

export const tradeSchema = z.object({
  instrumentId: z.string().uuid(),
  accountId: z.string().uuid(),
  platformId: z.string().uuid().optional(),
  type: z.enum(["BUY", "SELL"]),
  quantity: z.coerce.number().positive(),
  pricePerUnit: z.coerce.number().positive(),
  fee: z.coerce.number().min(0).default(0),
  priceCurrency: z.string().optional(),
  fxRateToSettlement: z.coerce.number().positive().optional(),
  tradedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export const priceSchema = z.object({
  instrumentId: z.string().uuid(),
  price: z.coerce.number().positive(),
  currency: z.string().default("IDR"),
  source: z.enum(["MANUAL", "API", "IMPORT"]).default("MANUAL"),
  capturedAt: z.coerce.date().optional(),
});

export const dividendSchema = z.object({
  instrumentId: z.string().uuid(),
  accountId: z.string().uuid(),
  platformId: z.string().uuid().optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().optional(),
  quantitySnapshot: z.coerce.number().positive().optional(),
  amountPerUnit: z.coerce.number().positive().optional(),
  receivedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});
