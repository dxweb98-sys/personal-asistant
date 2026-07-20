import { Markup, Telegraf } from "telegraf";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { debtService } from "../debts/debt.service.js";
import { financeService } from "../finance/finance.service.js";
import { investmentService } from "../investments/investment.service.js";
import { settingsService } from "../settings/settings.service.js";

let bot: Telegraf | null = null;

type DebtDraft = {
  name?: string;
  creditor?: string;
  originalPrincipal?: number;
  currency?: string;
  paymentPolicy?: "FIXED" | "FLEXIBLE" | "NEGOTIABLE";
  fixedMonthlyAmount?: number;
  tenorMonths?: number;
  dueDay?: number;
};

type AccountDraft = {
  type?: "CASH" | "BANK" | "E_WALLET" | "CREDIT_CARD" | "PAYLATER" | "CRYPTO_WALLET";
  name?: string;
  currency?: string;
};

type State =
  | { kind: "DEBT_NAME"; draft: DebtDraft }
  | { kind: "DEBT_CREDITOR"; draft: DebtDraft }
  | { kind: "DEBT_PRINCIPAL"; draft: DebtDraft }
  | { kind: "DEBT_FIXED"; draft: DebtDraft }
  | { kind: "DEBT_TENOR"; draft: DebtDraft }
  | { kind: "DEBT_DUE"; draft: DebtDraft }
  | { kind: "PAY_CUSTOM"; debtId: string }
  | { kind: "ACCOUNT_NAME"; draft: AccountDraft }
  | { kind: "ACCOUNT_BALANCE"; draft: AccountDraft };

type PendingPayment = {
  debtId: string;
  amount: number;
  accountId?: string;
};

const states = new Map<number, State>();
const pendingPayments = new Map<number, PendingPayment>();

const html = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const parseNumber = (text: string) =>
  Number(
    text
      .replace(/[^0-9.,-]/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );

const money = (value: number, code = "IDR") => {
  try {
    return new Intl.NumberFormat(code === "IDR" ? "id-ID" : "en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: code === "IDR" ? 0 : 6,
    }).format(value || 0);
  } catch {
    return `${code} ${value}`;
  }
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(value);

async function userFor(ctx: any) {
  const telegramChatId = BigInt(ctx.chat.id);
  const telegramUsername = ctx.from?.username ?? null;
  const name =
    [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") ||
    telegramUsername ||
    "Pengguna";

  const user = await prisma.user.upsert({
    where: { telegramChatId },
    create: { name, telegramChatId, telegramUsername },
    update: { name, telegramUsername },
  });

  await settingsService.get(user.id);
  return user;
}

const homeKeyboard = () =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback("✍️ Catat Transaksi", "menu:record"),
      Markup.button.callback("💳 Utang & Tagihan", "menu:debt"),
    ],
    [
      Markup.button.callback("📊 Ringkasan", "menu:summary"),
      Markup.button.callback("📈 Investasi", "menu:investment"),
    ],
    [
      Markup.button.callback("🗂 Data & Master", "menu:master"),
      Markup.button.callback("⚙️ Pengaturan", "menu:settings"),
    ],
  ]);

const backHome = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("🏠 Kembali ke Beranda", "menu:home")],
  ]);

const backDebt = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ Menu Utang", "menu:debt")],
    [Markup.button.callback("🏠 Beranda", "menu:home")],
  ]);

async function sendHome(ctx: any, edit = false) {
  const user = await userFor(ctx);
  const pref: any = await settingsService.get(user.id);
  const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const cashflow = await financeService.cashflow(user.id, from, new Date());
  const debts: any[] = await debtService.list(user.id);
  const totalDebt = debts
    .filter(
      (debt) =>
        !["PAID", "CANCELLED"].includes(debt.status) &&
        (debt.currency ?? "IDR") === pref.baseCurrency,
    )
    .reduce((total, debt) => total + Number(debt.remainingPrincipal), 0);

  const text = `🏠 <b>Beranda Keuangan</b>\n\nHalo, <b>${html(user.name)}</b>. Mau mengelola bagian mana hari ini?\n\n📥 Pemasukan bulan ini: <b>${html(money(cashflow.income, pref.baseCurrency))}</b>\n📤 Pengeluaran bulan ini: <b>${html(money(cashflow.expense, pref.baseCurrency))}</b>\n💳 Sisa utang ${html(pref.baseCurrency)}: <b>${html(money(totalDebt, pref.baseCurrency))}</b>\n\nPilih menu di bawah agar pencatatan lebih terarah.`;

  const options = { parse_mode: "HTML" as const, ...homeKeyboard() };
  if (edit) await ctx.editMessageText(text, options);
  else await ctx.reply(text, options);
}

async function sendDebtMenu(ctx: any) {
  const user = await userFor(ctx);
  const debts: any[] = await debtService.list(user.id);
  const active = debts.filter(
    (debt) => !["PAID", "CANCELLED"].includes(debt.status),
  );
  const overdue = active.filter((debt) => debt.status === "OVERDUE").length;
  const totals = new Map<string, number>();

  for (const debt of active) {
    const code = debt.currency ?? "IDR";
    totals.set(
      code,
      (totals.get(code) ?? 0) + Number(debt.remainingPrincipal),
    );
  }

  const summary =
    [...totals.entries()]
      .map(([code, value]) => `• ${money(value, code)}`)
      .join("\n") || "Belum ada utang aktif";

  await ctx.reply(
    `💳 <b>Utang & Tagihan</b>\n\nTambah utang, lihat detail cicilan, cek tagihan terdekat, atau catat pembayaran dari satu tempat.\n\nUtang aktif: <b>${active.length}</b>\nTerlambat: <b>${overdue}</b>\nSisa kewajiban:\n${html(summary)}`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("➕ Tambah Utang", "debt:add"),
          Markup.button.callback("📋 Daftar Utang", "debt:list"),
        ],
        [
          Markup.button.callback("💸 Bayar Utang", "debt:pay:list"),
          Markup.button.callback("📅 Tagihan Terdekat", "debt:upcoming"),
        ],
        [Markup.button.callback("🏠 Beranda", "menu:home")],
      ]),
    },
  );
}

async function sendDebtList(ctx: any, paymentMode = false) {
  const user = await userFor(ctx);
  const debts: any[] = await debtService.list(user.id);
  const active = debts.filter(
    (debt) => !["PAID", "CANCELLED"].includes(debt.status),
  );

  if (!active.length) {
    await ctx.reply(
      "Belum ada utang aktif. Tambahkan utang pertama agar cicilan dan pembayaran dapat dipantau.",
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Tambah Utang", "debt:add")],
          [Markup.button.callback("⬅️ Menu Utang", "menu:debt")],
        ]),
      },
    );
    return;
  }

  const rows = active.map((debt) => [
    Markup.button.callback(
      `${debt.status === "OVERDUE" ? "🚨" : "💳"} ${debt.name} • ${money(Number(debt.remainingPrincipal), debt.currency ?? "IDR")}`,
      `${paymentMode ? "debt:pay" : "debt:detail"}:${debt.id}`,
    ),
  ]);
  rows.push([Markup.button.callback("⬅️ Menu Utang", "menu:debt")]);

  await ctx.reply(
    paymentMode
      ? "Pilih utang yang ingin dibayar:"
      : "Pilih utang untuk melihat detail:",
    { ...Markup.inlineKeyboard(rows) },
  );
}

async function sendDebtDetail(ctx: any, debtId: string) {
  const user = await userFor(ctx);
  const debt: any = await debtService.find(user.id, debtId);
  const original = Number(debt.originalPrincipal);
  const remaining = Number(debt.remainingPrincipal);
  const paid = Math.max(0, original - remaining);
  const progress = original > 0 ? Math.min(100, (paid / original) * 100) : 0;
  const nextInstallment = debt.installments?.find((installment: any) =>
    ["UPCOMING", "DUE", "PARTIAL", "OVERDUE", "RESCHEDULED"].includes(
      installment.status,
    ),
  );
  const history =
    (debt.payments ?? [])
      .slice(0, 3)
      .map(
        (payment: any) =>
          `• ${formatDate(payment.paidAt)} — ${money(Number(payment.amount), debt.currency ?? "IDR")}`,
      )
      .join("\n") || "Belum ada pembayaran";

  await ctx.reply(
    `💳 <b>${html(debt.name)}</b>\n\nPemberi pinjaman: <b>${html(debt.creditor)}</b>\nPola pembayaran: <b>${html(debt.paymentPolicy)}</b>\nStatus: <b>${html(debt.status)}</b>\nMata uang: <b>${html(debt.currency ?? "IDR")}</b>\n\nNilai awal: <b>${html(money(original, debt.currency ?? "IDR"))}</b>\nSudah dibayar: <b>${html(money(paid, debt.currency ?? "IDR"))}</b>\nSisa: <b>${html(money(remaining, debt.currency ?? "IDR"))}</b>\nProgres: <b>${progress.toFixed(1)}%</b>\n\n${
      nextInstallment
        ? `Tagihan berikutnya: <b>${html(money(Number(nextInstallment.scheduledPrincipal) - Number(nextInstallment.paidPrincipal), debt.currency ?? "IDR"))}</b>\nJatuh tempo: <b>${html(formatDate(nextInstallment.dueDate))}</b>`
        : "Tidak ada jadwal cicilan aktif."
    }\n\nPembayaran terakhir:\n${html(history)}`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "💸 Catat Pembayaran",
            `debt:pay:${debt.id}`,
          ),
        ],
        [
          Markup.button.callback(
            "📅 Lihat Jadwal",
            `debt:schedule:${debt.id}`,
          ),
          Markup.button.callback(
            "🧾 Riwayat Pembayaran",
            `debt:history:${debt.id}`,
          ),
        ],
        [
          Markup.button.callback("⬅️ Daftar Utang", "debt:list"),
          Markup.button.callback("🏠 Beranda", "menu:home"),
        ],
      ]),
    },
  );
}

async function sendAccountList(ctx: any, forPayment = false) {
  const user = await userFor(ctx);
  const accounts: any[] = await financeService.listAccounts(user.id);

  if (!accounts.length) {
    await ctx.reply(
      "Belum ada akun keuangan. Buat akun pertama agar pembayaran dapat memilih sumber dana.",
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Buat Akun", "account:add")],
          [Markup.button.callback("🏠 Beranda", "menu:home")],
        ]),
      },
    );
    return;
  }

  const rows = accounts.map((account) => [
    Markup.button.callback(
      `${account.type === "CASH" ? "💵" : account.type === "BANK" ? "🏦" : "👛"} ${account.name} • ${money(Number(account.currentBalance), account.currency)}`,
      forPayment
        ? `debt:pay:account:${account.id}`
        : `account:view:${account.id}`,
    ),
  ]);
  rows.push([Markup.button.callback("🏠 Beranda", "menu:home")]);
  await ctx.reply(
    forPayment
      ? "Pilih akun yang digunakan untuk membayar:"
      : "Akun keuangan kamu:",
    { ...Markup.inlineKeyboard(rows) },
  );
}

async function sendMasterMenu(ctx: any) {
  await ctx.reply(
    "🗂 <b>Data & Master</b>\n\nTambah data dasar di sini. Setelah dibuat, data akan muncul otomatis saat mencatat transaksi.",
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("🏦 Tambah Akun", "account:add"),
          Markup.button.callback("💳 Tambah Utang", "debt:add"),
        ],
        [
          Markup.button.callback("🏢 Tambah Platform", "platform:add:help"),
          Markup.button.callback(
            "📈 Tambah Investasi",
            "investment:add:help",
          ),
        ],
        [
          Markup.button.callback("📋 Lihat Akun", "account:list"),
          Markup.button.callback("📋 Lihat Utang", "debt:list"),
        ],
        [Markup.button.callback("🏠 Beranda", "menu:home")],
      ]),
    },
  );
}

async function showDebtConfirmation(ctx: any, draft: DebtDraft) {
  await ctx.reply(
    `🔎 <b>Periksa Data Utang</b>\n\nNama: <b>${html(draft.name)}</b>\nPemberi pinjaman: <b>${html(draft.creditor)}</b>\nNilai awal: <b>${html(money(draft.originalPrincipal ?? 0, draft.currency ?? "IDR"))}</b>\nPola pembayaran: <b>${html(draft.paymentPolicy ?? "FLEXIBLE")}</b>${
      draft.paymentPolicy === "FIXED"
        ? `\nCicilan bulanan: <b>${html(money(draft.fixedMonthlyAmount ?? 0, draft.currency ?? "IDR"))}</b>\nTenor: <b>${draft.tenorMonths ?? 0} bulan</b>\nJatuh tempo tanggal: <b>${draft.dueDay ?? 1}</b>`
        : `\nJatuh tempo tanggal: <b>${draft.dueDay ?? "Tidak tetap"}</b>`
    }\n\nSimpan utang ini?`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Simpan Utang", "debt:add:save")],
        [Markup.button.callback("❌ Batal", "menu:debt")],
      ]),
    },
  );
}

export async function startTelegramBot() {
  if (!env.TELEGRAM_ENABLED || !env.TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot disabled");
    return;
  }

  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  bot.start((ctx: any) => sendHome(ctx));
  bot.command("menu", (ctx: any) => sendHome(ctx));
  bot.command("utang", (ctx: any) => sendDebtMenu(ctx));
  bot.command("hutang", (ctx: any) => sendDebtMenu(ctx));

  bot.action("menu:home", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendHome(ctx, true);
  });
  bot.action("menu:debt", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendDebtMenu(ctx);
  });
  bot.action("menu:master", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendMasterMenu(ctx);
  });
  bot.action("menu:record", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "✍️ <b>Catat Transaksi</b>\n\nPembayaran utang dipisahkan agar otomatis terhubung dengan master utang.",
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("📥 Pendapatan", "record:income"),
            Markup.button.callback("📤 Pengeluaran", "record:expense"),
          ],
          [
            Markup.button.callback(
              "💸 Pembayaran Utang",
              "debt:pay:list",
            ),
          ],
          [Markup.button.callback("🏠 Beranda", "menu:home")],
        ]),
      },
    );
  });
  bot.action("menu:summary", async (ctx: any) => {
    await ctx.answerCbQuery();
    const user = await userFor(ctx);
    const pref: any = await settingsService.get(user.id);
    const cashflow = await financeService.cashflow(
      user.id,
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      new Date(),
    );
    await ctx.reply(
      `📊 <b>Ringkasan Bulan Ini</b>\n\nPemasukan: <b>${html(money(cashflow.income, pref.baseCurrency))}</b>\nPengeluaran: <b>${html(money(cashflow.expense, pref.baseCurrency))}</b>\nPembayaran utang: <b>${html(money(cashflow.debtPayment, pref.baseCurrency))}</b>\nArus kas bersih: <b>${html(money(cashflow.netCashFlow, pref.baseCurrency))}</b>`,
      { parse_mode: "HTML", ...backHome() },
    );
  });
  bot.action("menu:investment", async (ctx: any) => {
    await ctx.answerCbQuery();
    const user = await userFor(ctx);
    const portfolio: any = await investmentService.portfolio(user.id);
    await ctx.reply(
      `📈 <b>Investasi</b>\n\nNilai pasar terkonfirmasi: <b>${html(money(Number(portfolio.confirmedMarketValue ?? 0), portfolio.displayCurrency ?? "IDR"))}</b>\nModal belum tervaluasi: <b>${html(money(Number(portfolio.unpricedInvestmentCost ?? 0), portfolio.displayCurrency ?? "IDR"))}</b>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🗂 Data & Master", "menu:master")],
          [Markup.button.callback("🏠 Beranda", "menu:home")],
        ]),
      },
    );
  });
  bot.action("menu:settings", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "⚙️ Pengaturan lanjutan masih menggunakan implementasi sebelumnya. Fokus versi ini adalah merapikan alur utang dan pembayaran.",
      { ...backHome() },
    );
  });

  bot.action("debt:list", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendDebtList(ctx);
  });
  bot.action("debt:pay:list", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendDebtList(ctx, true);
  });
  bot.action(/^debt:detail:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendDebtDetail(ctx, ctx.match[1]);
  });
  bot.action("debt:upcoming", async (ctx: any) => {
    await ctx.answerCbQuery();
    const user = await userFor(ctx);
    const debts: any[] = await prisma.debt.findMany({
      where: {
        userId: user.id,
        status: { notIn: ["PAID", "CANCELLED"] },
      },
      include: {
        installments: {
          where: {
            status: {
              in: ["UPCOMING", "DUE", "PARTIAL", "OVERDUE", "RESCHEDULED"],
            },
          },
          orderBy: { dueDate: "asc" },
          take: 1,
        },
      },
    });
    const upcoming = debts
      .map((debt) => ({ debt, installment: debt.installments[0] }))
      .filter((item) => item.installment)
      .sort(
        (a, b) =>
          a.installment.dueDate.getTime() - b.installment.dueDate.getTime(),
      )
      .slice(0, 10);
    const lines =
      upcoming
        .map(
          ({ debt, installment }) =>
            `• <b>${html(debt.name)}</b>\n  ${html(formatDate(installment.dueDate))} • ${html(money(Number(installment.scheduledPrincipal) - Number(installment.paidPrincipal), debt.currency ?? "IDR"))}`,
        )
        .join("\n\n") || "Belum ada jadwal cicilan aktif.";
    await ctx.reply(`📅 <b>Tagihan Terdekat</b>\n\n${lines}`, {
      parse_mode: "HTML",
      ...backDebt(),
    });
  });
  bot.action(/^debt:schedule:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const user = await userFor(ctx);
    const debt: any = await debtService.find(user.id, ctx.match[1]);
    const lines =
      (debt.installments ?? [])
        .slice(0, 12)
        .map(
          (installment: any) =>
            `• ${html(installment.period)} — ${html(formatDate(installment.dueDate))}\n  ${html(money(Number(installment.scheduledPrincipal), debt.currency ?? "IDR"))} • ${html(installment.status)}`,
        )
        .join("\n\n") || "Belum ada jadwal.";
    await ctx.reply(`📅 <b>Jadwal ${html(debt.name)}</b>\n\n${lines}`, {
      parse_mode: "HTML",
      ...backDebt(),
    });
  });
  bot.action(/^debt:history:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const user = await userFor(ctx);
    const debt: any = await debtService.find(user.id, ctx.match[1]);
    const lines =
      (debt.payments ?? [])
        .slice(0, 20)
        .map(
          (payment: any) =>
            `• ${html(formatDate(payment.paidAt))} — <b>${html(money(Number(payment.amount), debt.currency ?? "IDR"))}</b>${payment.note ? `\n  ${html(payment.note)}` : ""}`,
        )
        .join("\n\n") || "Belum ada pembayaran.";
    await ctx.reply(
      `🧾 <b>Riwayat ${html(debt.name)}</b>\n\n${lines}`,
      { parse_mode: "HTML", ...backDebt() },
    );
  });

  bot.action("debt:add", async (ctx: any) => {
    await ctx.answerCbQuery();
    states.set(ctx.chat!.id, { kind: "DEBT_NAME", draft: {} });
    await ctx.reply(
      "➕ <b>Tambah Utang</b>\n\nApa nama utangnya?\nContoh: Cicilan Motor, Kartu Kredit BCA, atau Shopee PayLater",
      { parse_mode: "HTML" },
    );
  });
  bot.action(
    /^debt:add:currency:(IDR|USD|SGD|EUR|JPY|GBP)$/,
    async (ctx: any) => {
      const state = states.get(ctx.chat!.id);
      if (!state || state.kind !== "DEBT_PRINCIPAL") return;
      states.set(ctx.chat!.id, {
        kind: "DEBT_PRINCIPAL",
        draft: { ...state.draft, currency: ctx.match[1] },
      });
      await ctx.answerCbQuery();
      await ctx.reply(
        `Masukkan total utang dalam ${ctx.match[1]}. Contoh: <code>18000000</code>`,
        { parse_mode: "HTML" },
      );
    },
  );
  bot.action(
    /^debt:add:policy:(FIXED|FLEXIBLE|NEGOTIABLE)$/,
    async (ctx: any) => {
      const state = states.get(ctx.chat!.id);
      if (!state || state.kind !== "DEBT_FIXED") return;
      const paymentPolicy = ctx.match[1] as DebtDraft["paymentPolicy"];
      const draft = { ...state.draft, paymentPolicy };
      await ctx.answerCbQuery();
      if (paymentPolicy === "FIXED") {
        states.set(ctx.chat!.id, { kind: "DEBT_FIXED", draft });
        await ctx.reply("Berapa nominal cicilan tetap per bulan?");
      } else {
        states.set(ctx.chat!.id, { kind: "DEBT_DUE", draft });
        await ctx.reply(
          "Tanggal berapa biasanya jatuh tempo? Masukkan 1-31. Ketik 0 jika tidak ada tanggal tetap.",
        );
      }
    },
  );
  bot.action("debt:add:save", async (ctx: any) => {
    const state = states.get(ctx.chat!.id);
    if (!state || state.kind !== "DEBT_DUE") return;
    const user = await userFor(ctx);
    const draft = state.draft;
    const startDate = new Date();

    await debtService.create(user.id, {
      name: draft.name,
      creditor: draft.creditor,
      originalPrincipal: draft.originalPrincipal,
      remainingPrincipal: draft.originalPrincipal,
      currency: draft.currency ?? "IDR",
      paymentPolicy: draft.paymentPolicy ?? "FLEXIBLE",
      fixedMonthlyAmount: draft.fixedMonthlyAmount ?? 0,
      minimumMonthlyAmount: 0,
      targetMonthlyAmount: draft.fixedMonthlyAmount ?? 0,
      interestRateAnnual: 0,
      startDate,
      dueDay: draft.dueDay || undefined,
      tenorMonths: draft.tenorMonths || undefined,
      priority: "NORMAL",
      canBeNegotiated: draft.paymentPolicy === "NEGOTIABLE",
      allocationPolicy: "CURRENT_INSTALLMENT_FIRST",
      status: "ACTIVE",
      generateInstallments:
        draft.paymentPolicy === "FIXED" &&
        Boolean(draft.tenorMonths && draft.dueDay),
    });

    states.delete(ctx.chat!.id);
    await ctx.answerCbQuery("Utang disimpan");
    await ctx.reply(
      `✅ Utang <b>${html(draft.name)}</b> berhasil ditambahkan.`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📋 Lihat Daftar Utang", "debt:list")],
          [Markup.button.callback("🏠 Beranda", "menu:home")],
        ]),
      },
    );
  });

  bot.action(/^debt:pay:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const user = await userFor(ctx);
    const debt: any = await debtService.find(user.id, ctx.match[1]);
    const nextInstallment = debt.installments?.find((installment: any) =>
      ["UPCOMING", "DUE", "PARTIAL", "OVERDUE", "RESCHEDULED"].includes(
        installment.status,
      ),
    );
    const suggested = nextInstallment
      ? Math.max(
          0,
          Number(nextInstallment.scheduledPrincipal) -
            Number(nextInstallment.paidPrincipal),
        )
      : Number(debt.fixedMonthlyAmount || 0);
    const amountButtons = [];
    if (suggested > 0) {
      amountButtons.push(
        Markup.button.callback(
          `Cicilan ${money(suggested, debt.currency ?? "IDR")}`,
          `debt:pay:amount:${debt.id}:${suggested}`,
        ),
      );
    }
    amountButtons.push(
      Markup.button.callback(
        "Lunasi",
        `debt:pay:amount:${debt.id}:${Number(debt.remainingPrincipal)}`,
      ),
    );
    await ctx.reply(
      `💸 <b>Bayar ${html(debt.name)}</b>\n\nSisa utang: <b>${html(money(Number(debt.remainingPrincipal), debt.currency ?? "IDR"))}</b>\nPilih nominal pembayaran:`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          amountButtons,
          [
            Markup.button.callback(
              "⌨️ Nominal Lain",
              `debt:pay:custom:${debt.id}`,
            ),
          ],
          [Markup.button.callback("⬅️ Kembali", "debt:list")],
        ]),
      },
    );
  });
  bot.action(/^debt:pay:custom:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    states.set(ctx.chat!.id, {
      kind: "PAY_CUSTOM",
      debtId: ctx.match[1],
    });
    await ctx.reply("Masukkan nominal pembayaran:");
  });
  bot.action(/^debt:pay:amount:([^:]+):(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    pendingPayments.set(ctx.chat!.id, {
      debtId: ctx.match[1],
      amount: Number(ctx.match[2]),
    });
    await sendAccountList(ctx, true);
  });
  bot.action(/^debt:pay:account:(.+)$/, async (ctx: any) => {
    const pending = pendingPayments.get(ctx.chat!.id);
    if (!pending) return;
    const user = await userFor(ctx);
    const account: any = await prisma.financialAccount.findFirst({
      where: { id: ctx.match[1], userId: user.id },
    });
    const debt: any = await debtService.find(user.id, pending.debtId);
    if (!account) return ctx.reply("Akun tidak ditemukan.");
    pendingPayments.set(ctx.chat!.id, {
      ...pending,
      accountId: account.id,
    });
    await ctx.answerCbQuery();
    await ctx.reply(
      `🔎 <b>Konfirmasi Pembayaran</b>\n\nUtang: <b>${html(debt.name)}</b>\nNominal: <b>${html(money(pending.amount, debt.currency ?? "IDR"))}</b>\nDari akun: <b>${html(account.name)}</b>\nSaldo akun: <b>${html(money(Number(account.currentBalance), account.currency))}</b>\n\nLanjutkan pembayaran?`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Simpan Pembayaran",
              "debt:pay:confirm",
            ),
          ],
          [Markup.button.callback("❌ Batal", "menu:debt")],
        ]),
      },
    );
  });
  bot.action("debt:pay:confirm", async (ctx: any) => {
    const pending = pendingPayments.get(ctx.chat!.id);
    if (!pending?.accountId) return;
    const user = await userFor(ctx);
    const account: any = await prisma.financialAccount.findFirst({
      where: { id: pending.accountId, userId: user.id },
    });
    const debt: any = await debtService.find(user.id, pending.debtId);
    if (!account) return ctx.reply("Akun tidak ditemukan.");
    if (account.currency !== (debt.currency ?? "IDR")) {
      return ctx.reply(
        `Mata uang akun (${account.currency}) harus sama dengan mata uang utang (${debt.currency ?? "IDR"}).`,
      );
    }

    const idempotencyKey = `tg-debt-${ctx.chat!.id}-${Date.now()}`;
    const result: any = await debtService.pay(user.id, pending.debtId, {
      amount: pending.amount,
      paidAt: new Date(),
      source: "TELEGRAM",
      note: `Pembayaran dari ${account.name}`,
      idempotencyKey,
    });
    await financeService.record(user.id, {
      type: "DEBT_PAYMENT",
      sourceAccountId: account.id,
      debtId: pending.debtId,
      amount: pending.amount,
      currency: account.currency,
      occurredAt: new Date(),
      description: `Pembayaran ${debt.name}`,
      idempotencyKey: `${idempotencyKey}-cash`,
    });

    pendingPayments.delete(ctx.chat!.id);
    await ctx.answerCbQuery("Pembayaran tersimpan");
    const remaining = Number(
      result.debt?.remainingPrincipal ??
        Math.max(0, Number(debt.remainingPrincipal) - pending.amount),
    );
    await ctx.reply(
      `✅ Pembayaran berhasil dicatat.\n\nUtang: <b>${html(debt.name)}</b>\nDibayar: <b>${html(money(pending.amount, debt.currency ?? "IDR"))}</b>\nSisa: <b>${html(money(remaining, debt.currency ?? "IDR"))}</b>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "📄 Lihat Detail",
              `debt:detail:${debt.id}`,
            ),
          ],
          [Markup.button.callback("🏠 Beranda", "menu:home")],
        ]),
      },
    );
  });

  bot.action("account:add", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply("Pilih jenis akun:", {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("💵 Tunai", "account:add:type:CASH"),
          Markup.button.callback("🏦 Bank", "account:add:type:BANK"),
        ],
        [
          Markup.button.callback(
            "👛 E-Wallet",
            "account:add:type:E_WALLET",
          ),
          Markup.button.callback(
            "💳 Kartu Kredit",
            "account:add:type:CREDIT_CARD",
          ),
        ],
        [
          Markup.button.callback(
            "🧾 Paylater",
            "account:add:type:PAYLATER",
          ),
          Markup.button.callback(
            "🪙 Crypto Wallet",
            "account:add:type:CRYPTO_WALLET",
          ),
        ],
      ]),
    });
  });
  bot.action(
    /^account:add:type:(CASH|BANK|E_WALLET|CREDIT_CARD|PAYLATER|CRYPTO_WALLET)$/,
    async (ctx: any) => {
      await ctx.answerCbQuery();
      states.set(ctx.chat!.id, {
        kind: "ACCOUNT_NAME",
        draft: { type: ctx.match[1] as AccountDraft["type"] },
      });
      await ctx.reply(
        "Apa nama akun ini? Contoh: BCA Utama, Uang Tunai, GoPay, atau BCA Credit Card",
      );
    },
  );
  bot.action(
    /^account:add:currency:(IDR|USD|SGD|EUR|JPY|GBP|USDT)$/,
    async (ctx: any) => {
      const state = states.get(ctx.chat!.id);
      if (!state || state.kind !== "ACCOUNT_BALANCE") return;
      states.set(ctx.chat!.id, {
        kind: "ACCOUNT_BALANCE",
        draft: { ...state.draft, currency: ctx.match[1] },
      });
      await ctx.answerCbQuery();
      await ctx.reply(
        `Berapa saldo awal akun dalam ${ctx.match[1]}? Masukkan 0 jika kosong.`,
      );
    },
  );
  bot.action("account:list", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendAccountList(ctx);
  });
  bot.action(/^account:view:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const user = await userFor(ctx);
    const account: any = await prisma.financialAccount.findFirst({
      where: { id: ctx.match[1], userId: user.id },
    });
    if (!account) return ctx.reply("Akun tidak ditemukan.");
    await ctx.reply(
      `🏦 <b>${html(account.name)}</b>\n\nJenis: <b>${html(account.type)}</b>\nMata uang: <b>${html(account.currency)}</b>\nSaldo: <b>${html(money(Number(account.currentBalance), account.currency))}</b>`,
      { parse_mode: "HTML", ...backHome() },
    );
  });

  bot.action("platform:add:help", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Untuk sementara platform dapat ditambahkan dengan command:\n<code>/tambahplatform Stockbit | BROKER | RDN BCA | Akun utama</code>",
      { parse_mode: "HTML", ...backHome() },
    );
  });
  bot.action("investment:add:help", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Untuk sementara instrumen investasi dapat ditambahkan dengan command:\n<code>/tambahinvestasi BBCA | Bank Central Asia | STOCK | IDX</code>",
      { parse_mode: "HTML", ...backHome() },
    );
  });
  bot.action("record:income", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Flow pendapatan akan dirapikan setelah modul utang stabil. Fokus perubahan ini adalah master utang, detail cicilan, dan pembayaran.",
      { ...backHome() },
    );
  });
  bot.action("record:expense", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Pengeluaran yang merupakan pembayaran utang gunakan menu <b>Pembayaran Utang</b> agar otomatis terhubung dengan master utang.",
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "💸 Pembayaran Utang",
              "debt:pay:list",
            ),
          ],
          [Markup.button.callback("🏠 Beranda", "menu:home")],
        ]),
      },
    );
  });

  bot.on("text", async (ctx: any) => {
    if (ctx.message.text.startsWith("/")) return;
    const state = states.get(ctx.chat.id);
    if (!state) return;

    try {
      if (state.kind === "DEBT_NAME") {
        states.set(ctx.chat.id, {
          kind: "DEBT_CREDITOR",
          draft: { ...state.draft, name: ctx.message.text.trim() },
        });
        await ctx.reply(
          "Siapa pemberi pinjaman atau penyedia cicilannya? Contoh: BCA, Leasing ABC, Shopee PayLater, atau Keluarga",
        );
        return;
      }

      if (state.kind === "DEBT_CREDITOR") {
        states.set(ctx.chat.id, {
          kind: "DEBT_PRINCIPAL",
          draft: { ...state.draft, creditor: ctx.message.text.trim() },
        });
        await ctx.reply("Pilih mata uang utang:", {
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("IDR", "debt:add:currency:IDR"),
              Markup.button.callback("USD", "debt:add:currency:USD"),
            ],
            [
              Markup.button.callback("SGD", "debt:add:currency:SGD"),
              Markup.button.callback("EUR", "debt:add:currency:EUR"),
            ],
          ]),
        });
        return;
      }

      if (state.kind === "DEBT_PRINCIPAL") {
        const originalPrincipal = parseNumber(ctx.message.text);
        if (!(originalPrincipal > 0)) {
          await ctx.reply("Nominal tidak valid. Masukkan angka lebih dari 0.");
          return;
        }
        states.set(ctx.chat.id, {
          kind: "DEBT_FIXED",
          draft: { ...state.draft, originalPrincipal },
        });
        await ctx.reply("Bagaimana pola pembayarannya?", {
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "📅 Cicilan Tetap",
                "debt:add:policy:FIXED",
              ),
            ],
            [
              Markup.button.callback(
                "🔄 Fleksibel",
                "debt:add:policy:FLEXIBLE",
              ),
              Markup.button.callback(
                "🤝 Bisa Dinegosiasi",
                "debt:add:policy:NEGOTIABLE",
              ),
            ],
          ]),
        });
        return;
      }

      if (state.kind === "DEBT_FIXED") {
        const fixedMonthlyAmount = parseNumber(ctx.message.text);
        if (!(fixedMonthlyAmount > 0)) {
          await ctx.reply("Nominal cicilan tidak valid.");
          return;
        }
        states.set(ctx.chat.id, {
          kind: "DEBT_TENOR",
          draft: { ...state.draft, fixedMonthlyAmount },
        });
        await ctx.reply("Berapa tenor dalam bulan? Contoh: 24");
        return;
      }

      if (state.kind === "DEBT_TENOR") {
        const tenorMonths = Math.trunc(parseNumber(ctx.message.text));
        if (!(tenorMonths > 0)) {
          await ctx.reply("Tenor tidak valid.");
          return;
        }
        states.set(ctx.chat.id, {
          kind: "DEBT_DUE",
          draft: { ...state.draft, tenorMonths },
        });
        await ctx.reply("Jatuh tempo setiap tanggal berapa? Masukkan 1-31.");
        return;
      }

      if (state.kind === "DEBT_DUE") {
        const dueDay = Math.trunc(parseNumber(ctx.message.text));
        if (dueDay < 0 || dueDay > 31) {
          await ctx.reply(
            "Tanggal harus 1-31, atau 0 jika tidak ada tanggal tetap.",
          );
          return;
        }
        const draft = { ...state.draft, dueDay: dueDay || undefined };
        states.set(ctx.chat.id, { kind: "DEBT_DUE", draft });
        await showDebtConfirmation(ctx, draft);
        return;
      }

      if (state.kind === "PAY_CUSTOM") {
        const amount = parseNumber(ctx.message.text);
        if (!(amount > 0)) {
          await ctx.reply("Nominal tidak valid.");
          return;
        }
        pendingPayments.set(ctx.chat.id, {
          debtId: state.debtId,
          amount,
        });
        states.delete(ctx.chat.id);
        await sendAccountList(ctx, true);
        return;
      }

      if (state.kind === "ACCOUNT_NAME") {
        states.set(ctx.chat.id, {
          kind: "ACCOUNT_BALANCE",
          draft: { ...state.draft, name: ctx.message.text.trim() },
        });
        await ctx.reply("Pilih mata uang akun:", {
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("IDR", "account:add:currency:IDR"),
              Markup.button.callback("USD", "account:add:currency:USD"),
            ],
            [
              Markup.button.callback("SGD", "account:add:currency:SGD"),
              Markup.button.callback("EUR", "account:add:currency:EUR"),
            ],
            [
              Markup.button.callback("USDT", "account:add:currency:USDT"),
            ],
          ]),
        });
        return;
      }

      if (state.kind === "ACCOUNT_BALANCE") {
        const openingBalance = parseNumber(ctx.message.text);
        if (Number.isNaN(openingBalance)) {
          await ctx.reply("Saldo awal tidak valid.");
          return;
        }
        const user = await userFor(ctx);
        const draft = state.draft;
        await financeService.createAccount(user.id, {
          name: draft.name!,
          type: draft.type!,
          currency: draft.currency ?? "IDR",
          openingBalance,
        });
        states.delete(ctx.chat.id);
        await ctx.reply(
          `✅ Akun <b>${html(draft.name)}</b> berhasil dibuat dengan saldo awal <b>${html(money(openingBalance, draft.currency ?? "IDR"))}</b>.`,
          {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("📋 Lihat Akun", "account:list")],
              [Markup.button.callback("🏠 Beranda", "menu:home")],
            ]),
          },
        );
      }
    } catch (error: any) {
      await ctx.reply(`❌ ${html(error?.message ?? "Terjadi kesalahan")}`, {
        parse_mode: "HTML",
      });
    }
  });

  bot.catch((error) => console.error("Telegram bot error", error));
  await bot.launch();
  console.log("Telegram bot v2 started (interactive polling)");
}

export async function stopTelegramBot() {
  if (bot) bot.stop();
}
