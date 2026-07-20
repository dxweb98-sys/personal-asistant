import { z } from "zod";
export const recommendationSchema = z.object({
  monthlyIncome: z.coerce.number().positive(),
  essentialExpenses: z.coerce.number().nonnegative(),
  safetyBuffer: z.coerce.number().nonnegative().default(0),
  strategy: z.enum(["PRIORITY", "AVALANCHE", "SNOWBALL"]).default("PRIORITY"),
});
