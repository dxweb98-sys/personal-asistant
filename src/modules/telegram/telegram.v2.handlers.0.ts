// @ts-nocheck
import * as core from "./telegram.v2.core.js";
const {
  Markup,
  Telegraf,
  env,
  prisma,
  debtService,
  financeService,
  investmentService,
  settingsService,
  fxProviderService,
  getTelegramTheme,
  listTelegramThemes,
  migrateLegacyTelegramProfiles,
  reportService,
  reportQuerySchema,
  buildFinancialExport,
  sessions,
  onboardingDrafts,
  countryCurrency,
  countryLabel,
  languageLabel,
  debtStatusLabel,
  debtPriorityLabel,
  debtPolicyLabel,
  installmentStatusLabel,
  expenseCategories,
  categoryLabel,
  html,
  numberValue,
  parseNumber,
  money,
  dateText,
  dateTimeText,
  homeKeyboard,
  backHome,
  progressBar,
  isActiveDebt,
  accountIcon,
  getProfile,
  saveProfile,
  userFor,
  preferenceFor,
  themeKeyboard,
  sendWelcome,
  requireOnboarding,
  sendHome,
  sendTransactionMenu,
  sendMasterMenu,
  sendAccountList,
  beginAccountCreation,
  showAccountPreview,
  resumeAfterAccount,
  sendDebtHub,
  sendDebtList,
  sendDebtDetail,
  sendDebtSchedule,
  sendDebtHistory,
  sendUpcomingDebts,
  sendDebtSummary,
  beginDebtCreation,
  showDebtPreview,
  beginDebtPayment,
  selectDebtPaymentAccount,
  showDebtPaymentPreview,
  sendInvestmentMenu,
  sendPortfolio,
  sendDashboard,
  monthKey,
  shiftMonth,
  sendReportMenu,
  sendReportSummary,
  sendTransactionDetail,
  sendSettings,
  startIncome,
  startExpense,
  showExpenseAmount,
  showExpensePreview,
  showSimilarTransactionPreview,
} = core;
export function registerTelegramHandlers0(bot: any) {
  bot.start(async (ctx) => {
    const user = await userFor(ctx);
    const pref = await preferenceFor(user.id);
    if (pref.onboardingCompleted) return sendHome(ctx);
    return sendWelcome(ctx);
  });
  bot.command("menu", (ctx) => sendHome(ctx));
  bot.command("catat", (ctx) => sendTransactionMenu(ctx));
  bot.command("hutang", (ctx) => sendDebtHub(ctx));
  bot.command("utang", (ctx) => sendDebtHub(ctx));
  bot.command("tambahutang", (ctx) => beginDebtCreation(ctx));
  bot.command("bayarutang", (ctx) => sendDebtList(ctx, "PAY"));
  bot.command("portfolio", (ctx) => sendPortfolio(ctx));
  bot.command("laporan", (ctx) => sendReportMenu(ctx));
  bot.command("settings", (ctx) => sendSettings(ctx));
  bot.command("setup", async (ctx) => {
    const user = await userFor(ctx);
    sessions.delete(ctx.chat.id);
    onboardingDrafts.delete(ctx.chat.id);
    await settingsService.update(user.id, { onboardingCompleted: false });
    await saveProfile(ctx.chat.id, { onboardingCompleted: false });
    await sendWelcome(ctx);
  });
  bot.action("onboarding:start", async (ctx) => {
    await ctx.answerCbQuery();
    onboardingDrafts.set(ctx.chat.id, {});
    await ctx.reply("🌍 Pilih negara atau wilayah utama:", {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("🇮🇩 Indonesia", "onboarding:country:ID"),
          Markup.button.callback("🇺🇸 United States", "onboarding:country:US"),
        ],
        [
          Markup.button.callback("🇸🇬 Singapore", "onboarding:country:SG"),
          Markup.button.callback("🇬🇧 United Kingdom", "onboarding:country:GB"),
        ],
        [
          Markup.button.callback("🇯🇵 Japan", "onboarding:country:JP"),
          Markup.button.callback("🇪🇺 Europe", "onboarding:country:DE"),
        ],
      ]),
    });
  });
  bot.action(/^onboarding:country:(ID|US|SG|GB|JP|DE)$/, async (ctx) => {
    const country = ctx.match[1];
    onboardingDrafts.set(ctx.chat.id, { country });
    await saveProfile(ctx.chat.id, { country });
    await ctx.answerCbQuery(countryLabel[country]);
    await ctx.reply("🗣 Pilih bahasa yang ingin digunakan:", {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🇮🇩 Bahasa Indonesia",
            "onboarding:language:id",
          ),
          Markup.button.callback("🇬🇧 English", "onboarding:language:en"),
        ],
      ]),
    });
  });
  bot.action(/^onboarding:language:(id|en)$/, async (ctx) => {
    const language = ctx.match[1];
    const draft = onboardingDrafts.get(ctx.chat.id) ?? {};
    const country = draft.country ?? "ID";
    onboardingDrafts.set(ctx.chat.id, { ...draft, language });
    await saveProfile(ctx.chat.id, { language });
    await ctx.answerCbQuery(languageLabel[language]);
    const suggested = countryCurrency[country];
    await ctx.reply("💱 Pilih mata uang utama untuk dashboard:", {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `⭐ ${suggested}`,
            `onboarding:currency:${suggested}`,
          ),
        ],
        [
          Markup.button.callback("🇮🇩 IDR", "onboarding:currency:IDR"),
          Markup.button.callback("🇺🇸 USD", "onboarding:currency:USD"),
        ],
        [
          Markup.button.callback("🇸🇬 SGD", "onboarding:currency:SGD"),
          Markup.button.callback("🇪🇺 EUR", "onboarding:currency:EUR"),
        ],
        [
          Markup.button.callback("🇯🇵 JPY", "onboarding:currency:JPY"),
          Markup.button.callback("🇬🇧 GBP", "onboarding:currency:GBP"),
        ],
      ]),
    });
  });
  bot.action(/^onboarding:currency:(IDR|USD|SGD|EUR|JPY|GBP)$/, async (ctx) => {
    const currency = ctx.match[1];
    const draft = onboardingDrafts.get(ctx.chat.id) ?? {};
    onboardingDrafts.set(ctx.chat.id, { ...draft, currency });
    await saveProfile(ctx.chat.id, { currency });
    await ctx.answerCbQuery(currency);
    await ctx.reply(
      "🎨 Pilih tema bot. Tema bisa diubah lagi dari Pengaturan:",
      {
        ...themeKeyboard("onboarding:theme"),
      },
    );
  });
  bot.action(
    /^onboarding:theme:(FRIENDLY|MOTIVATIONAL|PROFESSIONAL|MINIMAL|CALM|PLAYFUL|GAMIFIED|FINANCIAL_COACH)$/,
    async (ctx) => {
      const user = await userFor(ctx);
      const theme = ctx.match[1];
      const draft = onboardingDrafts.get(ctx.chat.id) ?? {};
      const country = draft.country ?? "ID";
      const language = draft.language ?? "id";
      const currency = draft.currency ?? countryCurrency[country];
      await settingsService.update(user.id, {
        telegramTheme: theme,
        baseCurrency: currency,
      });
      await saveProfile(ctx.chat.id, { country, language, currency, theme });
      onboardingDrafts.delete(ctx.chat.id);
      await ctx.answerCbQuery("Tema disimpan");
      const accounts = await financeService.listAccounts(user.id);
      if (!accounts.length) {
        await ctx.reply(
          "✅ Preferensi dasar tersimpan. Langkah terakhir: buat akun keuangan pertama agar transaksi dapat dicatat.",
        );
        await beginAccountCreation(ctx, { kind: "ONBOARDING" });
        return;
      }
      await settingsService.update(user.id, { onboardingCompleted: true });
      await saveProfile(ctx.chat.id, { onboardingCompleted: true });
      await ctx.reply(
        "✅ Konfigurasi selesai. Semua menu sekarang siap digunakan.",
      );
      await sendHome(ctx);
    },
  );
  bot.action("menu:home", async (ctx) => {
    await ctx.answerCbQuery();
    await sendHome(ctx, true);
  });
  bot.action("menu:transactions", async (ctx) => {
    await ctx.answerCbQuery();
    await sendTransactionMenu(ctx);
  });
  bot.action("menu:debt", async (ctx) => {
    await ctx.answerCbQuery();
    await sendDebtHub(ctx);
  });
  bot.action("menu:dashboard", async (ctx) => {
    await ctx.answerCbQuery();
    await sendDashboard(ctx);
  });
  bot.action("menu:reports", async (ctx) => {
    await ctx.answerCbQuery();
    await sendReportMenu(ctx);
  });
  bot.action(
    /^report:preset:(TODAY|THIS_WEEK|THIS_MONTH|PREVIOUS_MONTH|THIS_YEAR|ALL)$/,
    async (ctx) => {
      await ctx.answerCbQuery();
      await sendReportSummary(ctx, { preset: ctx.match[1] });
    },
  );
  bot.action(/^report:month:(\d{4}-\d{2})$/, async (ctx) => {
    await ctx.answerCbQuery();
    await sendReportSummary(ctx, { preset: "MONTH", month: ctx.match[1] });
  });
  bot.action(
    /^report:export:(TODAY|THIS_WEEK|THIS_MONTH|PREVIOUS_MONTH|THIS_YEAR|ALL|MONTH):(pdf|xlsx|csv):(.+)$/,
    async (ctx) => {
      await ctx.answerCbQuery("Membuat laporan...");
      const user = await userFor(ctx);
      const preset = ctx.match[1];
      const format = ctx.match[2];
      const month = ctx.match[3] === "-" ? void 0 : ctx.match[3];
      const query = reportQuerySchema.parse({
        preset: month ? "MONTH" : preset,
        ...(month ? { month } : {}),
        grouping:
          preset === "THIS_YEAR" ? "MONTH" : preset === "ALL" ? "YEAR" : "NONE",
        page: 1,
        limit: 100,
      });
      try {
        const file = await buildFinancialExport(user.id, query, format);
        await ctx.replyWithDocument({
          source: file.buffer,
          filename: file.filename,
        });
      } catch (error) {
        await ctx.reply(
          `❌ ${html(error?.message ?? "Gagal membuat laporan")}`,
          { parse_mode: "HTML" },
        );
      }
    },
  );
  bot.action("menu:investment", async (ctx) => {
    await ctx.answerCbQuery();
    await sendInvestmentMenu(ctx);
  });
  bot.action("menu:master", async (ctx) => {
    await ctx.answerCbQuery();
    await sendMasterMenu(ctx);
  });
  bot.action("menu:settings", async (ctx) => {
    await ctx.answerCbQuery();
    await sendSettings(ctx);
  });
  bot.action("menu:help", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `❓ <b>Bantuan</b>\n\n• Gunakan <b>Catat Transaksi</b> untuk pemasukan dan pengeluaran.\n• Gunakan <b>Utang &amp; Tagihan</b> untuk menambah, melihat, dan membayar utang.\n• Gunakan <b>Data &amp; Master</b> untuk membuat akun, utang, instrumen, dan platform.\n• Gunakan <b>Investasi</b> untuk portfolio dan update harga.`,
      { parse_mode: "HTML", ...backHome() },
    );
  });
  bot.action("accounts:list", async (ctx) => {
    await ctx.answerCbQuery();
    await sendAccountList(ctx);
  });
  bot.action(/^account:view:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const user = await userFor(ctx);
    const account = await prisma.financialAccount.findFirst({
      where: { id: ctx.match[1], userId: user.id },
    });
    if (!account) return ctx.reply("Akun tidak ditemukan.");
    await ctx.reply(
      `${accountIcon(account.type)} <b>${html(account.name)}</b>\n\nJenis: <b>${html(account.type)}</b>\nStatus: <b>${html(account.status ?? (account.isActive ? "ACTIVE" : "ARCHIVED"))}</b>\nMata uang: <b>${html(account.currency)}</b>\nSaldo awal: <b>${html(money(numberValue(account.openingBalance), account.currency))}</b>\nSaldo saat ini: <b>${html(money(numberValue(account.currentBalance), account.currency))}</b>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          ...(!account.isSystem && account.isActive
            ? [
                [
                  Markup.button.callback(
                    "🗄 Arsipkan Account",
                    `account:archive:start:${account.id}`,
                  ),
                ],
              ]
            : []),
          ...(!account.isSystem && !account.isActive
            ? [
                [
                  Markup.button.callback(
                    "♻️ Pulihkan Account",
                    `account:restore:${account.id}`,
                  ),
                ],
              ]
            : []),
          [Markup.button.callback("🏠 Beranda", "menu:home")],
        ]),
      },
    );
  });
  bot.action(/^account:archive:start:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const user = await userFor(ctx);
    const account = await financeService.findAccount(user.id, ctx.match[1]);
    const balance = numberValue(account.currentBalance);
    if (balance === 0) {
      sessions.set(ctx.chat.id, {
        kind: "ACCOUNT_ARCHIVE_CONFIRM",
        accountId: account.id,
        accountName: account.name,
      });
      await ctx.reply(
        `🗄 Arsipkan <b>${html(account.name)}</b>? Histori tetap tersedia dan account dapat dipulihkan.`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Arsipkan", "account:archive:confirm")],
            [Markup.button.callback("❌ Batal", "session:cancel")],
          ]),
        },
      );
      return;
    }
    const targets = await financeService.recommendArchiveTargets(
      user.id,
      account.id,
    );
    const sameCurrency = targets
      .filter((target) => target.account.currency === account.currency)
      .slice(0, 6);
    const rows = sameCurrency.map((target) => [
      Markup.button.callback(
        `➡️ ${target.account.name}`,
        `account:archive:target:${account.id}:${target.account.id}`,
      ),
    ]);
    rows.push([
      Markup.button.callback(
        "📦 Dana Belum Dialokasikan",
        `account:archive:unallocated:${account.id}`,
      ),
    ]);
    rows.push([Markup.button.callback("❌ Batal", "session:cancel")]);
    await ctx.reply(
      `⚠️ <b>Account masih memiliki saldo</b>\n\n${html(account.name)}: <b>${html(money(balance, account.currency))}</b>\n\nPilih tujuan pemindahan saldo. Dana Belum Dialokasikan tetap dihitung sebagai bagian dari kekayaanmu.`,
      { parse_mode: "HTML", ...Markup.inlineKeyboard(rows) },
    );
  });
  bot.action(/^account:archive:target:([^:]+):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const user = await userFor(ctx);
    const [account, target] = await Promise.all([
      financeService.findAccount(user.id, ctx.match[1]),
      financeService.findAccount(user.id, ctx.match[2]),
    ]);
    sessions.set(ctx.chat.id, {
      kind: "ACCOUNT_ARCHIVE_CONFIRM",
      accountId: account.id,
      accountName: account.name,
      targetAccountId: target.id,
      targetAccountName: target.name,
    });
    await ctx.reply(
      `Pindahkan saldo <b>${html(account.name)}</b> ke <b>${html(target.name)}</b>, lalu arsipkan account?`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Pindahkan & Arsipkan",
              "account:archive:confirm",
            ),
          ],
          [Markup.button.callback("❌ Batal", "session:cancel")],
        ]),
      },
    );
  });
  bot.action(/^account:archive:unallocated:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const user = await userFor(ctx);
    const account = await financeService.findAccount(user.id, ctx.match[1]);
    sessions.set(ctx.chat.id, {
      kind: "ACCOUNT_ARCHIVE_CONFIRM",
      accountId: account.id,
      accountName: account.name,
      useUnallocatedFunds: true,
    });
    await ctx.reply(
      `Pindahkan saldo <b>${html(account.name)}</b> ke Dana Belum Dialokasikan, lalu arsipkan account?`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Pindahkan & Arsipkan",
              "account:archive:confirm",
            ),
          ],
          [Markup.button.callback("❌ Batal", "session:cancel")],
        ]),
      },
    );
  });
  bot.action("account:archive:confirm", async (ctx) => {
    await ctx.answerCbQuery("Memproses...");
    const state = sessions.get(ctx.chat.id);
    if (state?.kind !== "ACCOUNT_ARCHIVE_CONFIRM") return;
    const user = await userFor(ctx);
    try {
      await financeService.archiveAccount(user.id, state.accountId, {
        ...(state.targetAccountId
          ? { targetAccountId: state.targetAccountId }
          : {}),
        useUnallocatedFunds: Boolean(state.useUnallocatedFunds),
        reason: "Diarsipkan melalui Telegram",
        idempotencyKey: `tg-archive-${ctx.chat.id}-${ctx.callbackQuery.id}`,
      });
      sessions.delete(ctx.chat.id);
      await ctx.reply(
        `✅ Account <b>${html(state.accountName)}</b> berhasil diarsipkan. Histori tetap tersedia.`,
        { parse_mode: "HTML", ...backHome() },
      );
    } catch (error) {
      await ctx.reply(
        `❌ ${html(error?.message ?? "Gagal mengarsipkan account")}`,
        { parse_mode: "HTML" },
      );
    }
  });
}
