import { z } from "zod";

export const reportQuerySchema = z.object({
  preset: z
    .enum([
      "TODAY",
      "DAY",
      "THIS_WEEK",
      "WEEK",
      "THIS_MONTH",
      "PREVIOUS_MONTH",
      "MONTH",
      "THIS_YEAR",
      "YEAR",
      "CUSTOM",
      "ALL",
    ])
    .default("THIS_MONTH"),
  date: z.coerce.date().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  year: z.coerce.number().int().min(1970).max(2200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  grouping: z.enum(["NONE", "DAY", "WEEK", "MONTH", "YEAR"]).default("NONE"),
  accountIds: z.array(z.string().uuid()).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  types: z
    .array(
      z.enum([
        "INCOME",
        "EXPENSE",
        "TRANSFER",
        "INVESTMENT_BUY",
        "INVESTMENT_SELL",
        "DIVIDEND",
        "DEBT_PAYMENT",
        "ADJUSTMENT",
      ]),
    )
    .optional(),
  statuses: z.array(z.enum(["POSTED", "VOIDED", "REVERSAL"])).optional(),
  includeCancelled: z.coerce.boolean().default(false),
  includeArchivedAccounts: z.coerce.boolean().default(false),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(30),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
