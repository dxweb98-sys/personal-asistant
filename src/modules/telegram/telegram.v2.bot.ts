// @ts-nocheck
import * as core from "./telegram.v2.core.js";
import { registerTelegramHandlers0 } from "./telegram.v2.handlers.0.js";
import { registerTelegramHandlers1 } from "./telegram.v2.handlers.1.js";
import { registerTelegramHandlers2 } from "./telegram.v2.handlers.2.js";
import { registerTelegramHandlers3 } from "./telegram.v2.handlers.3.js";
import { registerTelegramHandlers4 } from "./telegram.v2.handlers.4.js";
const { Markup, Telegraf, env, prisma, debtService, financeService, investmentService, settingsService, fxProviderService, getTelegramTheme, listTelegramThemes, migrateLegacyTelegramProfiles, reportService, reportQuerySchema, buildFinancialExport, sessions, onboardingDrafts, countryCurrency, countryLabel, languageLabel, debtStatusLabel, debtPriorityLabel, debtPolicyLabel, installmentStatusLabel, expenseCategories, categoryLabel, html, numberValue, parseNumber, money, dateText, dateTimeText, homeKeyboard, backHome, progressBar, isActiveDebt, accountIcon, getProfile, saveProfile, userFor, preferenceFor, themeKeyboard, sendWelcome, requireOnboarding, sendHome, sendTransactionMenu, sendMasterMenu, sendAccountList, beginAccountCreation, showAccountPreview, resumeAfterAccount, sendDebtHub, sendDebtList, sendDebtDetail, sendDebtSchedule, sendDebtHistory, sendUpcomingDebts, sendDebtSummary, beginDebtCreation, showDebtPreview, beginDebtPayment, selectDebtPaymentAccount, showDebtPaymentPreview, sendInvestmentMenu, sendPortfolio, sendDashboard, monthKey, shiftMonth, sendReportMenu, sendReportSummary, sendTransactionDetail, sendSettings, startIncome, startExpense, showExpenseAmount, showExpensePreview, showSimilarTransactionPreview } = core;
let bot: any = null;

export async function startTelegramBot() {
  if (!env.TELEGRAM_ENABLED || !env.TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot disabled");
    return;
  }
  const migration = await migrateLegacyTelegramProfiles();
  if (migration.migrated > 0) {
    console.log(`Migrated ${migration.migrated} legacy Telegram profile(s) to PostgreSQL`);
  }
  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
  bot.use(async (ctx, next) => {
    const callbackId = ctx.callbackQuery?.id;
    if (!callbackId) return next();
    const user = await userFor(ctx);
    const accepted = await settingsService.markTelegramCallbackProcessed(
      user.id,
      callbackId,
      ctx.callbackQuery?.data ?? "UNKNOWN"
    );
    if (!accepted) {
      await ctx.answerCbQuery("Permintaan ini sudah diproses").catch(() => void 0);
      return;
    }
    await next();
  });
  await bot.telegram.setMyCommands([
    { command: "menu", description: "Buka menu utama" },
    { command: "catat", description: "Catat transaksi" },
    { command: "hutang", description: "Kelola utang dan tagihan" },
    { command: "tambahutang", description: "Tambah utang baru" },
    { command: "bayarutang", description: "Catat pembayaran utang" },
    { command: "portfolio", description: "Lihat portfolio investasi" },
    { command: "laporan", description: "Buka laporan keuangan" },
    { command: "settings", description: "Buka pengaturan" },
    { command: "setup", description: "Ulangi konfigurasi awal" }
  ]);
  registerTelegramHandlers0(bot);
  registerTelegramHandlers1(bot);
  registerTelegramHandlers2(bot);
  registerTelegramHandlers3(bot);
  registerTelegramHandlers4(bot);
  bot.catch((error) => console.error("Telegram bot error", error));
  await bot.launch();
  console.log("Telegram bot started (structured interactive UI)");
}

export async function stopTelegramBot() {
  if (bot) bot.stop();
}
