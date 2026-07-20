import { TelegramThemeDefinition } from "./theme.types.js";
export const professionalTheme: TelegramThemeDefinition = {
  key: "PROFESSIONAL",
  name: "Professional",
  emoji: "💼",
  description: "Formal, rapi, dan fokus pada angka.",
  homeTitle: "FINANCIAL CONTROL CENTER",
  greeting: (n) => `Selamat datang, ${n}.`,
  labels: {
    expense: "Pengeluaran",
    income: "Pendapatan",
    dashboard: "Laporan",
    portfolio: "Portofolio",
    debt: "Kewajiban",
    accounts: "Akun",
    settings: "Konfigurasi",
    help: "Bantuan",
  },
  motivation: [
    "Konsistensi pencatatan meningkatkan kualitas keputusan finansial.",
  ],
};
