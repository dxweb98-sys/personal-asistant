import * as A from "./telegram.v2.core.js";
const {
  Markup: r,
  Telegraf: R,
  env: M,
  prisma: b,
  debtService: p,
  financeService: y,
  investmentService: T,
  settingsService: F,
  fxProviderService: N,
  getTelegramTheme: _,
  listTelegramThemes: L,
  migrateLegacyTelegramProfiles: P,
  reportService: $,
  reportQuerySchema: D,
  buildFinancialExport: S,
  sessions: o,
  onboardingDrafts: v,
  countryCurrency: B,
  countryLabel: O,
  languageLabel: K,
  debtStatusLabel: H,
  debtPriorityLabel: Q,
  debtPolicyLabel: G,
  installmentStatusLabel: Y,
  expenseCategories: U,
  categoryLabel: V,
  html: i,
  numberValue: u,
  parseNumber: W,
  money: l,
  dateText: j,
  dateTimeText: q,
  homeKeyboard: X,
  backHome: f,
  progressBar: J,
  isActiveDebt: z,
  accountIcon: Z,
  getProfile: x,
  saveProfile: aa,
  userFor: d,
  preferenceFor: ea,
  themeKeyboard: ta,
  sendWelcome: na,
  requireOnboarding: ra,
  sendHome: ia,
  sendTransactionMenu: oa,
  sendMasterMenu: sa,
  sendAccountList: ca,
  beginAccountCreation: ua,
  showAccountPreview: da,
  resumeAfterAccount: la,
  sendDebtHub: ma,
  sendDebtList: g,
  sendDebtDetail: ba,
  sendDebtSchedule: ya,
  sendDebtHistory: pa,
  sendUpcomingDebts: Ta,
  sendDebtSummary: ka,
  beginDebtCreation: wa,
  showDebtPreview: Aa,
  beginDebtPayment: fa,
  selectDebtPaymentAccount: h,
  showDebtPaymentPreview: ga,
  sendInvestmentMenu: ha,
  sendPortfolio: I,
  sendDashboard: Ia,
  monthKey: Ca,
  shiftMonth: Ea,
  sendReportMenu: Ra,
  sendReportSummary: Ma,
  sendTransactionDetail: C,
  sendSettings: Fa,
  startIncome: Na,
  startExpense: _a,
  showExpenseAmount: La,
  showExpensePreview: Pa,
  showSimilarTransactionPreview: E,
} = A;
function $a(s) {
  (s.action(/^debtpay:amount:(custom|[0-9.]+)$/, async (a) => {
    await a.answerCbQuery();
    const e = o.get(a.chat.id);
    if (e?.kind !== "DEBT_PAYMENT_AMOUNT") return;
    if (a.match[1] === "custom") {
      await a.reply(`Ketik nominal pembayaran dalam ${i(e.debtCurrency)}.`, {
        parse_mode: "HTML",
      });
      return;
    }
    const t = Number(a.match[1]);
    t > 0 && (await h(a, { ...e, amount: t }));
  }),
    s.action(/^debtpay:account:(.+)$/, async (a) => {
      await a.answerCbQuery();
      const e = o.get(a.chat.id);
      if (e?.kind !== "DEBT_PAYMENT_ACCOUNT") return;
      const t = await d(a),
        n = await b.financialAccount.findFirst({
          where: { id: a.match[1], userId: t.id },
        });
      if (!n) return a.reply("Akun tidak ditemukan.");
      if (n.currency !== e.debtCurrency)
        return a.reply("Mata uang akun harus sama dengan mata uang utang.");
      if (u(n.currentBalance) < e.amount)
        return a.reply(
          `Saldo ${i(n.name)} belum cukup. Saldo saat ini ${i(l(u(n.currentBalance), n.currency))}.`,
          { parse_mode: "HTML" },
        );
      (o.set(a.chat.id, {
        ...e,
        kind: "DEBT_PAYMENT_NOTE",
        accountId: n.id,
        accountName: n.name,
        accountCurrency: n.currency,
      }),
        await a.reply(
          "📝 Tambahkan catatan pembayaran, atau kirim tanda <code>-</code> untuk tanpa catatan.",
          { parse_mode: "HTML" },
        ));
    }),
    s.action("debtpay:confirm", async (a) => {
      await a.answerCbQuery("Menyimpan pembayaran...");
      const e = o.get(a.chat.id);
      if (e?.kind !== "DEBT_PAYMENT_CONFIRM") return;
      const t = await d(a),
        n = `tg-debt-${a.chat.id}-${a.callbackQuery.id}`;
      try {
        const c = await p.pay(t.id, e.debtId, {
            amount: e.amount,
            paidAt: new Date(),
            source: "TELEGRAM",
            note: e.note,
            idempotencyKey: `${n}-debt`,
          }),
          m = await y.record(t.id, {
            type: "DEBT_PAYMENT",
            sourceAccountId: e.accountId,
            debtId: e.debtId,
            amount: e.amount,
            currency: e.accountCurrency,
            description: e.note || `Pembayaran ${e.debtName}`,
            referenceType: "DEBT_PAYMENT",
            referenceId: c.payment.id,
            idempotencyKey: `${n}-cashflow`,
          }),
          [k, w] = await Promise.all([
            p.find(t.id, e.debtId),
            b.financialAccount.findUnique({ where: { id: e.accountId } }),
          ]);
        (o.delete(a.chat.id),
          await a.reply(
            `✅ <b>Pembayaran berhasil dicatat</b>\n\n💳 ${i(e.debtName)}\n💸 Dibayar: <b>${i(l(e.amount, e.debtCurrency))}</b>\n🏦 Dari: <b>${i(e.accountName)}</b>\n📉 Sisa utang: <b>${i(l(u(k.remainingPrincipal), e.debtCurrency))}</b>\n💰 Saldo akun: <b>${i(l(u(w?.currentBalance), e.accountCurrency))}</b>`,
            {
              parse_mode: "HTML",
              ...r.inlineKeyboard([
                [
                  r.button.callback("👁 Detail Utang", `debt:view:${e.debtId}`),
                  r.button.callback(
                    "🧾 Detail Transaksi",
                    `transaction:view:${m.id}`,
                  ),
                ],
                [
                  r.button.callback(
                    "↩️ Batalkan Pembayaran",
                    `transaction:cancel:ask:${m.id}`,
                  ),
                ],
                [
                  r.button.callback("💸 Bayar Utang Lain", "debt:pay:list"),
                  r.button.callback("📊 Ringkasan", "debt:summary"),
                ],
                [r.button.callback("🏠 Beranda", "menu:home")],
              ]),
            },
          ));
      } catch (c) {
        await a.reply(`❌ ${i(c?.message ?? "Gagal mencatat pembayaran")}`, {
          parse_mode: "HTML",
        });
      }
    }),
    s.action(/^transaction:view:(.+)$/, async (a) => {
      (await a.answerCbQuery(), await C(a, a.match[1]));
    }),
    s.action(/^transaction:cancel:ask:(.+)$/, async (a) => {
      await a.answerCbQuery();
      const e = await d(a),
        t = await b.financialTransaction.findFirst({
          where: { id: a.match[1], userId: e.id, status: "POSTED" },
        });
      if (!t)
        return a.reply("Transaksi tidak ditemukan atau sudah dibatalkan.");
      (o.set(a.chat.id, {
        kind: "TRANSACTION_CANCEL_REASON",
        transactionId: t.id,
        transactionType: t.type,
        amount: u(t.amount),
        currency: t.currency,
      }),
        await a.reply(
          `↩️ <b>Batalkan Transaksi</b>\n\n${i(t.type)} • <b>${i(l(u(t.amount), t.currency))}</b>\n\nKetik alasan pembatalan. Saldo dan pengaruh terhadap utang akan dibalik secara otomatis.`,
          {
            parse_mode: "HTML",
            ...r.inlineKeyboard([
              [r.button.callback("❌ Tidak Jadi", "session:cancel")],
            ]),
          },
        ));
    }),
    s.action("transaction:cancel:confirm", async (a) => {
      await a.answerCbQuery("Membatalkan transaksi...");
      const e = o.get(a.chat.id);
      if (e?.kind !== "TRANSACTION_CANCEL_CONFIRM") return;
      const t = await d(a);
      try {
        const n = await y.cancelTransaction(t.id, e.transactionId, {
          reason: e.reason,
          actor: "TELEGRAM",
          idempotencyKey: `tg-void-${a.chat.id}-${a.callbackQuery.id}`,
        });
        (o.delete(a.chat.id),
          await a.reply(
            `✅ <b>Transaksi dibatalkan</b>\n\nRecord asli tetap ada dengan status VOIDED. Saldo telah dikembalikan melalui reversal <code>${i(n.reversal.id)}</code>.`,
            { parse_mode: "HTML", ...f() },
          ));
      } catch (n) {
        await a.reply(`❌ ${i(n?.message ?? "Gagal membatalkan transaksi")}`, {
          parse_mode: "HTML",
        });
      }
    }),
    s.action(/^transaction:similar:(.+)$/, async (a) => {
      await a.answerCbQuery();
      const e = await d(a),
        t = await b.financialTransaction.findFirst({
          where: { id: a.match[1], userId: e.id },
          include: { tags: !0 },
        });
      if (!t) return a.reply("Transaksi tidak ditemukan.");
      if (t.type === "DEBT_PAYMENT")
        return (
          await a.reply(
            "Untuk pembayaran utang, pilih kembali utang agar sisa kewajiban divalidasi.",
          ),
          g(a, "PAY")
        );
      const n = t.metadata ?? {};
      await E(a, {
        kind: "TRANSACTION_SIMILAR_CONFIRM",
        originalTransactionId: t.id,
        transactionType: t.type,
        categoryId: t.categoryId,
        sourceAccountId: t.sourceAccountId,
        destinationAccountId: t.destinationAccountId,
        debtId: t.debtId,
        amount: u(t.amount),
        currency: t.currency,
        description: t.description ?? "",
        tagIds: (t.tags ?? []).map((c) => c.tagId),
        fxRate: n.fxRate,
        targetAmount: n.targetAmount,
        conversionFee: n.conversionFee,
      });
    }),
    s.action("transaction:similar:amount", async (a) => {
      await a.answerCbQuery();
      const e = o.get(a.chat.id);
      e?.kind === "TRANSACTION_SIMILAR_CONFIRM" &&
        (o.set(a.chat.id, { ...e, kind: "TRANSACTION_SIMILAR_AMOUNT" }),
        await a.reply("Ketik nominal baru:", {
          ...r.inlineKeyboard([
            [r.button.callback("❌ Batal", "session:cancel")],
          ]),
        }));
    }),
    s.action("transaction:similar:note", async (a) => {
      await a.answerCbQuery();
      const e = o.get(a.chat.id);
      e?.kind === "TRANSACTION_SIMILAR_CONFIRM" &&
        (o.set(a.chat.id, { ...e, kind: "TRANSACTION_SIMILAR_NOTE" }),
        await a.reply(
          "Ketik catatan baru, atau kirim tanda - untuk tanpa catatan:",
          {
            ...r.inlineKeyboard([
              [r.button.callback("❌ Batal", "session:cancel")],
            ]),
          },
        ));
    }),
    s.action("transaction:similar:confirm", async (a) => {
      await a.answerCbQuery("Menyimpan...");
      const e = o.get(a.chat.id);
      if (e?.kind !== "TRANSACTION_SIMILAR_CONFIRM") return;
      const t = await d(a);
      try {
        const n = await y.record(t.id, {
          type: e.transactionType,
          ...(e.categoryId ? { categoryId: e.categoryId } : {}),
          ...(e.sourceAccountId ? { sourceAccountId: e.sourceAccountId } : {}),
          ...(e.destinationAccountId
            ? { destinationAccountId: e.destinationAccountId }
            : {}),
          ...(e.debtId ? { debtId: e.debtId } : {}),
          amount: e.amount,
          currency: e.currency,
          ...(e.description ? { description: e.description } : {}),
          ...(e.tagIds?.length ? { tagIds: e.tagIds } : {}),
          ...(e.fxRate ? { fxRate: u(e.fxRate) } : {}),
          ...(e.targetAmount ? { targetAmount: u(e.targetAmount) } : {}),
          ...(e.conversionFee !== void 0
            ? { conversionFee: u(e.conversionFee) }
            : {}),
          metadata: { createdFromTransactionId: e.originalTransactionId },
          idempotencyKey: `tg-similar-${a.chat.id}-${a.callbackQuery.id}`,
        });
        (o.delete(a.chat.id),
          await a.reply("✅ Transaksi serupa berhasil dibuat.", {
            ...r.inlineKeyboard([
              [r.button.callback("👁 Lihat Detail", `transaction:view:${n.id}`)],
              [r.button.callback("🏠 Beranda", "menu:home")],
            ]),
          }));
      } catch (n) {
        await a.reply(
          `❌ ${i(n?.message ?? "Gagal membuat transaksi serupa")}`,
          { parse_mode: "HTML" },
        );
      }
    }),
    s.action("investment:portfolio", async (a) => {
      (await a.answerCbQuery(), await I(a));
    }),
    s.action("platform:list", async (a) => {
      await a.answerCbQuery();
      const e = await d(a),
        n = (await T.listPlatforms(e.id)).map(
          (c, m) =>
            `${m + 1}. <b>${i(c.name)}</b>\n   ${i(c.type)}${c.accountReference ? ` • ${i(c.accountReference)}` : ""}`,
        );
      await a.reply(
        `🏦 <b>Platform Investasi</b>\n\n${n.length ? n.join("\n\n") : "Belum ada platform."}`,
        {
          parse_mode: "HTML",
          ...r.inlineKeyboard([
            [r.button.callback("➕ Tambah Platform", "platform:add:start")],
            [r.button.callback("⬅️ Menu Investasi", "menu:investment")],
          ]),
        },
      );
    }),
    s.action("platform:add:start", async (a) => {
      (await a.answerCbQuery(),
        o.set(a.chat.id, { kind: "PLATFORM_CREATE_TYPE" }),
        await a.reply("Pilih jenis platform:", {
          ...r.inlineKeyboard([
            [
              r.button.callback("📈 Broker", "platform:type:BROKER"),
              r.button.callback("🪙 Exchange", "platform:type:EXCHANGE"),
            ],
            [
              r.button.callback(
                "🥇 Penyedia Emas",
                "platform:type:GOLD_PROVIDER",
              ),
              r.button.callback("🏦 Bank", "platform:type:BANK"),
            ],
            [
              r.button.callback("👛 Wallet", "platform:type:WALLET"),
              r.button.callback("📦 Lainnya", "platform:type:OTHER"),
            ],
            [r.button.callback("❌ Batal", "session:cancel")],
          ]),
        }));
    }),
    s.action(
      /^platform:type:(BROKER|EXCHANGE|GOLD_PROVIDER|BANK|WALLET|MARKETPLACE|OTHER)$/,
      async (a) => {
        (await a.answerCbQuery(),
          o.set(a.chat.id, { kind: "PLATFORM_CREATE_NAME", type: a.match[1] }),
          await a.reply(
            "Ketik nama platform. Contoh: <b>Stockbit</b> atau <b>Binance</b>.",
            { parse_mode: "HTML" },
          ));
      },
    ),
    s.action("platform:confirm", async (a) => {
      await a.answerCbQuery("Menyimpan platform...");
      const e = o.get(a.chat.id);
      if (e?.kind !== "PLATFORM_CREATE_CONFIRM") return;
      const t = await d(a);
      try {
        const n = await T.createPlatform(t.id, {
          name: e.name,
          type: e.type,
          ...(e.accountReference
            ? { accountReference: e.accountReference }
            : {}),
          ...(e.notes ? { notes: e.notes } : {}),
        });
        (o.delete(a.chat.id),
          await a.reply(
            `✅ Platform <b>${i(n.name)}</b> berhasil ditambahkan.`,
            {
              parse_mode: "HTML",
              ...r.inlineKeyboard([
                [r.button.callback("📋 Lihat Platform", "platform:list")],
                [r.button.callback("🏠 Beranda", "menu:home")],
              ]),
            },
          ));
      } catch (n) {
        await a.reply(`❌ ${i(n?.message ?? "Gagal menambahkan platform")}`, {
          parse_mode: "HTML",
        });
      }
    }));
}
export { $a as registerTelegramHandlers2 };
