import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Markup, Telegraf } from "telegraf";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { debtService } from "../debts/debt.service.js";
import { financeService } from "../finance/finance.service.js";
import { investmentService } from "../investments/investment.service.js";
import { settingsService } from "../settings/settings.service.js";
import { fxProviderService } from "../