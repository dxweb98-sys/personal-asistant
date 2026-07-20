import { TelegramThemeDefinition } from "./theme.types.js";
export const motivationalTheme: TelegramThemeDefinition = {
  key: "MOTIVATIONAL",
  name: "Motivational",
  emoji: "🔥",
  description: "Enerjik dan mendorong progres.",
  homeTitle: "FREEDOM JOURNEY",
  greeting: (n) => `Ayo lanjut, ${n}!`,
  labels: {
    expense: "🧹 Kendalikan Pengeluaran",
    income: "🚀 Tambah Pemasukan",
    dashboard: "🏆 Lihat Progres",
    portfolio: "📈 Kembangkan Aset",
    debt: "⚔️ Lawan Utang",
    accounts: "🏦 Dompet Saya",
    settings: "⚙️ Atur Strategi",
    help: "🧭 Panduan",
  },
  motivation: [
    "Setiap catatan adalah satu langkah lebih dekat menuju kebebasan finansial.",
    "Progres kecil tetap progres. Jaga ritmenya!",
  ],
};
