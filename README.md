# Personal Finance OS v7 — Interactive Telegram

Personal Finance OS — Freedom Journey

Express.js + TypeScript + PostgreSQL + Prisma + Telegram. Source code seluruh roadmap tetap dipertahankan, tetapi runtime saat ini difokuskan pada Utang & Kredit beserta dependency langsungnya.

## Mode fokus Utang & Kredit

Fitur account, saldo, mutasi, transfer, pendapatan/pengeluaran dasar, tagihan, utang, cicilan, pembayaran, simulasi, laporan/export utang, audit, settings, dan notifikasi tetap aktif.

Investasi, target tabungan, budget lanjutan, wealth management, laporan umum, insight umum, dan rekomendasi lanjutan berstatus `COMING_SOON`. Endpoint yang dinonaktifkan mengembalikan HTTP `423` dengan kode `FEATURE_COMING_SOON`; callback dan command Telegram dihentikan sebelum service dipanggil.

Katalog terpusat untuk navigation/route guard tersedia melalui:

```text
GET /api/v1/features
```

Item navigation yang belum aktif tetap dikirim dengan `disabled: true`, `lockIcon: "lock"`, dan badge `Segera Hadir`.

## Menjalankan

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate -- --name personal_finance_os
npm run db:seed
npm run dev
```

## Modul

- Debt: cicilan, tenor, denda fixed/harian/persentase, negosiasi, pembayaran dan export.
- Finance: akun cash/bank/e-wallet/CC/paylater, income, expense, transfer, cash flow.
- Investment: source dipertahankan, runtime dikunci sebagai `COMING_SOON`.
- Insight umum: source dipertahankan, runtime dikunci sebagai `COMING_SOON`.
- Telegram: cash flow, account, transaksi dasar, debt, dan settings aktif; investment tetap terlihat dengan icon lock dan badge Segera Hadir.

Endpoint simulasi kredit aktif:

```text
POST /api/v1/debts/simulations
POST /api/v1/debts/simulations/urgent-override
```

Dokumentasi lengkap: `docs/API-CONTRACT.md` dan `docs/PERSONAL-FINANCE-API.md`.

## Catatan market price

Versi ini menyediakan penyimpanan harga manual/API-ready. Integrasi vendor market data dibuat melalui adapter terpisah pada versi berikutnya agar pilihan sumber data, lisensi, rate limit, dan simbol IDX/crypto/emas tidak mengotori business logic.

## Investment platform tracking (v6)

Investasi kini menyimpan platform/aplikasi secara terpisah, misalnya Stockbit, Ajaib, Binance, Indodax, Pegadaian, Treasury, atau wallet pribadi. REST API dan Telegram sama-sama mendukung input platform dan pembelian investasi.

## Telegram v7 highlights

- Persistent settings stored per Telegram user in PostgreSQL.
- No automatic market-price scheduler. Prices refresh only through user action.
- `LATEST_ONLY` and `SNAPSHOT` price-storage modes.
- Clear separation between purchase cost, confirmed market value, stale estimate, and unpriced cost.
- Button-driven income, expense, portfolio, debt, account, and settings flows.
- Themes and optional motivational messages.

Run a Prisma migration after upgrading:

```bash
npm run db:generate
npm run db:migrate -- --name telegram_preferences_and_valuation
```

## Multi-currency valuation (v7)

Setiap akun, debt, transaksi, instrumen, harga pasar, dividen, dan trade mempertahankan mata uang aslinya. `baseCurrency` pada pengaturan pengguna hanya menentukan mata uang tampilan dashboard.

Contoh:

- BBCA: IDR
- BTC: USD atau USDT
- akun Binance: USDT
- rekening BCA: IDR
- investasi valas USD: USD

Mengubah pengaturan dari IDR ke USD tidak mengubah histori. Dashboard menghitung ulang menggunakan kurs terbaru yang disimpan pengguna.

Telegram:

- Settings → Mata Uang Utama
- Settings → Kurs Valas
- `/kurs USD IDR 16350`
- `/kurs USDT IDR 16320`

Jika kurs tidak tersedia, nilai native tetap ditampilkan tetapi tidak dimasukkan ke confirmed total. Jika kurs stale, nilai masuk ke estimated total dengan peringatan.

## Telegram onboarding dan tema modular

Pengguna Telegram baru wajib menyelesaikan onboarding: memilih base currency lalu tema. Menu utama baru terbuka setelah `onboardingCompleted=true`.

Tema berada di `src/modules/telegram/themes/`. Untuk menambah tema baru:

1. buat file `<nama>.theme.ts` yang mengikuti `TelegramThemeDefinition`;
2. ekspor dan daftarkan di `themes/index.ts`;
3. tambahkan key baru pada enum `TelegramTheme` di Prisma.

Tema bawaan: Friendly, Motivational, Professional, Minimal, Calm, Playful, Gamified, dan Financial Coach. Tema dapat dipilih saat onboarding dan diubah kapan saja dari Settings.

Update harga investasi hanya terjadi saat pengguna menekan tombol Update Harga. Investasi tanpa harga terbaru tetap ditampilkan sebagai `unpricedInvestmentCost` dan tidak masuk ke confirmed market value/net worth.

## v9 — On-demand FX refresh

Telegram menyediakan tombol `🌐 Update Kurs` pada Settings. Tidak ada scheduler background. Bot hanya mengambil pasangan kurs yang benar-benar dipakai dan mengonversinya terhadap base currency aktif. Kurs referensi disimpan sebagai `API`, sementara mata uang dan nilai historis asli tetap tidak berubah.
