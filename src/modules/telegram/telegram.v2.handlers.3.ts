import * as w from "./telegram.v2.core.js";
const {
  Markup: a,
  Telegraf: D,
  env: k,
  prisma: g,
  debtService: F,
  financeService: S,
  investmentService: d,
  settingsService: b,
  fxProviderService: h,
  getTelegramTheme: I,
  listTelegramThemes: R,
  migrateLegacyTelegramProfiles: M,
  reportService: A,
  reportQuerySchema: L,
  buildFinancialExport: f,
  sessions: o,
  onboardingDrafts: O,
  countryCurrency: U,
  countryLabel: v,
  languageLabel: N,
  debtStatusLabel: $,
  debtPriorityLabel: K,
  debtPolicyLabel: _,
  installmentStatusLabel: H,
  expenseCategories: Y,
  categoryLabel: B,
  html: s,
  numberValue: Q,
  parseNumber: G,
  money: J,
  dateText: j,
  dateTimeText: q,
  homeKeyboard: V,
  backHome: C,
  progressBar: W,
  isActiveDebt: z,
  accountIcon: X,
  getProfile: Z,
  saveProfile: m,
  userFor: c,
  preferenceFor: y,
  themeKeyboard: T,
  sendWelcome: E,
  requireOnboarding: x,
  sendHome: P,
  sendTransactionMenu: ee,
  sendMasterMenu: ae,
  sendAccountList: te,
  beginAccountCreation: ne,
  showAccountPreview: re,
  resumeAfterAccount: ie,
  sendDebtHub: se,
  sendDebtList: ue,
  sendDebtDetail: oe,
  sendDebtSchedule: ce,
  sendDebtHistory: le,
  sendUpcomingDebts: be,
  sendDebtSummary: me,
  beginDebtCreation: de,
  showDebtPreview: ye,
  beginDebtPayment: pe,
  selectDebtPaymentAccount: we,
  showDebtPaymentPreview: ge,
  sendInvestmentMenu: he,
  sendPortfolio: Ce,
  sendDashboard: Te,
  monthKey: Ee,
  shiftMonth: Pe,
  sendReportMenu: De,
  sendReportSummary: ke,
  sendTransactionDetail: Fe,
  sendSettings: p,
  startIncome: Se,
  startExpense: Ie,
  showExpenseAmount: Re,
  showExpensePreview: Me,
  showSimilarTransactionPreview: Ae,
} = w;
function Le(r) {
  (r.action("instrument:add:start", async (e) => {
    (await e.answerCbQuery(),
      o.set(e.chat.id, { kind: "INSTRUMENT_CREATE_TYPE" }),
      await e.reply("Pilih jenis investasi:", {
        ...a.inlineKeyboard([
          [
            a.button.callback("📈 Saham", "instrument:type:STOCK"),
            a.button.callback("🪙 Crypto", "instrument:type:CRYPTO"),
          ],
          [
            a.button.callback("🥇 Emas", "instrument:type:GOLD"),
            a.button.callback("📊 Reksa Dana", "instrument:type:MUTUAL_FUND"),
          ],
          [
            a.button.callback("🏦 Deposito", "instrument:type:DEPOSIT"),
            a.button.callback("🏠 Properti", "instrument:type:PROPERTY"),
          ],
          [a.button.callback("📦 Lainnya", "instrument:type:OTHER")],
          [a.button.callback("❌ Batal", "session:cancel")],
        ]),
      }));
  }),
    r.action(
      /^instrument:type:(STOCK|CRYPTO|GOLD|MUTUAL_FUND|DEPOSIT|PROPERTY|OTHER)$/,
      async (e) => {
        (await e.answerCbQuery(),
          o.set(e.chat.id, {
            kind: "INSTRUMENT_CREATE_SYMBOL",
            type: e.match[1],
          }),
          await e.reply(
            "Ketik kode atau simbol. Contoh: <b>BBCA</b>, <b>BTC</b>, atau <b>GOLD-IDR</b>.",
            { parse_mode: "HTML" },
          ));
      },
    ),
    r.action(
      /^instrument:currency:(IDR|USD|SGD|EUR|JPY|GBP|USDT)$/,
      async (e) => {
        await e.answerCbQuery();
        const t = o.get(e.chat.id);
        if (t?.kind !== "INSTRUMENT_CREATE_CURRENCY") return;
        const n = {
          ...t,
          kind: "INSTRUMENT_CREATE_CONFIRM",
          currency: e.match[1],
        };
        (o.set(e.chat.id, n),
          await e.reply(
            `🔎 <b>Periksa Instrumen</b>\n\nKode: <b>${s(n.symbol)}</b>\nNama: <b>${s(n.name)}</b>\nJenis: <b>${s(n.type)}</b>\nMata uang: <b>${s(n.currency)}</b>`,
            {
              parse_mode: "HTML",
              ...a.inlineKeyboard([
                [
                  a.button.callback(
                    "✅ Simpan Instrumen",
                    "instrument:confirm",
                  ),
                ],
                [a.button.callback("❌ Batal", "session:cancel")],
              ]),
            },
          ));
      },
    ),
    r.action("instrument:confirm", async (e) => {
      await e.answerCbQuery("Menyimpan instrumen...");
      const t = o.get(e.chat.id);
      if (t?.kind !== "INSTRUMENT_CREATE_CONFIRM") return;
      const n = await c(e),
        i = t.type,
        l = await d.createInstrument(n.id, {
          symbol: String(t.symbol).toUpperCase(),
          name: t.name,
          type: i,
          currency: t.currency,
          unitName: i === "STOCK" ? "share" : i === "GOLD" ? "gram" : "unit",
          unitsPerLot: i === "STOCK" ? 100 : 1,
          liquidityLevel:
            i === "STOCK" || i === "CRYPTO"
              ? "HIGH"
              : i === "PROPERTY"
                ? "LOW"
                : "MEDIUM",
          staleAfterHours: i === "CRYPTO" ? 6 : 24,
        });
      (o.delete(e.chat.id),
        await e.reply(
          `✅ Instrumen <b>${s(l.symbol)}</b> berhasil ditambahkan. Harga beli belum dianggap sebagai nilai pasar sampai harga terbaru diperbarui.`,
          {
            parse_mode: "HTML",
            ...a.inlineKeyboard([
              [a.button.callback("📊 Lihat Portfolio", "investment:portfolio")],
              [a.button.callback("🏠 Beranda", "menu:home")],
            ]),
          },
        ));
    }),
    r.action("price:list", async (e) => {
      await e.answerCbQuery();
      const t = await c(e),
        n = await d.listInstruments(t.id);
      if (!n.length) {
        await e.reply("Belum ada instrumen investasi.", {
          ...a.inlineKeyboard([
            [a.button.callback("➕ Tambah Instrumen", "instrument:add:start")],
          ]),
        });
        return;
      }
      await e.reply("Pilih aset yang ingin diperbarui harganya:", {
        ...a.inlineKeyboard([
          ...n.map((i) => [
            a.button.callback(
              `${i.symbol} • ${i.currency}`,
              `price:update:${i.id}`,
            ),
          ]),
          [a.button.callback("⬅️ Menu Investasi", "menu:investment")],
        ]),
      });
    }),
    r.action(/^price:update:(.+)$/, async (e) => {
      await e.answerCbQuery();
      const t = await c(e),
        n = await g.investmentInstrument.findFirst({
          where: { id: e.match[1], userId: t.id },
        });
      if (!n) return e.reply("Instrumen tidak ditemukan.");
      (o.set(e.chat.id, {
        kind: "PRICE_UPDATE",
        instrumentId: n.id,
        symbol: n.symbol,
        currency: n.currency,
      }),
        await e.reply(
          `Ketik harga terbaru <b>${s(n.symbol)}</b> per ${s(n.unitName)} dalam ${s(n.currency)}.`,
          { parse_mode: "HTML" },
        ));
    }),
    r.action("settings:currency", async (e) => {
      (await e.answerCbQuery(),
        await e.reply("Pilih mata uang utama untuk tampilan dan agregasi:", {
          ...a.inlineKeyboard([
            [
              a.button.callback("🇮🇩 IDR", "settings:set-currency:IDR"),
              a.button.callback("🇺🇸 USD", "settings:set-currency:USD"),
            ],
            [
              a.button.callback("🇸🇬 SGD", "settings:set-currency:SGD"),
              a.button.callback("🇪🇺 EUR", "settings:set-currency:EUR"),
            ],
            [
              a.button.callback("🇯🇵 JPY", "settings:set-currency:JPY"),
              a.button.callback("🇬🇧 GBP", "settings:set-currency:GBP"),
            ],
          ]),
        }));
    }),
    r.action(/^settings:set-currency:(IDR|USD|SGD|EUR|JPY|GBP)$/, async (e) => {
      const t = await c(e);
      (await b.update(t.id, { baseCurrency: e.match[1] }),
        await m(e.chat.id, { currency: e.match[1] }),
        await e.answerCbQuery(`Mata uang diubah ke ${e.match[1]}`),
        await e.reply(
          "✅ Mata uang utama diperbarui. Data asli akun, aset, dan transaksi tidak diubah.",
          {
            ...a.inlineKeyboard([
              [a.button.callback("🌐 Update Kurs Sekarang", "fx:update")],
              [a.button.callback("⚙️ Kembali", "menu:settings")],
            ]),
          },
        ));
    }),
    r.action("settings:theme", async (e) => {
      (await e.answerCbQuery(),
        await e.reply("Pilih tema bot:", { ...T("settings:set-theme") }));
    }),
    r.action(
      /^settings:set-theme:(FRIENDLY|MOTIVATIONAL|PROFESSIONAL|MINIMAL|CALM|PLAYFUL|GAMIFIED|FINANCIAL_COACH)$/,
      async (e) => {
        const t = await c(e);
        (await b.update(t.id, { telegramTheme: e.match[1] }),
          await m(e.chat.id, { theme: e.match[1] }),
          await e.answerCbQuery("Tema disimpan"),
          await p(e));
      },
    ),
    r.action("settings:motivation", async (e) => {
      const t = await c(e),
        n = await y(t.id);
      (await b.update(t.id, { showMotivation: !n.showMotivation }),
        await e.answerCbQuery("Pengaturan disimpan"),
        await p(e));
    }),
    r.action("settings:setup", async (e) => {
      await e.answerCbQuery();
      const t = await c(e);
      (await b.update(t.id, { onboardingCompleted: !1 }),
        await m(e.chat.id, { onboardingCompleted: !1 }),
        await E(e));
    }),
    r.action("fx:update", async (e) => {
      await e.answerCbQuery("Mengambil kurs terbaru...");
      const t = await c(e),
        n = await y(t.id),
        l = (await h.refreshUsedCurrencies(t.id, n.baseCurrency)).map((u) =>
          u.status === "UPDATED"
            ? `✅ 1 ${u.fromCurrency} = ${u.rate} ${u.toCurrency}`
            : `${u.status === "SKIPPED" ? "⚠️" : "❌"} ${u.fromCurrency} → ${u.toCurrency} • ${u.reason}`,
        );
      await e.reply(
        `💱 <b>Update Kurs Selesai</b>\n\n${l.length ? s(l.join("\n")) : "Tidak ada kurs yang perlu diperbarui."}`,
        { parse_mode: "HTML", ...C() },
      );
    }),
    r.action("session:cancel", async (e) => {
      (await e.answerCbQuery("Dibatalkan"), o.delete(e.chat.id), await P(e));
    }));
}
export { Le as registerTelegramHandlers3 };
