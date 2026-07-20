import { TelegramThemeDefinition } from "./theme.types.js";
export const friendlyTheme: TelegramThemeDefinition = {
  key: "FRIENDLY",
  name: "Friendly",
  emoji: "😊",
  description: "Hangat, santai, dan mendukung.",
  homeTitle: "PERSONAL FINANCE OS",
  greeting: (n) => `Halo, ${n} 👋`,
  labels: {
    expense: "💸 Catat Pengeluaran",
    income: "💰 Catat Pendapatan",
    dashboard: "📊 Ringkasan",
    portfolio: "📈 Portfolio",
    debt: "💳 Utang",
    accounts: "🏦 Akun",
    settings: "⚙️ Pengaturan",
    help: "❓ Bantuan",
  },
  motivation: [
    "Sedikit demi sedikit, catatan yang konsisten akan mengubah keputusan keuanganmu.",
    "Satu transaksi yang dicatat hari ini membuat keputusan besok lebih sadar.",
  ],
};
