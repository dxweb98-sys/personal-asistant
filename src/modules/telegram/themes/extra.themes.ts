import { TelegramThemeDefinition } from "./theme.types.js";
const base = (
  key: any,
  name: string,
  emoji: string,
  description: string,
  homeTitle: string,
): TelegramThemeDefinition => ({
  key,
  name,
  emoji,
  description,
  homeTitle,
  greeting: (n) => `${emoji} ${name}: ${n}`,
  labels: {
    expense: "Pengeluaran",
    income: "Pendapatan",
    dashboard: "Ringkasan",
    portfolio: "Portfolio",
    debt: "Utang",
    accounts: "Akun",
    settings: "Pengaturan",
    help: "Bantuan",
  },
  motivation: [],
});
export const minimalTheme = base(
  "MINIMAL",
  "Minimal",
  "◻️",
  "Sederhana dan minim distraksi.",
  "FINANCE",
);
export const calmTheme = base(
  "CALM",
  "Calm",
  "🌿",
  "Tenang dan tidak menghakimi.",
  "RUANG KEUANGAN",
);
export const playfulTheme = base(
  "PLAYFUL",
  "Playful",
  "🎈",
  "Ringan, penuh emoji, dan menyenangkan.",
  "MONEY PLAYGROUND",
);
export const gamifiedTheme = base(
  "GAMIFIED",
  "Gamified",
  "🎮",
  "Progres seperti level dan misi.",
  "FINANCE QUEST",
);
export const financialCoachTheme = base(
  "FINANCIAL_COACH",
  "Financial Coach",
  "🧠",
  "Insight seperti pendamping keuangan pribadi.",
  "FINANCIAL COACH",
);
