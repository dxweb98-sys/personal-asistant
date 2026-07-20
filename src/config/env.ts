import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DEFAULT_USER_ID: z
    .string()
    .uuid()
    .default("11111111-1111-4111-8111-111111111111"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ENABLED: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
});

export const env = envSchema.parse(process.env);
