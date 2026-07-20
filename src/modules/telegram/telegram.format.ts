export const idr = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
export const esc = (value: string) =>
  value.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, String.raw`\$1`);
export const progress = (paid: number, total: number) => {
  const pct =
    total <= 0 ? 100 : Math.min(100, Math.round((paid / total) * 100));
  const filled = Math.round(pct / 10);
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${pct}%`;
};
export const welcome = (name: string) =>
  `🌤️ *Selamat datang, ${esc(name)}!*\n\nAku akan menemani perjalananmu dari utang menuju kebebasan finansial. Semua angka dicatat secara terstruktur, bukan sekadar percakapan.\n\nPilih menu di bawah untuk mulai 👇`;
export const helpText = `📘 *Panduan Singkat*\n\n/tambah \- tambah utang baru\n/hutang \- lihat seluruh utang\n/tagihan \- tagihan aktif\n/bayar \- catat pembayaran\n/summary \- kondisi keseluruhan\n/export \- unduh laporan\n\n*Format cepat tambah utang:*\n\`/tambah Motor | Leasing ABC | 28800000 | 1200000 | 24 | 10\`\nNama \| kreditur \| total pokok \| cicilan/bulan \| tenor \| tanggal jatuh tempo\n\n*Format cepat bayar:*\n\`/bayar motor 1200000\``;
