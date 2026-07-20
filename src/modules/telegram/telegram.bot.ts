import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Markup, Telegraf } from "telegraf";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { debtService } from "../debts/debt.service.js";
import { debtOverviewService } from "../debts/debt-overview.service.js";
import { debtPaymentService } from "../debts/debt-payment.service.js";
import { financeService } from "../finance/finance.service.js";
import { investmentService } from "../investments/investment.service.js";
import { settingsService } from "../settings/settings.service.js";
import { progress } from "./telegram.format.js";
import { upsertExchangeRate } from "../../common/fx.js";
import { getTelegramTheme, listTelegramThemes } from "./themes/index.js";
import { fxProviderService } from "../settings/fx-provider.service.js";
import { Feature, isFeatureActive } from "../../config/features.js";
import {
  requiredFeatureForTelegramInput,
  telegramComingSoonMessage,
  telegramDebtBankPaymentAction,
  telegramDebtDetailAction,
  telegramDebtHistoryAction,
  telegramDebtInstallmentPaymentAction,
  telegramDebtPaymentAction,
  telegramDebtScheduleAction,
} from "./telegram-feature-access.js";

let bot: Telegraf | null = null;

type TelegramLanguage = "id" | "en";
type TelegramCountry = "ID" | "US" | "SG" | "GB" | "JP" | "DE";
type TelegramThemeName =
  | "FRIENDLY"
  | "MOTIVATIONAL"
  | "PROFESSIONAL"
  | "MINIMAL"
  | "CALM"
  | "PLAYFUL"
  | "GAMIFIED"
  | "FINANCIAL_COACH";

type TelegramProfile = {
  country: TelegramCountry;
  language: TelegramLanguage;
  currency: string;
  theme: TelegramThemeName;
  onboardingCompleted: boolean;
};

type OnboardingDraft = Partial<TelegramProfile>;

type DebtPaymentDraft = {
  debtId: string;
  debtName: string;
  installmentId: string;
  period: string;
  amount: number;
  currency: string;
  paidAt: Date;
};

const wizard = new Map<number, Wizard>();
const onboardingDraft = new Map<number, OnboardingDraft>();
const profileFile = join(process.cwd(), "data", "telegram-profiles.json");
let profileCache: Record<string, TelegramProfile> | null = null;

const html = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

async function loadProfiles(): Promise<Record<string, TelegramProfile>> {
  if (profileCache) return profileCache;

  try {
    profileCache = JSON.parse(await readFile(profileFile, "utf8")) as Record<
      string,
      TelegramProfile
    >;
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.error("Gagal membaca profil Telegram:", error);
    }
    profileCache = {};
  }

  return profileCache;
}

async function getTelegramProfile(
  chatId: number,
): Promise<TelegramProfile | null> {
  const profiles = await loadProfiles();
  return profiles[String(chatId)] ?? null;
}

async function saveTelegramProfile(
  chatId: number,
  patch: Partial<TelegramProfile>,
): Promise<TelegramProfile> {
  const profiles = await loadProfiles();
  const previous = profiles[String(chatId)] ?? {
    country: "ID",
    language: "id",
    currency: "IDR",
    theme: "FRIENDLY",
    onboardingCompleted: false,
  };

  const next = { ...previous, ...patch };
  profiles[String(chatId)] = next;
  await mkdir(dirname(profileFile), { recursive: true });
  await writeFile(profileFile, JSON.stringify(profiles, null, 2), "utf8");
  return next;
}

const countryCurrency: Record<TelegramCountry, string> = {
  ID: "IDR",
  US: "USD",
  SG: "SGD",
  GB: "GBP",
  JP: "JPY",
  DE: "EUR",
};

const countryName: Record<TelegramCountry, string> = {
  ID: "Indonesia",
  US: "United States",
  SG: "Singapore",
  GB: "United Kingdom",
  JP: "Japan",
  DE: "European Union",
};

const languageName: Record<TelegramLanguage, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};

const textByLanguage = {
  id: {
    chooseCountry: "🌍 Pilih negara atau wilayah utama kamu:",
    chooseLanguage: "🗣 Pilih bahasa yang ingin digunakan:",
    chooseCurrency:
      "💱 Pilih mata uang utama untuk dashboard. Data asli aset tetap memakai mata uang masing-masing.",
    chooseTheme:
      "🎨 Pilih tema bot. Tema dapat diubah lagi kapan saja melalui Pengaturan.",
    completed:
      "✅ Konfigurasi selesai. Kamu sekarang bisa mulai mencatat keuangan melalui menu Telegram.",
  },
  en: {
    chooseCountry: "🌍 Choose your main country or region:",
    chooseLanguage: "🗣 Choose the language you want to use:",
    chooseCurrency:
      "💱 Choose the dashboard base currency. Original asset currencies will not be changed.",
    chooseTheme:
      "🎨 Choose a bot theme. You can change it later from Settings.",
    completed:
      "✅ Configuration completed. You can now record your finances from Telegram.",
  },
} as const;

function langText(language: TelegramLanguage) {
  return textByLanguage[language];
}

type Wizard =
  | { kind: "MANUAL_PRICE"; instrumentId: string; symbol: string }
  | { kind: "INCOME_AMOUNT" }
  | { kind: "INCOME_ACCOUNT"; amount: number }
  | {
      kind: "INCOME_NOTE";
      amount: number;
      accountId: string;
      accountName: string;
    }
  | { kind: "EXPENSE_AMOUNT" }
  | { kind: "EXPENSE_ACCOUNT"; amount: number }
  | {
      kind: "EXPENSE_NOTE";
      amount: number;
      accountId: string;
      accountName: string;
    }
  | {
      kind: "PAY_DEBT_AMOUNT";
      debtId: string;
      debtName: string;
      installmentId: string;
      period: string;
      suggestedAmount: number;
      currency: string;
    }
  | ({ kind: "PAY_DEBT_DATE" } & Omit<DebtPaymentDraft, "paidAt">)
  | ({ kind: "PAY_DEBT_CUSTOM_DATE" } & Omit<DebtPaymentDraft, "paidAt">)
  | ({ kind: "PAY_DEBT_BANK" } & DebtPaymentDraft)
  | ({
      kind: "PAY_DEBT_CONFIRM";
      accountId: string;
      accountName: string;
      accountBalance: number;
    } & DebtPaymentDraft)
  | { kind: "DEBT_HEALTH_INCOME" }
  | { kind: "DEBT_HEALTH_EXPENSES"; income: number }
  | { kind: "DEBT_HEALTH_BUFFER"; income: number; expenses: number }
  | { kind: "FX_RATE"; baseCurrency: string; quoteCurrency: string };

const currency = (n: number, code = "IDR") => {
  const normalizedCode = String(code || "IDR").toUpperCase();
  try {
    return new Intl.NumberFormat(normalizedCode === "IDR" ? "id-ID" : "en-US", {
      style: "currency",
      currency: normalizedCode,
      maximumFractionDigits: normalizedCode === "IDR" ? 0 : 8,
    }).format(Number(n) || 0);
  } catch {
    return `${normalizedCode} ${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 8,
    }).format(Number(n) || 0)}`;
  }
};
const num = (text: string) =>
  Number(
    text
      .replace(/[^0-9.,-]/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
const nowLabel = () =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

async function userFor(ctx: any) {
  const chatId = BigInt(ctx.chat.id);
  const username = ctx.from?.username ?? null;
  const name =
    [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") ||
    username ||
    "Pengguna";
  const user = await prisma.user.upsert({
    where: { telegramChatId: chatId },
    create: { name, telegramChatId: chatId, telegramUsername: username },
    update: { name, telegramUsername: username },
  });
  await settingsService.get(user.id);
  return user;
}

const homeKeyboard = (themeKey = "FRIENDLY") => {
  const t = getTelegramTheme(themeKey);
  const investmentLabel = isFeatureActive(Feature.INVESTMENTS)
    ? t.labels.portfolio
    : "🔒 Investasi • Segera Hadir";
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t.labels.expense, "flow:expense"),
      Markup.button.callback(t.labels.income, "flow:income"),
    ],
    [
      Markup.button.callback(t.labels.dashboard, "menu:dashboard"),
      Markup.button.callback(investmentLabel, "menu:portfolio"),
    ],
    [
      Markup.button.callback(t.labels.debt, "menu:debt"),
      Markup.button.callback(t.labels.accounts, "menu:accounts"),
    ],
    [
      Markup.button.callback(t.labels.settings, "menu:settings"),
      Markup.button.callback(t.labels.help, "menu:help"),
    ],
  ]);
};

const backHome = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("🏠 Kembali ke Beranda", "menu:home")],
  ]);

function motivation(pref: any) {
  if (!pref.showMotivation) return "";
  const messages = getTelegramTheme(pref.telegramTheme).motivation;
  if (!messages.length) return "";
  return `\n\n<i>${html(messages[new Date().getDate() % messages.length]!)}</i>`;
}

async function sendWelcome(ctx: any) {
  const user = await userFor(ctx);
  await ctx.reply(
    `👋 <b>SELAMAT DATANG DI PERSONAL FINANCE OS</b>

Halo, <b>${html(user.name)}</b>!

Bot ini membantu mencatat pemasukan, pengeluaran, account, tagihan, dan utang. Investasi tetap tersedia di roadmap dengan status Segera Hadir.

Semua konfigurasi awal dilakukan langsung melalui Telegram.`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🚀 Mulai Konfigurasi", "onboarding:start")],
      ]),
    },
  );
}

async function requireOnboarding(ctx: any) {
  const user = await userFor(ctx);
  const pref: any = await settingsService.get(user.id);
  if (!pref.onboardingCompleted) {
    await sendWelcome(ctx);
    return null;
  }
  return { user, pref };
}

function themeKeyboard(prefix = "set:theme") {
  const rows: any[] = [];
  const all = listTelegramThemes();
  for (let i = 0; i < all.length; i += 2)
    rows.push(
      all
        .slice(i, i + 2)
        .map((t: any) =>
          Markup.button.callback(`${t.emoji} ${t.name}`, `${prefix}:${t.key}`),
        ),
    );
  return Markup.inlineKeyboard(rows);
}

async function sendHome(ctx: any, edit = false) {
  const ready = await requireOnboarding(ctx);
  if (!ready) return;
  const { user, pref } = ready;
  const theme = getTelegramTheme(pref.telegramTheme);
  const cf = await financeService.cashflow(
    user.id,
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    new Date(),
  );
  const text = `${theme.emoji} <b>${html(theme.homeTitle)}</b>\n\n${html(theme.greeting(user.name))}\n\n📅 ${html(nowLabel())}\n📥 Pemasukan bulan ini: <b>${html(currency(cf.income, pref.baseCurrency))}</b>\n📤 Pengeluaran bulan ini: <b>${html(currency(cf.expense, pref.baseCurrency))}</b>\n🧭 Arus kas bersih: <b>${html(currency(cf.netCashFlow, pref.baseCurrency))}</b>${motivation(pref)}\n\nPilih aktivitas di bawah:`;
  if (edit)
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      ...homeKeyboard(pref.telegramTheme),
    });
  else
    await ctx.reply(text, {
      parse_mode: "HTML",
      ...homeKeyboard(pref.telegramTheme),
    });
}

async function sendAccounts(
  ctx: any,
  chooseFor?: "income" | "expense",
  amount?: number,
) {
  const u = await userFor(ctx);
  const accounts = await financeService.listAccounts(u.id);
  if (!accounts.length) {
    await ctx.reply(
      "🏦 Belum ada akun keuangan. Tambahkan lewat REST API terlebih dahulu, lalu kembali ke menu ini.",
      { ...backHome() },
    );
    return;
  }
  const rows = accounts.map((a: any) => [
    Markup.button.callback(
      `${a.type === "CASH" ? "💵" : a.type === "BANK" ? "🏦" : "👛"} ${a.name} • ${currency(Number(a.currentBalance), a.currency)}`,
      chooseFor ? `choose:${chooseFor}:${a.id}:${amount}` : `account:${a.id}`,
    ),
  ]);
  rows.push([Markup.button.callback("🏠 Beranda", "menu:home")]);
  await ctx.reply(
    chooseFor ? "Pilih akun yang digunakan:" : "🏦 <b>Daftar Akun Keuangan</b>",
    { parse_mode: "HTML", ...Markup.inlineKeyboard(rows) },
  );
}

async function sendPortfolio(ctx: any) {
  const u = await userFor(ctx);
  const p: any = await investmentService.portfolio(u.id);
  const fresh = p.items.filter((x: any) =>
    ["MANUAL_PRICE", "MARKET_PRICE"].includes(x.valuationStatus),
  );
  const stale = p.items.filter((x: any) => x.valuationStatus === "STALE_PRICE");
  const unpriced = p.items.filter((x: any) =>
    ["PURCHASE_PRICE_ONLY", "UNPRICED"].includes(x.valuationStatus),
  );
  const lines = p.items
    .slice(0, 8)
    .map((x: any) => {
      const icon =
        x.type === "STOCK"
          ? "📈"
          : x.type === "CRYPTO"
            ? "🪙"
            : x.type === "GOLD"
              ? "🥇"
              : "💼";
      const status =
        x.valuationStatus === "STALE_PRICE"
          ? "🟡 stale"
          : x.currentPrice == null
            ? "⚪ harga belum ada"
            : "🟢 fresh";
      const value =
        x.marketValue == null
          ? `Modal ${currency(x.costBasis)}`
          : `${currency(x.marketValue)} • ${x.unrealizedProfit >= 0 ? "+" : ""}${currency(x.unrealizedProfit)}`;
      return `${icon} <b>${html(x.symbol)}</b> — ${html(status)}\n${html(value)}`;
    })
    .join("\n\n");
  const text = `📊 <b>PORTFOLIO SAYA</b>\n\n✅ Nilai pasar terkonfirmasi: <b>${html(currency(p.confirmedMarketValue, p.displayCurrency))}</b>\n🕒 Estimasi harga lama: <b>${html(currency(p.estimatedMarketValue, p.displayCurrency))}</b>\n🧾 Modal belum tervaluasi: <b>${html(currency(p.unpricedInvestmentCost, p.displayCurrency))}</b>\n\n🟢 Fresh: ${fresh.length} aset\n🟡 Stale: ${stale.length} aset\n⚪ Belum ada harga: ${unpriced.length} aset\n\n${lines || "Belum ada investasi."}`;
  const buttons = [
    [
      Markup.button.callback("🔄 Update Harga", "price:menu"),
      Markup.button.callback("➕ Tambah Investasi", "invest:add-help"),
    ],
    [
      Markup.button.callback("🏦 Platform", "platform:list"),
      Markup.button.callback("⚙️ Pengaturan Harga", "settings:price"),
    ],
    [Markup.button.callback("🏠 Beranda", "menu:home")],
  ];
  await ctx.reply(text, {
    parse_mode: "HTML",
    ...Markup.inlineKeyboard(buttons),
  });
}

async function sendDashboard(ctx: any) {
  const u = await userFor(ctx);
  const [cf, p, debts, accounts] = await Promise.all([
    financeService.cashflow(
      u.id,
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      new Date(),
    ),
    isFeatureActive(Feature.INVESTMENTS)
      ? investmentService.portfolio(u.id)
      : Promise.resolve(null),
    debtService.list(u.id),
    financeService.listAccounts(u.id),
  ]);

  const displayCurrency = p?.displayCurrency ?? cf.currency ?? "IDR";
  const liquid = accounts
    .filter((a: any) => ["CASH", "BANK", "E_WALLET"].includes(a.type))
    .filter((a: any) => a.currency === displayCurrency)
    .reduce((sum: number, a: any) => sum + Number(a.currentBalance), 0);
  const liability = debts
    .filter((d: any) => (d.currency ?? "IDR") === displayCurrency)
    .reduce(
      (sum: number, debt: any) => sum + Number(debt.remainingPrincipal),
      0,
    );
  const confirmedInvestment = Number(p?.confirmedMarketValue ?? 0);
  const estimatedInvestment = Number(p?.estimatedMarketValue ?? 0);
  const confirmedNetWorth = liquid + confirmedInvestment - liability;
  const estimatedNetWorth = confirmedNetWorth + estimatedInvestment;
  const savingsRate =
    cf.income > 0
      ? ((cf.income - cf.expense - cf.debtPayment) / cf.income) * 100
      : 0;

  const investmentSummary = p
    ? `📈 Investasi terkonfirmasi: <b>${html(currency(confirmedInvestment, displayCurrency))}</b>\n`
    : "🔒 Investasi: <b>Segera Hadir</b>\n";
  const estimatedSummary = p
    ? `🔭 Estimasi termasuk harga stale: <b>${html(currency(estimatedNetWorth, displayCurrency))}</b>\n`
    : "";

  const text = `🧭 <b>RINGKASAN UTANG &amp; ARUS KAS</b>

💵 Aset likuid terkonfirmasi: <b>${html(currency(liquid, displayCurrency))}</b>
💳 Kewajiban terkonfirmasi: <b>${html(currency(liability, displayCurrency))}</b>
${investmentSummary}

🧮 Net worth terkonfirmasi: <b>${html(currency(confirmedNetWorth, displayCurrency))}</b>
${estimatedSummary}

📥 Income: ${html(currency(cf.income, displayCurrency))}
📤 Expense: ${html(currency(cf.expense, displayCurrency))}
💸 Bayar utang: ${html(currency(cf.debtPayment, displayCurrency))}
💡 Saving rate: <b>${html(savingsRate.toFixed(1))}%</b>

${savingsRate < 10 ? "⚠️ Ruang menabung masih tipis. Fokus pada pengeluaran yang paling sering berulang." : "✅ Arus kasmu cukup sehat bulan ini. Pertahankan ritmenya."}`;

  await ctx.reply(text, { parse_mode: "HTML", ...backHome() });
}

async function sendSettings(ctx: any) {
  const u = await userFor(ctx);
  const p: any = await settingsService.get(u.id);
  const profile = await getTelegramProfile(ctx.chat.id);
  const selectedCountry = profile?.country ?? "ID";
  const selectedLanguage = profile?.language ?? "id";
  const investmentSettings = isFeatureActive(Feature.INVESTMENTS)
    ? `💾 Penyimpanan harga: <b>${html(p.priceStorageMode)}</b>
❓ Konfirmasi sebelum update: <b>${p.confirmBeforePriceRefresh ? "Aktif" : "Nonaktif"}</b>
📸 Snapshot setelah update: <b>${p.createSnapshotAfterRefresh ? "Aktif" : "Nonaktif"}</b>

Batas harga stale:
📈 Saham ${p.stockStaleHours} jam
🪙 Crypto ${p.cryptoStaleHours} jam
🥇 Emas ${p.goldStaleHours} jam`
    : "🔒 Investasi dan pengaturan harga: <b>Segera Hadir</b>";
  const lockedPrefix = isFeatureActive(Feature.INVESTMENTS) ? "" : "🔒 ";
  const comingSoonSuffix = isFeatureActive(Feature.INVESTMENTS)
    ? ""
    : " • Segera Hadir";
  const text = `⚙️ <b>PENGATURAN PERSONAL</b>

🌍 Negara: <b>${html(countryName[selectedCountry])}</b>
🗣 Bahasa: <b>${html(languageName[selectedLanguage])}</b>
💱 Mata uang tampilan: <b>${html(p.baseCurrency)}</b>
🎨 Tema bot: <b>${html(p.telegramTheme)}</b>
✨ Motivasi: <b>${p.showMotivation ? "Aktif" : "Nonaktif"}</b>

${investmentSettings}`;
  await ctx.reply(text, {
    parse_mode: "HTML",
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback("🌍 Negara", "settings:country"),
        Markup.button.callback("🗣 Bahasa", "settings:language"),
      ],
      [
        Markup.button.callback("💱 Mata Uang Utama", "settings:currency"),
        Markup.button.callback("🌐 Update Kurs", "fx:auto:preview"),
      ],
      [
        Markup.button.callback("✍️ Kurs Manual", "settings:fx"),
        Markup.button.callback("📋 Kurs Tersimpan", "fx:list"),
      ],
      [
        Markup.button.callback(
          `${lockedPrefix}Mode Harga${comingSoonSuffix}`,
          "settings:storage",
        ),
        Markup.button.callback(
          `${lockedPrefix}Konfirmasi Harga${comingSoonSuffix}`,
          "settings:confirm",
        ),
      ],
      [
        Markup.button.callback(
          `${lockedPrefix}Snapshot${comingSoonSuffix}`,
          "settings:snapshot",
        ),
        Markup.button.callback("✨ Motivasi", "settings:motivation"),
      ],
      [
        Markup.button.callback("🎨 Tema", "settings:theme"),
        Markup.button.callback(
          `${lockedPrefix}Batas Stale${comingSoonSuffix}`,
          "settings:stale",
        ),
      ],
      [Markup.button.callback("🏠 Beranda", "menu:home")],
    ]),
  });
}

async function sendDebts(ctx: any) {
  const u = await userFor(ctx);
  const debts: any[] = await debtService.list(u.id);
  const rows = debts.map((d: any) => [
    Markup.button.callback(
      `${d.status === "OVERDUE" ? "🚨" : "💳"} ${d.name} • ${currency(Number(d.remainingPrincipal))}`,
      `debt:${d.id}`,
    ),
  ]);
  rows.push([Markup.button.callback("🏠 Beranda", "menu:home")]);
  await ctx.reply(
    debts.length
      ? "💳 <b>UTANG &amp; TAGIHAN</b>\n\nPilih utang untuk melihat detail atau mencatat pembayaran:"
      : "🎉 Belum ada utang aktif.",
    { parse_mode: "HTML", ...Markup.inlineKeyboard(rows) },
  );
}

const debtKindLabel: Record<string, string> = {
  CASH_LOAN: "Pinjaman tunai",
  VEHICLE_FINANCING: "Kredit kendaraan",
  GOODS_CREDIT: "Kredit barang",
  CREDIT_CARD: "Kartu kredit",
  PAYLATER: "Paylater",
  HOME_FINANCING: "Kredit rumah",
  FAMILY_FRIEND: "Keluarga/teman",
  OTHER: "Lainnya",
};

const healthAppearance: Record<string, { icon: string; label: string }> = {
  HEALTHY: { icon: "🟢", label: "SEHAT" },
  NEEDS_ATTENTION: { icon: "🟡", label: "PERLU PERHATIAN" },
  UNHEALTHY: { icon: "🟠", label: "MENCEKIK" },
  CRITICAL: { icon: "🔴", label: "KRITIS" },
  INSUFFICIENT_DATA: { icon: "⚪", label: "DATA BELUM CUKUP" },
};

function debtDate(value: Date | string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

async function sendDebtDetail(ctx: any, userId: string, debtId: string) {
  const overview: any = await debtOverviewService.get(userId, debtId);
  const { debt, contract, nextInstallment, affordability, health } = overview;
  const healthView =
    healthAppearance[health.status] ?? healthAppearance.INSUFFICIENT_DATA!;
  const nextBill = nextInstallment
    ? `\n\n🧾 <b>TAGIHAN BERIKUTNYA</b>\n📆 ${html(nextInstallment.period)} • jatuh tempo ${html(debtDate(nextInstallment.dueDate))}\nPokok ${html(currency(nextInstallment.outstandingPrincipal, debt.currency))} + biaya/bunga/denda ${html(currency(nextInstallment.outstandingCharges, debt.currency))}\nTotal perlu dibayar: <b>${html(currency(nextInstallment.totalOutstanding, debt.currency))}</b>`
    : "\n\n🎉 Tidak ada tagihan cicilan yang tersisa.";
  const ratio =
    health.debtServiceRatio === null
      ? "belum dapat dihitung"
      : `${health.debtServiceRatio}% dari pendapatan tetap`;
  const capacity =
    health.status === "INSUFFICIENT_DATA"
      ? "lengkapi data kemampuan bayar"
      : currency(affordability.paymentCapacity, debt.currency);
  const reasons = health.reasons
    .slice(0, 3)
    .map((reason: string) => `• ${html(reason)}`)
    .join("\n");
  const estimated = contract.estimated ? " <i>(estimasi kontrak)</i>" : "";
  const penaltyLine =
    contract.totalPenalty > 0
      ? `\nDenda tercatat: ${html(currency(contract.totalPenalty, debt.currency))} • tersisa ${html(currency(contract.outstandingPenalty, debt.currency))}`
      : "";

  await ctx.reply(
    `💳 <b>${html(debt.name)}</b>\n🏢 ${html(debt.creditor)} • ${html(debtKindLabel[debt.kind] ?? debt.kind)}\n🚩 Urgensi: <b>${html(debt.priority)}</b>\n📌 Status: <b>${html(debt.currentStatus)}</b>\n\n💰 <b>RINGKASAN KONTRAK</b>${estimated}\nPokok awal: ${html(currency(contract.originalPrincipal, debt.currency))}\nTotal kontrak: <b>${html(currency(contract.totalContractPayment, debt.currency))}</b>\nMetode bunga: ${html(debt.interestMethod)}${Number(debt.interestRateAnnual) > 0 ? ` • ${html(Number(debt.interestRateAnnual))}%/tahun` : ""}\nTotal bunga: <b>${html(currency(contract.totalInterest, debt.currency))}</b>\nRata-rata bunga/bulan: ${html(currency(contract.averageMonthlyInterest, debt.currency))}\nBunga terhadap pokok: ${html(contract.effectiveContractInterestPercent)}%${penaltyLine}\n\n📈 Terbayar: <b>${html(currency(contract.totalPaid, debt.currency))}</b> (${html(contract.progressPercent)}%)\n${html(progress(contract.totalPaid, contract.totalContractPayment))}\nSisa pokok: ${html(currency(Number(debt.remainingPrincipal), debt.currency))}\nSisa pembayaran kontrak: ${html(currency(contract.remainingContractPayment, debt.currency))}${nextBill}\n\n${healthView.icon} <b>KONDISI: ${healthView.label}</b>\nRasio seluruh cicilan: ${html(ratio)}\nRekomendasi bayar/bulan: <b>${html(currency(affordability.recommendedMonthlyPayment, debt.currency))}</b>\nSisa kemampuan bulanan: <b>${html(capacity)}</b>\n${reasons}`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("💸 Bayar Tagihan", `debt:pay:${debt.id}`)],
        [
          Markup.button.callback("🗓 Jadwal", `debt:s:${debt.id}`),
          Markup.button.callback("🧾 Riwayat", `debt:h:${debt.id}`),
        ],
        [
          Markup.button.callback(
            "🧮 Atur Kemampuan Bayar",
            "debt:health:setup",
          ),
        ],
        [
          Markup.button.callback("⬅️ Daftar Utang", "menu:debt"),
          Markup.button.callback("🏠 Beranda", "menu:home"),
        ],
      ]),
    },
  );
}

async function sendDebtInstallmentChoices(
  ctx: any,
  userId: string,
  debtId: string,
) {
  const overview: any = await debtOverviewService.get(userId, debtId);
  const outstanding = overview.installments.filter(
    (installment: any) => installment.totalOutstanding > 0,
  );
  if (!outstanding.length) {
    await ctx.reply("🎉 Tidak ada tagihan yang masih harus dibayar.");
    return;
  }
  const visible = outstanding.slice(0, 12);
  await ctx.reply(
    `Pilih tagihan <b>${html(overview.debt.name)}</b>. Tagihan yang sama dapat dibayar beberapa kali sampai lunas:${outstanding.length > visible.length ? "\n\nMenampilkan 12 tagihan terdekat." : ""}`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        ...visible.map((installment: any) => [
          Markup.button.callback(
            `${installment.period} • ${currency(installment.totalOutstanding, overview.debt.currency)}`,
            `debtpay:i:${installment.id}`,
          ),
        ]),
        [Markup.button.callback("❌ Batal", "debtpay:cancel")],
      ]),
    },
  );
}

async function askDebtPaymentDate(
  ctx: any,
  state: Omit<DebtPaymentDraft, "paidAt">,
) {
  wizard.set(ctx.chat!.id, { kind: "PAY_DEBT_DATE", ...state });
  await ctx.reply(
    `Nominal: <b>${html(currency(state.amount, state.currency))}</b>\nKapan pembayaran dilakukan?`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("Hari ini", "debtpay:date:today"),
          Markup.button.callback("Tanggal lain", "debtpay:date:custom"),
        ],
        [Markup.button.callback("❌ Batal", "debtpay:cancel")],
      ]),
    },
  );
}

async function sendDebtPaymentBanks(ctx: any, state: DebtPaymentDraft) {
  const user = await userFor(ctx);
  const accounts: any[] = await prisma.financialAccount.findMany({
    where: {
      userId: user.id,
      type: "BANK",
      currency: state.currency,
      isActive: true,
      status: "ACTIVE",
    },
    orderBy: { name: "asc" },
  });
  if (!accounts.length) {
    await ctx.reply(
      `Belum ada rekening bank aktif dengan mata uang ${html(state.currency)}. Tambahkan rekening lebih dulu melalui menu Account.`,
      { parse_mode: "HTML", ...backHome() },
    );
    return;
  }
  wizard.set(ctx.chat!.id, { kind: "PAY_DEBT_BANK", ...state });
  await ctx.reply("Pilih rekening bank sumber pembayaran:", {
    ...Markup.inlineKeyboard([
      ...accounts.map((account: any) => [
        Markup.button.callback(
          `${account.name} • ${currency(Number(account.currentBalance), account.currency)}`,
          `debtpay:b:${account.id}`,
        ),
      ]),
      [Markup.button.callback("❌ Batal", "debtpay:cancel")],
    ]),
  });
}

export async function startTelegramBot() {
  if (!env.TELEGRAM_ENABLED || !env.TELEGRAM_BOT_TOKEN) return;
  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  bot.use(async (ctx, next) => {
    const callbackData =
      ctx.callbackQuery && "data" in ctx.callbackQuery
        ? ctx.callbackQuery.data
        : undefined;
    const messageText =
      ctx.message && "text" in ctx.message ? ctx.message.text : undefined;
    const requiredFeature = requiredFeatureForTelegramInput({
      callbackData,
      messageText,
    });
    if (!requiredFeature || isFeatureActive(requiredFeature)) {
      await next();
      return;
    }
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery("🔒 Segera Hadir").catch(() => undefined);
    }
    await ctx.reply(telegramComingSoonMessage(requiredFeature), {
      parse_mode: "HTML",
      ...backHome(),
    });
  });

  bot.start(async (ctx: any) => {
    const u = await userFor(ctx);
    const p: any = await settingsService.get(u.id);
    if (p.onboardingCompleted) return sendHome(ctx);
    return sendWelcome(ctx);
  });

  bot.action("onboarding:start", async (ctx: any) => {
    await ctx.answerCbQuery();
    onboardingDraft.set(ctx.chat!.id, {});
    await ctx.reply(langText("id").chooseCountry, {
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

  bot.action(/^onboarding:country:(ID|US|SG|GB|JP|DE)$/, async (ctx: any) => {
    const country = ctx.match[1] as TelegramCountry;
    const draft = onboardingDraft.get(ctx.chat!.id) ?? {};
    onboardingDraft.set(ctx.chat!.id, { ...draft, country });
    await saveTelegramProfile(ctx.chat!.id, { country });
    await ctx.answerCbQuery(`Negara: ${countryName[country]}`);
    await ctx.reply(langText("id").chooseLanguage, {
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

  bot.action(/^onboarding:language:(id|en)$/, async (ctx: any) => {
    const language = ctx.match[1] as TelegramLanguage;
    const draft = onboardingDraft.get(ctx.chat!.id) ?? {};
    const country = (draft.country ?? "ID") as TelegramCountry;
    const suggestedCurrency = countryCurrency[country];
    onboardingDraft.set(ctx.chat!.id, { ...draft, language });
    await saveTelegramProfile(ctx.chat!.id, { language });
    await ctx.answerCbQuery(languageName[language]);
    await ctx.reply(langText(language).chooseCurrency, {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `⭐ ${suggestedCurrency}`,
            `onboarding:currency:${suggestedCurrency}`,
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

  bot.action(
    /^onboarding:currency:(IDR|USD|SGD|EUR|JPY|GBP)$/,
    async (ctx: any) => {
      const u = await userFor(ctx);
      const selectedCurrency = ctx.match[1];
      const draft = onboardingDraft.get(ctx.chat!.id) ?? {};
      const language = (draft.language ?? "id") as TelegramLanguage;
      onboardingDraft.set(ctx.chat!.id, {
        ...draft,
        currency: selectedCurrency,
      });
      await saveTelegramProfile(ctx.chat!.id, {
        currency: selectedCurrency,
      });
      await settingsService.update(u.id, {
        baseCurrency: selectedCurrency,
      } as any);
      await ctx.answerCbQuery(`Currency: ${selectedCurrency}`);
      await ctx.reply(langText(language).chooseTheme, {
        ...themeKeyboard("onboarding:theme"),
      });
    },
  );

  bot.action(
    /^onboarding:theme:(FRIENDLY|MOTIVATIONAL|PROFESSIONAL|MINIMAL|CALM|PLAYFUL|GAMIFIED|FINANCIAL_COACH)$/,
    async (ctx: any) => {
      const u = await userFor(ctx);
      const theme = ctx.match[1] as TelegramThemeName;
      const draft = onboardingDraft.get(ctx.chat!.id) ?? {};
      const language = (draft.language ?? "id") as TelegramLanguage;
      const country = (draft.country ?? "ID") as TelegramCountry;
      const selectedCurrency = draft.currency ?? countryCurrency[country];

      await settingsService.update(u.id, {
        telegramTheme: theme,
        baseCurrency: selectedCurrency,
        onboardingCompleted: true,
      } as any);
      await saveTelegramProfile(ctx.chat!.id, {
        country,
        language,
        currency: selectedCurrency,
        theme,
        onboardingCompleted: true,
      });
      onboardingDraft.delete(ctx.chat!.id);

      await ctx.answerCbQuery("Konfigurasi selesai");
      await ctx.reply(
        `${langText(language).completed}\n\n🌍 ${html(countryName[country])}\n🗣 ${html(languageName[language])}\n💱 ${html(selectedCurrency)}\n🎨 ${html(getTelegramTheme(theme).name)}\n\nSaat ini bot difokuskan pada Utang &amp; Kredit. Fitur investasi tetap terlihat sebagai roadmap dan berstatus Segera Hadir.`,
        { parse_mode: "HTML" },
      );
      await sendHome(ctx);
    },
  );
  bot.command("setup", async (ctx: any) => {
    const u = await userFor(ctx);
    onboardingDraft.delete(ctx.chat.id);
    await settingsService.update(u.id, { onboardingCompleted: false } as any);
    await saveTelegramProfile(ctx.chat.id, {
      onboardingCompleted: false,
    });
    await ctx.reply(
      "🔄 Konfigurasi Telegram direset. Tekan tombol di bawah untuk mengatur negara, bahasa, mata uang, dan tema lagi.",
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🚀 Mulai Konfigurasi", "onboarding:start")],
        ]),
      },
    );
  });
  bot.command("menu", async (ctx: any) => sendHome(ctx));
  bot.command("portfolio", async (ctx: any) => sendPortfolio(ctx));
  bot.command("cashflow", async (ctx: any) => sendDashboard(ctx));
  bot.command("settings", async (ctx: any) => sendSettings(ctx));

  bot.action("menu:home", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendHome(ctx, true);
  });
  bot.action("menu:dashboard", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendDashboard(ctx);
  });
  bot.action("menu:portfolio", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendPortfolio(ctx);
  });
  bot.action("menu:debt", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendDebts(ctx);
  });
  bot.action("menu:accounts", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendAccounts(ctx);
  });
  bot.action("menu:settings", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendSettings(ctx);
  });
  bot.action("menu:help", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Gunakan tombol menu untuk mencatat pendapatan, pengeluaran, account, utang, dan pengaturan. Command cepat: /menu, /cashflow, /settings. 🔒 Investasi berstatus Segera Hadir.",
      { ...backHome() },
    );
  });

  bot.action("flow:income", async (ctx: any) => {
    await ctx.answerCbQuery();
    wizard.set(ctx.chat!.id, { kind: "INCOME_AMOUNT" });
    await ctx.reply(
      "💰 <b>CATAT PENDAPATAN</b>\n\nBerapa nominal yang kamu terima?\nContoh: <code>7500000</code>",
      { parse_mode: "HTML" },
    );
  });
  bot.action("flow:expense", async (ctx: any) => {
    await ctx.answerCbQuery();
    wizard.set(ctx.chat!.id, { kind: "EXPENSE_AMOUNT" });
    await ctx.reply(
      "💸 <b>CATAT PENGELUARAN</b>\n\nBerapa nominal yang kamu keluarkan?\nContoh: <code>45000</code>",
      { parse_mode: "HTML" },
    );
  });

  bot.action(/^choose:(income|expense):([^:]+):(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const [, type, accountId, amountRaw] = ctx.match;
    const u = await userFor(ctx);
    const account = await prisma.financialAccount.findFirst({
      where: { id: accountId, userId: u.id },
    });
    if (!account) return ctx.reply("Akun tidak ditemukan.");
    const amount = Number(amountRaw);
    wizard.set(ctx.chat!.id, {
      kind: type === "income" ? "INCOME_NOTE" : "EXPENSE_NOTE",
      amount,
      accountId,
      accountName: account.name,
    } as Wizard);
    await ctx.reply(
      `${type === "income" ? "💰" : "💸"} Nominal <b>${html(currency(amount, account.currency))}</b> melalui <b>${html(account.name)}</b>\n\nTulis keterangan singkat, misalnya: ${type === "income" ? "Gaji Juli" : "Makan siang"}`,
      { parse_mode: "HTML" },
    );
  });

  bot.action("price:menu", async (ctx: any) => {
    await ctx.answerCbQuery();
    const u = await userFor(ctx);
    const instruments: any[] = await investmentService.listInstruments(u.id);
    const rows = instruments.map((x: any) => [
      Markup.button.callback(
        `${x.type === "STOCK" ? "📈" : x.type === "CRYPTO" ? "🪙" : "💼"} ${x.symbol}`,
        `price:manual:${x.id}`,
      ),
    ]);
    rows.push([Markup.button.callback("🏠 Beranda", "menu:home")]);
    await ctx.reply(
      "🔄 <b>UPDATE HARGA ASET</b>\n\nHarga hanya diperbarui saat kamu memilih aset. Tidak ada scheduler otomatis.",
      { parse_mode: "HTML", ...Markup.inlineKeyboard(rows) },
    );
  });
  bot.action(/^price:manual:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const u = await userFor(ctx);
    const ins: any = await prisma.investmentInstrument.findFirst({
      where: { id: ctx.match[1], userId: u.id },
    });
    if (!ins) return ctx.reply("Instrumen tidak ditemukan.");
    wizard.set(ctx.chat!.id, {
      kind: "MANUAL_PRICE",
      instrumentId: ins.id,
      symbol: ins.symbol,
    });
    await ctx.reply(
      `✍️ <b>UPDATE ${html(ins.symbol)}</b>\n\nMasukkan harga terbaru per ${html(ins.unitName)}.\nContoh: <code>9750</code>`,
      { parse_mode: "HTML" },
    );
  });

  bot.action("platform:list", async (ctx: any) => {
    await ctx.answerCbQuery();
    const u = await userFor(ctx);
    const rows: any[] = await investmentService.listPlatforms(u.id);
    await ctx.reply(
      rows.length
        ? `🏦 <b>PLATFORM INVESTASI</b>\n\n${rows.map((x: any, i: number) => `${i + 1}. <b>${html(x.name)}</b>\n${html(x.type)}${x.accountReference ? ` • ${html(x.accountReference)}` : ""}`).join("\n\n")}`
        : "Belum ada platform.",
      { parse_mode: "HTML", ...backHome() },
    );
  });
  bot.action("invest:add-help", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Tambahkan instrumen melalui command:\n/tambahinvestasi BBCA | Bank Central Asia | STOCK | IDX\n\nTambahkan platform:\n/tambahplatform Stockbit | BROKER | RDN BCA | Akun utama",
      { ...backHome() },
    );
  });

  bot.action("settings:country", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply("🌍 Pilih negara atau wilayah utama:", {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("🇮🇩 Indonesia", "set:country:ID"),
          Markup.button.callback("🇺🇸 United States", "set:country:US"),
        ],
        [
          Markup.button.callback("🇸🇬 Singapore", "set:country:SG"),
          Markup.button.callback("🇬🇧 United Kingdom", "set:country:GB"),
        ],
        [
          Markup.button.callback("🇯🇵 Japan", "set:country:JP"),
          Markup.button.callback("🇪🇺 Europe", "set:country:DE"),
        ],
        [Markup.button.callback("⚙️ Kembali", "menu:settings")],
      ]),
    });
  });

  bot.action(/^set:country:(ID|US|SG|GB|JP|DE)$/, async (ctx: any) => {
    const country = ctx.match[1] as TelegramCountry;
    await saveTelegramProfile(ctx.chat!.id, { country });
    await ctx.answerCbQuery(`Negara: ${countryName[country]}`);
    await ctx.reply(
      `✅ Negara diubah menjadi ${html(countryName[country])}.

Mata uang yang umum digunakan adalah ${countryCurrency[country]}. Kamu dapat mengubah mata uang utama secara terpisah.`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `💱 Gunakan ${countryCurrency[country]}`,
              `set:currency:${countryCurrency[country]}`,
            ),
          ],
          [Markup.button.callback("⚙️ Kembali", "menu:settings")],
        ]),
      },
    );
  });

  bot.action("settings:language", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply("🗣 Pilih bahasa bot:", {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("🇮🇩 Bahasa Indonesia", "set:language:id"),
          Markup.button.callback("🇬🇧 English", "set:language:en"),
        ],
        [Markup.button.callback("⚙️ Kembali", "menu:settings")],
      ]),
    });
  });

  bot.action(/^set:language:(id|en)$/, async (ctx: any) => {
    const language = ctx.match[1] as TelegramLanguage;
    await saveTelegramProfile(ctx.chat!.id, { language });
    await ctx.answerCbQuery(languageName[language]);
    await ctx.reply(
      language === "en"
        ? "✅ Language preference saved. Some financial labels still follow the selected theme."
        : "✅ Preferensi bahasa disimpan.",
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("⚙️ Kembali", "menu:settings")],
        ]),
      },
    );
  });

  bot.action("settings:currency", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Pilih mata uang tampilan utama. Data asli tidak akan diubah:",
      {
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("🇮🇩 IDR", "set:currency:IDR"),
            Markup.button.callback("🇺🇸 USD", "set:currency:USD"),
          ],
          [
            Markup.button.callback("🇸🇬 SGD", "set:currency:SGD"),
            Markup.button.callback("🇪🇺 EUR", "set:currency:EUR"),
          ],
          [
            Markup.button.callback("🇯🇵 JPY", "set:currency:JPY"),
            Markup.button.callback("🇬🇧 GBP", "set:currency:GBP"),
          ],
        ]),
      },
    );
  });
  bot.action(/^set:currency:(IDR|USD|SGD|EUR|JPY|GBP)$/, async (ctx: any) => {
    const u = await userFor(ctx);
    const selectedCurrency = ctx.match[1];
    await settingsService.update(u.id, {
      baseCurrency: selectedCurrency,
    } as any);
    await saveTelegramProfile(ctx.chat!.id, { currency: selectedCurrency });
    await ctx.answerCbQuery(`Tampilan diubah ke ${selectedCurrency}`);
    await ctx.reply(
      `✅ Mata uang utama menjadi ${selectedCurrency}. Data asli tidak diubah. Tekan tombol di bawah untuk menyinkronkan kurs yang dibutuhkan.`,
      {
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "🌐 Update Kurs Sekarang",
              "fx:auto:preview",
            ),
          ],
          [Markup.button.callback("⚙️ Kembali ke Pengaturan", "menu:settings")],
        ]),
      },
    );
  });

  bot.action("fx:auto:preview", async (ctx: any) => {
    await ctx.answerCbQuery();
    const ready = await requireOnboarding(ctx);
    if (!ready) return;
    const { user, pref } = ready;
    const pairs = await fxProviderService.preview(user.id, pref.baseCurrency);
    if (!pairs.length) {
      await ctx.reply(
        `✅ Semua data yang tercatat sudah menggunakan ${pref.baseCurrency}. Tidak ada kurs yang perlu diperbarui.`,
        { ...backHome() },
      );
      return;
    }
    const lines = pairs
      .map(
        (p: any) =>
          `${p.supported ? "💱" : "⚠️"} ${p.currency} → ${p.targetCurrency}${p.supported ? "" : " • perlu manual/provider khusus"}`,
      )
      .join("\n");
    await ctx.reply(
      `🌐 <b>UPDATE KURS TERPAKAI</b>\n\nMata uang utama: <b>${html(pref.baseCurrency)}</b>\n\nPasangan yang ditemukan:\n${html(lines)}\n\nBot hanya mengambil kurs untuk mata uang yang benar-benar digunakan. Kurs aset dan histori transaksi asli tidak akan ditulis ulang.`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Ambil Kurs Terbaru", "fx:auto:confirm")],
          [Markup.button.callback("❌ Batal", "menu:settings")],
        ]),
      },
    );
  });

  bot.action("fx:auto:confirm", async (ctx: any) => {
    await ctx.answerCbQuery("Mengambil kurs terbaru...");
    const ready = await requireOnboarding(ctx);
    if (!ready) return;
    const { user, pref } = ready;
    const results = await fxProviderService.refreshUsedCurrencies(
      user.id,
      pref.baseCurrency,
    );
    const updated = results.filter((x: any) => x.status === "UPDATED");
    const skipped = results.filter((x: any) => x.status === "SKIPPED");
    const failed = results.filter((x: any) => x.status === "FAILED");
    const rows = results
      .map((x: any) => {
        if (x.status === "UPDATED") {
          const movement =
            x.changePercent == null
              ? "baru"
              : `${x.changePercent >= 0 ? "+" : ""}${x.changePercent.toFixed(3)}%`;
          return `✅ 1 ${x.fromCurrency} = ${x.rate} ${x.toCurrency} • ${movement}`;
        }
        return `${x.status === "SKIPPED" ? "⚠️" : "❌"} ${x.fromCurrency} → ${x.toCurrency} • ${x.reason}`;
      })
      .join("\n");
    await ctx.reply(
      `💱 <b>KURS SELESAI DIPERBARUI</b>\n\n${html(rows || "Tidak ada pasangan kurs.")}\n\n✅ Berhasil: ${updated.length}\n⚠️ Perlu manual: ${skipped.length}\n❌ Gagal: ${failed.length}\n\nSumber: kurs referensi harian. Ini bukan harga beli atau jual bank.`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("📊 Lihat Dashboard", "menu:dashboard"),
            Markup.button.callback("📋 Lihat Kurs", "fx:list"),
          ],
          [Markup.button.callback("🏠 Beranda", "menu:home")],
        ]),
      },
    );
  });

  bot.action("fx:list", async (ctx: any) => {
    await ctx.answerCbQuery();
    const u = await userFor(ctx);
    const rates = await prisma.exchangeRate.findMany({
      where: { userId: u.id },
      orderBy: [{ quoteCurrency: "asc" }, { baseCurrency: "asc" }],
    });
    const lines = rates
      .map(
        (r: any) =>
          `• 1 ${r.baseCurrency} = ${Number(r.rate)} ${r.quoteCurrency}\n  ${r.source} • ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(r.capturedAt)}`,
      )
      .join("\n\n");
    await ctx.reply(
      `📋 <b>KURS TERSIMPAN</b>\n\n${html(lines || "Belum ada kurs tersimpan.")}`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("🌐 Update Kurs", "fx:auto:preview"),
            Markup.button.callback("✍️ Manual", "settings:fx"),
          ],
          [Markup.button.callback("⚙️ Pengaturan", "menu:settings")],
        ]),
      },
    );
  });

  bot.action("settings:fx", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "🔁 <b>ATUR KURS MANUAL</b>\n\nPilih pasangan kurs yang ingin disimpan. Format: 1 mata uang asal = berapa mata uang tujuan.",
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("USD → IDR", "fx:USD:IDR"),
            Markup.button.callback("IDR → USD", "fx:IDR:USD"),
          ],
          [
            Markup.button.callback("USD → SGD", "fx:USD:SGD"),
            Markup.button.callback("EUR → IDR", "fx:EUR:IDR"),
          ],
          [Markup.button.callback("✍️ Pair lain via /kurs", "fx:help")],
        ]),
      },
    );
  });
  bot.action(/^fx:([A-Z]{3,5}):([A-Z]{3,5})$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    wizard.set(ctx.chat!.id, {
      kind: "FX_RATE",
      baseCurrency: ctx.match[1],
      quoteCurrency: ctx.match[2],
    });
    await ctx.reply(
      `Masukkan kurs:\n\n1 ${ctx.match[1]} = berapa ${ctx.match[2]}?\nContoh: \`16350\``,
      { parse_mode: "HTML" },
    );
  });
  bot.action("fx:help", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Gunakan command:\n/kurs USD IDR 16350\n/kurs USDT IDR 16320\n/kurs EUR USD 1.08",
      { ...backHome() },
    );
  });
  bot.command("kurs", async (ctx: any) => {
    const u = await userFor(ctx);
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 4) return ctx.reply("Format: /kurs USD IDR 16350");
    const rate = Number(parts[3].replace(",", "."));
    if (!(rate > 0)) return ctx.reply("Kurs tidak valid.");
    await upsertExchangeRate(u.id, parts[1], parts[2], rate, "MANUAL");
    await ctx.reply(
      `✅ Kurs tersimpan\n1 ${parts[1].toUpperCase()} = ${rate} ${parts[2].toUpperCase()}\n\nSeluruh dashboard akan dikonversi saat dibuka, tanpa mengubah data asli.`,
      { ...homeKeyboard() },
    );
  });

  bot.action("settings:storage", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply("Pilih cara menyimpan harga:", {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "💾 Hanya harga terakhir",
            "set:storage:LATEST_ONLY",
          ),
        ],
        [Markup.button.callback("📚 Simpan histori", "set:storage:SNAPSHOT")],
      ]),
    });
  });
  bot.action(/^set:storage:(LATEST_ONLY|SNAPSHOT)$/, async (ctx: any) => {
    const u = await userFor(ctx);
    await settingsService.update(u.id, {
      priceStorageMode: ctx.match[1] as any,
    });
    await ctx.answerCbQuery("Pengaturan disimpan");
    await sendSettings(ctx);
  });
  bot.action("settings:confirm", async (ctx: any) => {
    const u = await userFor(ctx);
    const p: any = await settingsService.get(u.id);
    await settingsService.update(u.id, {
      confirmBeforePriceRefresh: !p.confirmBeforePriceRefresh,
    });
    await ctx.answerCbQuery("Pengaturan diubah");
    await sendSettings(ctx);
  });
  bot.action("settings:snapshot", async (ctx: any) => {
    const u = await userFor(ctx);
    const p: any = await settingsService.get(u.id);
    await settingsService.update(u.id, {
      createSnapshotAfterRefresh: !p.createSnapshotAfterRefresh,
    });
    await ctx.answerCbQuery("Pengaturan diubah");
    await sendSettings(ctx);
  });
  bot.action("settings:motivation", async (ctx: any) => {
    const u = await userFor(ctx);
    const p: any = await settingsService.get(u.id);
    await settingsService.update(u.id, { showMotivation: !p.showMotivation });
    await ctx.answerCbQuery("Pengaturan diubah");
    await sendSettings(ctx);
  });
  bot.action("settings:theme", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply("Pilih gaya Telegram bot. Tema bisa diganti kapan saja:", {
      ...themeKeyboard("set:theme"),
    });
  });
  bot.action(
    /^set:theme:(FRIENDLY|MOTIVATIONAL|PROFESSIONAL|MINIMAL|CALM|PLAYFUL|GAMIFIED|FINANCIAL_COACH)$/,
    async (ctx: any) => {
      const u = await userFor(ctx);
      await settingsService.update(u.id, {
        telegramTheme: ctx.match[1] as any,
      });
      await ctx.answerCbQuery("Tema disimpan");
      await sendSettings(ctx);
    },
  );
  bot.action("settings:stale", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply("Pilih profil batas stale:", {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("⚡ Ketat", "set:stale:strict"),
          Markup.button.callback("⚖️ Normal", "set:stale:normal"),
        ],
        [Markup.button.callback("🌿 Santai", "set:stale:relaxed")],
      ]),
    });
  });
  bot.action(/^set:stale:(strict|normal|relaxed)$/, async (ctx: any) => {
    const u = await userFor(ctx);
    const mode = ctx.match[1];
    const data =
      mode === "strict"
        ? { stockStaleHours: 12, cryptoStaleHours: 2, goldStaleHours: 12 }
        : mode === "relaxed"
          ? { stockStaleHours: 72, cryptoStaleHours: 24, goldStaleHours: 72 }
          : { stockStaleHours: 24, cryptoStaleHours: 6, goldStaleHours: 24 };
    await settingsService.update(u.id, data);
    await ctx.answerCbQuery("Batas stale disimpan");
    await sendSettings(ctx);
  });
  bot.action("settings:price", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendSettings(ctx);
  });

  bot.action(telegramDebtPaymentAction, async (ctx: any) => {
    await ctx.answerCbQuery();
    const u = await userFor(ctx);
    await sendDebtInstallmentChoices(ctx, u.id, ctx.match[1]);
  });
  bot.action(telegramDebtInstallmentPaymentAction, async (ctx: any) => {
    await ctx.answerCbQuery();
    const u = await userFor(ctx);
    const installment: any = await prisma.debtInstallment.findFirst({
      where: { id: ctx.match[1], debt: { userId: u.id } },
      include: { debt: true },
    });
    if (!installment) return ctx.reply("Tagihan tidak ditemukan.");
    const overview: any = await debtOverviewService.get(
      u.id,
      installment.debtId,
    );
    const bill = overview.installments.find(
      (item: any) => item.id === installment.id,
    );
    if (!bill || bill.totalOutstanding <= 0) {
      return ctx.reply("Tagihan ini sudah lunas.");
    }
    wizard.set(ctx.chat!.id, {
      kind: "PAY_DEBT_AMOUNT",
      debtId: installment.debtId,
      debtName: installment.debt.name,
      installmentId: installment.id,
      period: installment.period,
      suggestedAmount: bill.totalOutstanding,
      currency: installment.debt.currency,
    });
    await ctx.reply(
      `🧾 Tagihan <b>${html(installment.period)}</b>\nTotal tersisa: <b>${html(currency(bill.totalOutstanding, installment.debt.currency))}</b>\n\nKetik nominal yang ingin dibayar. Pembayaran parsial boleh dilakukan beberapa kali.`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `Bayar penuh ${currency(bill.totalOutstanding, installment.debt.currency)}`,
              "debtpay:full",
            ),
          ],
          [Markup.button.callback("❌ Batal", "debtpay:cancel")],
        ]),
      },
    );
  });
  bot.action("debtpay:full", async (ctx: any) => {
    await ctx.answerCbQuery();
    const state = wizard.get(ctx.chat!.id);
    if (!state || state.kind !== "PAY_DEBT_AMOUNT") {
      return ctx.reply("Sesi pembayaran sudah berakhir. Silakan mulai lagi.");
    }
    await askDebtPaymentDate(ctx, {
      debtId: state.debtId,
      debtName: state.debtName,
      installmentId: state.installmentId,
      period: state.period,
      amount: state.suggestedAmount,
      currency: state.currency,
    });
  });
  bot.action("debtpay:date:today", async (ctx: any) => {
    await ctx.answerCbQuery();
    const state = wizard.get(ctx.chat!.id);
    if (!state || state.kind !== "PAY_DEBT_DATE") {
      return ctx.reply("Sesi pembayaran sudah berakhir. Silakan mulai lagi.");
    }
    const { kind: _kind, ...draft } = state;
    await sendDebtPaymentBanks(ctx, { ...draft, paidAt: new Date() });
  });
  bot.action("debtpay:date:custom", async (ctx: any) => {
    await ctx.answerCbQuery();
    const state = wizard.get(ctx.chat!.id);
    if (!state || state.kind !== "PAY_DEBT_DATE") {
      return ctx.reply("Sesi pembayaran sudah berakhir. Silakan mulai lagi.");
    }
    const { kind: _kind, ...draft } = state;
    wizard.set(ctx.chat!.id, { kind: "PAY_DEBT_CUSTOM_DATE", ...draft });
    await ctx.reply("Ketik tanggal pembayaran dengan format YYYY-MM-DD.");
  });
  bot.action(telegramDebtBankPaymentAction, async (ctx: any) => {
    await ctx.answerCbQuery();
    const state = wizard.get(ctx.chat!.id);
    if (!state || state.kind !== "PAY_DEBT_BANK") {
      return ctx.reply("Sesi pembayaran sudah berakhir. Silakan mulai lagi.");
    }
    const u = await userFor(ctx);
    const account: any = await prisma.financialAccount.findFirst({
      where: {
        id: ctx.match[1],
        userId: u.id,
        type: "BANK",
        currency: state.currency,
        isActive: true,
        status: "ACTIVE",
      },
    });
    if (!account) return ctx.reply("Rekening bank tidak ditemukan.");
    if (Number(account.currentBalance) < state.amount) {
      return ctx.reply(
        `Saldo ${html(account.name)} tidak cukup. Tersedia ${html(currency(Number(account.currentBalance), account.currency))}.`,
        { parse_mode: "HTML" },
      );
    }
    const { kind: _kind, ...draft } = state;
    wizard.set(ctx.chat!.id, {
      kind: "PAY_DEBT_CONFIRM",
      ...draft,
      accountId: account.id,
      accountName: account.name,
      accountBalance: Number(account.currentBalance),
    });
    await ctx.reply(
      `🔎 <b>KONFIRMASI PEMBAYARAN</b>\n\nUtang: <b>${html(state.debtName)}</b>\nTagihan: ${html(state.period)}\nNominal: <b>${html(currency(state.amount, state.currency))}</b>\nTanggal bayar: ${html(debtDate(state.paidAt))}\nSumber: <b>${html(account.name)}</b>\nSaldo setelah bayar: <b>${html(currency(Number(account.currentBalance) - state.amount, account.currency))}</b>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Konfirmasi", "debtpay:confirm")],
          [Markup.button.callback("❌ Batal", "debtpay:cancel")],
        ]),
      },
    );
  });
  bot.action("debtpay:confirm", async (ctx: any) => {
    await ctx.answerCbQuery("Memproses pembayaran...");
    const state = wizard.get(ctx.chat!.id);
    if (!state || state.kind !== "PAY_DEBT_CONFIRM") {
      return ctx.reply("Sesi pembayaran sudah berakhir. Silakan mulai lagi.");
    }
    try {
      const u = await userFor(ctx);
      const result: any = await debtPaymentService.payFromBank(
        u.id,
        state.debtId,
        {
          amount: state.amount,
          paidAt: state.paidAt,
          source: "TELEGRAM",
          note: `Pembayaran tagihan ${state.period} via Telegram`,
          installmentId: state.installmentId,
          sourceAccountId: state.accountId,
          idempotencyKey: `tg-${ctx.chat!.id}-${ctx.callbackQuery.id}`,
        },
      );
      wizard.delete(ctx.chat!.id);
      await ctx.reply(
        `✅ Pembayaran <b>${html(currency(state.amount, state.currency))}</b> untuk <b>${html(state.debtName)}</b> tercatat.\n🏦 Sisa saldo ${html(state.accountName)}: <b>${html(currency(Number(result.sourceAccount.currentBalance), state.currency))}</b>\n📉 Sisa pokok utang: <b>${html(currency(Number(result.debt.remainingPrincipal), state.currency))}</b>`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "Lihat Detail Utang",
                `debt:${state.debtId}`,
              ),
            ],
            [Markup.button.callback("🏠 Beranda", "menu:home")],
          ]),
        },
      );
    } catch (error: any) {
      await ctx.reply(`❌ Pembayaran gagal: ${html(error.message)}`, {
        parse_mode: "HTML",
      });
    }
  });
  bot.action("debtpay:cancel", async (ctx: any) => {
    wizard.delete(ctx.chat!.id);
    await ctx.answerCbQuery("Pembayaran dibatalkan");
    await ctx.reply("Pembayaran dibatalkan.", { ...backHome() });
  });
  bot.action(telegramDebtDetailAction, async (ctx: any) => {
    await ctx.answerCbQuery();
    const u = await userFor(ctx);
    await sendDebtDetail(ctx, u.id, ctx.match[1]);
  });
  bot.action(telegramDebtScheduleAction, async (ctx: any) => {
    await ctx.answerCbQuery();
    const u = await userFor(ctx);
    const overview: any = await debtOverviewService.get(u.id, ctx.match[1]);
    const currentIndex = overview.installments.findIndex(
      (installment: any) => installment.totalOutstanding > 0,
    );
    const startIndex =
      currentIndex < 0
        ? Math.max(0, overview.installments.length - 12)
        : Math.max(0, currentIndex - 1);
    const visible = overview.installments.slice(startIndex, startIndex + 12);
    const lines = visible.map((installment: any) => {
      const icon = ["PAID", "PAID_LATE"].includes(installment.currentStatus)
        ? "✅"
        : ["PARTIAL", "OVERDUE"].includes(installment.currentStatus)
          ? "🟠"
          : "⚪";
      return `${icon} <b>${html(installment.period)}</b> • ${html(installment.currentStatus)}\n   Jatuh tempo ${html(debtDate(installment.dueDate))} • sisa ${html(currency(installment.totalOutstanding, overview.debt.currency))}\n   Pokok ${html(currency(installment.scheduledPrincipal, overview.debt.currency))} + bunga ${html(currency(installment.interest, overview.debt.currency))}${installment.penalty > 0 ? ` + denda ${html(currency(installment.penalty, overview.debt.currency))}` : ""}`;
    });
    await ctx.reply(
      `🗓 <b>JADWAL ${html(overview.debt.name)}</b>\n\n${lines.length ? lines.join("\n\n") : "Belum ada jadwal cicilan."}${overview.installments.length > visible.length ? "\n\n<i>Menampilkan 12 periode di sekitar tagihan aktif.</i>" : ""}`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "⬅️ Kembali ke Detail",
              `debt:${overview.debt.id}`,
            ),
          ],
        ]),
      },
    );
  });
  bot.action(telegramDebtHistoryAction, async (ctx: any) => {
    await ctx.answerCbQuery();
    const u = await userFor(ctx);
    const debt: any = await debtService.find(u.id, ctx.match[1]);
    const payments = debt.payments
      .filter((payment: any) => payment.status === "POSTED")
      .slice(0, 12);
    const lines = payments.map(
      (payment: any) =>
        `✅ ${html(debtDate(payment.paidAt))} • <b>${html(currency(Number(payment.amount), debt.currency))}</b>\n   ${html(payment.sourceAccount?.name ?? payment.source)}${payment.note ? ` • ${html(payment.note)}` : ""}`,
    );
    await ctx.reply(
      `🧾 <b>RIWAYAT PEMBAYARAN ${html(debt.name)}</b>\n\n${lines.length ? lines.join("\n\n") : "Belum ada pembayaran."}`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "⬅️ Kembali ke Detail",
              `debt:${debt.id}`,
            ),
          ],
        ]),
      },
    );
  });
  bot.action("debt:health:setup", async (ctx: any) => {
    await ctx.answerCbQuery();
    wizard.set(ctx.chat!.id, { kind: "DEBT_HEALTH_INCOME" });
    await ctx.reply(
      "Masukkan total pendapatan tetap bersih per bulan. Contoh: 8000000",
    );
  });

  bot.command("tambahplatform", async (ctx: any) => {
    const u = await userFor(ctx);
    const raw = ctx.message.text
      .replace(/^\/tambahplatform(?:@\w+)?\s*/, "")
      .trim();
    const [name, type, accountReference, notes] = raw
      .split("|")
      .map((x: string) => x.trim());
    if (!name || !type)
      return ctx.reply(
        "Format: /tambahplatform Stockbit | BROKER | RDN BCA | Catatan",
      );
    const p: any = await investmentService.createPlatform(u.id, {
      name,
      type: type as any,
      ...(accountReference ? { accountReference } : {}),
      ...(notes ? { notes } : {}),
    });
    await ctx.reply(`✅ Platform <b>${html(p.name)}</b> tersimpan.`, {
      parse_mode: "HTML",
      ...backHome(),
    });
  });
  bot.command("tambahinvestasi", async (ctx: any) => {
    const u = await userFor(ctx);
    const raw = ctx.message.text
      .replace(/^\/tambahinvestasi(?:@\w+)?\s*/, "")
      .trim();
    const [symbol, name, type, exchange] = raw
      .split("|")
      .map((x: string) => x.trim());
    if (!symbol || !name || !type)
      return ctx.reply(
        "Format: /tambahinvestasi BBCA | Bank Central Asia | STOCK | IDX",
      );
    const liquidityLevel =
      type === "STOCK" || type === "CRYPTO"
        ? "HIGH"
        : type === "GOLD"
          ? "MEDIUM"
          : "LOW";
    const staleAfterHours = type === "CRYPTO" ? 6 : 24;
    const x: any = await investmentService.createInstrument(u.id, {
      symbol: symbol.toUpperCase(),
      name,
      type: type as any,
      ...(exchange ? { exchange } : {}),
      currency: "IDR",
      unitName: type === "STOCK" ? "share" : type === "GOLD" ? "gram" : "unit",
      unitsPerLot: type === "STOCK" ? 100 : 1,
      liquidityLevel: liquidityLevel as any,
      staleAfterHours,
    });
    await ctx.reply(
      `✅ <b>${html(x.symbol)}</b> berhasil ditambahkan.\n\nHarga pasar belum tersedia. Nilai beli hanya akan dianggap sebagai modal tercatat.`,
      { parse_mode: "HTML", ...backHome() },
    );
  });

  bot.on("text", async (ctx: any) => {
    if (ctx.message.text.startsWith("/")) return;
    const state = wizard.get(ctx.chat.id);
    if (!state) return;
    const u = await userFor(ctx);
    try {
      if (state.kind === "INCOME_AMOUNT" || state.kind === "EXPENSE_AMOUNT") {
        const amount = num(ctx.message.text);
        if (!(amount > 0))
          return ctx.reply("Masukkan nominal angka yang valid.");
        await sendAccounts(
          ctx,
          state.kind === "INCOME_AMOUNT" ? "income" : "expense",
          amount,
        );
        wizard.delete(ctx.chat.id);
        return;
      }
      if (state.kind === "INCOME_NOTE" || state.kind === "EXPENSE_NOTE") {
        const income = state.kind === "INCOME_NOTE";
        const selectedAccount = await prisma.financialAccount.findUnique({
          where: { id: state.accountId },
        });
        await financeService.record(u.id, {
          type: income ? "INCOME" : "EXPENSE",
          amount: state.amount,
          ...(income
            ? { destinationAccountId: state.accountId }
            : { sourceAccountId: state.accountId }),
          currency: selectedAccount?.currency ?? "IDR",
          description: ctx.message.text,
          idempotencyKey: `tg-${ctx.chat.id}-${ctx.message.message_id}`,
        });
        wizard.delete(ctx.chat.id);
        await ctx.reply(
          `${income ? "✅ Pendapatan" : "✅ Pengeluaran"} <b>${html(currency(state.amount))}</b> berhasil dicatat melalui <b>${html(state.accountName)}</b>.`,
          { parse_mode: "HTML", ...homeKeyboard() },
        );
        return;
      }
      if (state.kind === "MANUAL_PRICE") {
        const price = num(ctx.message.text);
        if (!(price > 0)) return ctx.reply("Harga tidak valid.");
        const instrument: any = await prisma.investmentInstrument.findUnique({
          where: { id: state.instrumentId },
        });
        await investmentService.addPrice(u.id, {
          instrumentId: state.instrumentId,
          price,
          currency: instrument?.currency ?? "IDR",
          source: "MANUAL",
          capturedAt: new Date(),
        });
        wizard.delete(ctx.chat.id);
        const p: any = await investmentService.portfolio(u.id);
        const item = p.items.find(
          (x: any) => x.instrumentId === state.instrumentId,
        );
        await ctx.reply(
          `✅ <b>HARGA ${html(state.symbol)} DIPERBARUI</b>\n\n💵 Harga terbaru: <b>${html(currency(price, instrument?.currency ?? "IDR"))}</b>\n📊 Nilai pasar: <b>${html(currency(item?.marketValue ?? 0, p.displayCurrency ?? "IDR"))}</b>\n${item?.unrealizedProfit >= 0 ? "📈" : "📉"} Untung/rugi: <b>${html(currency(item?.unrealizedProfit ?? 0, p.displayCurrency ?? "IDR"))}</b>\n🕒 ${html(nowLabel())}\n\nHarga ini disimpan manual dan hanya diperbarui saat kamu menekan tombol update.`,
          { parse_mode: "HTML", ...homeKeyboard() },
        );
        return;
      }
      if (state.kind === "FX_RATE") {
        const rate = Number(ctx.message.text.replace(",", "."));
        if (!(rate > 0)) return ctx.reply("Kurs tidak valid.");
        await upsertExchangeRate(
          u.id,
          state.baseCurrency,
          state.quoteCurrency,
          rate,
          "MANUAL",
        );
        wizard.delete(ctx.chat.id);
        await ctx.reply(
          `✅ Kurs tersimpan\n\n1 ${state.baseCurrency} = ${rate} ${state.quoteCurrency}\n\nData asli tetap menggunakan mata uang masing-masing. Dashboard akan menghitung ulang ke mata uang utama.`,
          { ...homeKeyboard() },
        );
        return;
      }
      if (state.kind === "PAY_DEBT_AMOUNT") {
        const amount = num(ctx.message.text);
        if (!(amount > 0)) return ctx.reply("Nominal tidak valid.");
        if (amount > state.suggestedAmount) {
          return ctx.reply(
            `Nominal melebihi sisa tagihan ${currency(state.suggestedAmount, state.currency)}.`,
          );
        }
        await askDebtPaymentDate(ctx, {
          debtId: state.debtId,
          debtName: state.debtName,
          installmentId: state.installmentId,
          period: state.period,
          amount,
          currency: state.currency,
        });
        return;
      }
      if (state.kind === "PAY_DEBT_CUSTOM_DATE") {
        const raw = ctx.message.text.trim();
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        if (!match) return ctx.reply("Format tanggal harus YYYY-MM-DD.");
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const paidAt = new Date(Date.UTC(year, month - 1, day, 5));
        if (
          paidAt.getUTCFullYear() !== year ||
          paidAt.getUTCMonth() !== month - 1 ||
          paidAt.getUTCDate() !== day
        ) {
          return ctx.reply("Tanggal tidak valid.");
        }
        if (paidAt.getTime() > Date.now()) {
          return ctx.reply("Tanggal pembayaran tidak boleh di masa depan.");
        }
        const { kind: _kind, ...draft } = state;
        await sendDebtPaymentBanks(ctx, { ...draft, paidAt });
        return;
      }
      if (state.kind === "DEBT_HEALTH_INCOME") {
        const income = num(ctx.message.text);
        if (!(income > 0)) {
          return ctx.reply("Pendapatan tetap harus lebih dari 0.");
        }
        wizard.set(ctx.chat.id, { kind: "DEBT_HEALTH_EXPENSES", income });
        await ctx.reply(
          "Masukkan total pengeluaran wajib per bulan di luar cicilan. Boleh 0.",
        );
        return;
      }
      if (state.kind === "DEBT_HEALTH_EXPENSES") {
        const expenses = num(ctx.message.text);
        if (!/\d/.test(ctx.message.text) || expenses < 0) {
          return ctx.reply("Pengeluaran wajib tidak valid.");
        }
        wizard.set(ctx.chat.id, {
          kind: "DEBT_HEALTH_BUFFER",
          income: state.income,
          expenses,
        });
        await ctx.reply(
          "Masukkan buffer pengaman bulanan yang tidak boleh dipakai untuk cicilan. Boleh 0.",
        );
        return;
      }
      if (state.kind === "DEBT_HEALTH_BUFFER") {
        const buffer = num(ctx.message.text);
        if (!/\d/.test(ctx.message.text) || buffer < 0) {
          return ctx.reply("Buffer pengaman tidak valid.");
        }
        await settingsService.update(
          u.id,
          {
            fixedMonthlyIncome: state.income,
            mandatoryMonthlyExpenses: state.expenses,
            debtSafetyBuffer: buffer,
          },
          "TELEGRAM",
        );
        wizard.delete(ctx.chat.id);
        await ctx.reply(
          `✅ Kemampuan bayar diperbarui.\n\nPendapatan tetap: <b>${html(currency(state.income))}</b>\nPengeluaran wajib: <b>${html(currency(state.expenses))}</b>\nBuffer pengaman: <b>${html(currency(buffer))}</b>\n\nBuka kembali detail utang untuk melihat status sehat atau mencekik terbaru.`,
          { parse_mode: "HTML", ...homeKeyboard() },
        );
        return;
      }
    } catch (e: any) {
      await ctx.reply(`❌ ${e.message}`);
    }
  });

  bot.catch((err: unknown) => console.error("Telegram bot error", err));
  await bot.launch();
  console.log("Telegram bot started (interactive polling)");
}

export async function stopTelegramBot() {
  if (bot) bot.stop();
}
