# Personal Finance OS — API Guide

Semua endpoint development memakai header `x-user-id`.

## 1. Membuat akun keuangan

`POST /api/v1/finance/accounts`

```json
{
  "name": "BCA Utama",
  "type": "BANK",
  "currency": "IDR",
  "openingBalance": 5000000
}
```

Jenis akun: `CASH`, `BANK`, `E_WALLET`, `CREDIT_CARD`, `PAYLATER`, `CRYPTO_WALLET`, `INVESTMENT`, `OTHER`.

## 2. Mencatat gaji atau pendapatan bisnis

`POST /api/v1/finance/transactions`

```json
{
  "type": "INCOME",
  "destinationAccountId": "ACCOUNT_ID",
  "amount": 12000000,
  "description": "Gaji Juli 2026"
}
```

## 3. Mencatat pengeluaran cash/debit

```json
{
  "type": "EXPENSE",
  "sourceAccountId": "ACCOUNT_ID",
  "amount": 85000,
  "description": "Belanja kebutuhan rumah"
}
```

Saldo akun sumber berkurang otomatis.

## 4. Pengeluaran kartu kredit/paylater

Buat akun bertipe `CREDIT_CARD` atau `PAYLATER`, lalu sertakan `debtId`.

```json
{
  "type": "EXPENSE",
  "sourceAccountId": "CC_ACCOUNT_ID",
  "debtId": "DEBT_ID",
  "amount": 750000,
  "description": "Belanja menggunakan kartu kredit"
}
```

Pengeluaran tercatat dan sisa liability bertambah. Saat tagihan dibayar, gunakan modul debt dan catat `DEBT_PAYMENT` dari rekening pembayaran agar cash flow juga ter-tracing.

## 5. Transfer antar akun

```json
{
  "type": "TRANSFER",
  "sourceAccountId": "BCA_ID",
  "destinationAccountId": "CASH_ID",
  "amount": 500000,
  "description": "Tarik tunai"
}
```

## 6. Melihat cash flow

`GET /api/v1/finance/cashflow?from=2026-07-01&to=2026-07-31`

## 7. Menambah instrumen investasi

### Saham Indonesia

`POST /api/v1/investments/instruments`

```json
{
  "type": "STOCK",
  "symbol": "BBCA",
  "name": "Bank Central Asia",
  "exchange": "IDX",
  "currency": "IDR",
  "unitName": "share",
  "unitsPerLot": 100
}
```

### Crypto

```json
{
  "type": "CRYPTO",
  "symbol": "BTC",
  "name": "Bitcoin",
  "currency": "IDR",
  "unitName": "coin",
  "unitsPerLot": 1
}
```

### Emas

```json
{
  "type": "GOLD",
  "symbol": "GOLD-IDR",
  "name": "Emas",
  "currency": "IDR",
  "unitName": "gram",
  "unitsPerLot": 1
}
```

## 8. Membeli investasi

`POST /api/v1/investments/trades`

```json
{
  "instrumentId": "BBCA_ID",
  "accountId": "BCA_ID",
  "type": "BUY",
  "quantity": 1000,
  "pricePerUnit": 8500,
  "fee": 15000,
  "tradedAt": "2026-07-10"
}
```

Untuk saham 10 lot, kirim `quantity: 1000`. Saldo rekening berkurang otomatis. Pembelian investasi tidak dihitung sebagai expense konsumtif.

## 9. Menjual investasi

```json
{
  "instrumentId": "BBCA_ID",
  "accountId": "BCA_ID",
  "type": "SELL",
  "quantity": 500,
  "pricePerUnit": 9500,
  "fee": 18000
}
```

Saldo akun bertambah otomatis dan realized profit dihitung dari average cost.

## 10. Memasukkan harga terbaru

`POST /api/v1/investments/prices`

```json
{
  "instrumentId": "BBCA_ID",
  "price": 9500,
  "source": "MANUAL",
  "capturedAt": "2026-07-19"
}
```

Provider harga eksternal nanti cukup mengisi endpoint/service yang sama dengan `source: API`. Transaksi pembelian lama tidak berubah.

## 11. Mencatat dividen

`POST /api/v1/investments/dividends`

```json
{
  "instrumentId": "BBCA_ID",
  "accountId": "BCA_ID",
  "amount": 650000,
  "quantitySnapshot": 1000,
  "amountPerUnit": 650,
  "receivedAt": "2026-07-18"
}
```

Dividen menambah saldo rekening dan tercatat terpisah dari capital gain.

## 12. Melihat portfolio

`GET /api/v1/investments/portfolio`
Response berisi quantity, average buy price, current price, cost basis, market value, unrealized profit/loss, realized profit, dan dividen per instrumen.

## 13. Dashboard menyeluruh

`GET /api/v1/insights/dashboard`
Menggabungkan aset likuid, investasi, utang/denda, net worth, cash flow, portfolio, dan rule-based insight. LLM dapat ditambahkan sebagai lapisan penjelasan; seluruh angka tetap dihitung backend.

## Telegram

Command tambahan:

- `/cashflow` — ringkasan aset, utang, net worth, income dan expense bulan berjalan.
- `/portfolio` — nilai pasar, modal, profit/loss dan dividen.
- Command debt lama tetap tersedia: `/hutang`, `/bayar`, `/summary`, `/export`.

## 14. Platform atau aplikasi investasi

Platform dibuat terpisah karena satu instrumen dapat dimiliki pada beberapa aplikasi.

`POST /api/v1/investments/platforms`

```json
{
  "name": "Stockbit",
  "type": "BROKER",
  "accountReference": "RDN BCA ****1234",
  "notes": "Akun saham utama"
}
```

Jenis platform: `BROKER`, `EXCHANGE`, `GOLD_PROVIDER`, `BANK`, `WALLET`, `MARKETPLACE`, `OTHER`.

`GET /api/v1/investments/platforms` menampilkan semua platform aktif.

Saat membeli investasi, sertakan `platformId`:

```json
{
  "instrumentId": "BBCA_ID",
  "platformId": "STOCKBIT_ID",
  "accountId": "BCA_ID",
  "type": "BUY",
  "quantity": 1000,
  "pricePerUnit": 8500,
  "fee": 15000
}
```

Portfolio mengembalikan rincian kepemilikan per platform agar pengguna ingat aset tersimpan di mana.

## Telegram investasi

- `/platform` — daftar platform investasi.
- `/tambahplatform Stockbit | BROKER | RDN BCA | Akun saham utama`
- `/tambahinvestasi BBCA | Bank Central Asia | STOCK | IDX`
- `/beliinvestasi BBCA | Stockbit | BCA Utama | 1000 | 8500 | 15000`
- `/portfolio` — nilai portfolio sekaligus nama platform penyimpanan.

## Telegram Personal Settings (v7)

Market price refresh is user-triggered. There is no background scheduler. Each Telegram user has persistent settings in `user_finance_preferences`:

- `baseCurrency`
- `priceStorageMode`: `LATEST_ONLY` or `SNAPSHOT`
- `confirmBeforePriceRefresh`
- `createSnapshotAfterRefresh`
- stale thresholds for stock, crypto, and gold
- Telegram theme
- motivational message preference

Open **Settings** from the Telegram home menu or use `/settings`.

### Interactive daily flow

The bot home menu supports button-driven flows for income, expenses, portfolio valuation, debt payment, accounts, and preferences. Manual market prices are stored only after the user selects an instrument and sends its latest price.

In `LATEST_ONLY` mode, the latest `market_prices` row for an instrument is updated rather than continually inserting new rows.

# Multi-currency

Semua nominal disimpan dalam mata uang asli. Base currency hanya untuk agregasi dan tampilan.

## Kurs manual

Telegram:

```text
/kurs USD IDR 16350
/kurs USDT IDR 16320
```

Makna: `1 USD = 16350 IDR`.

Trade menyimpan:

- `priceCurrency`: mata uang harga aset.
- `settlementCurrency`: mata uang akun pembayaran.
- `fxRateToSettlement`: kurs saat transaksi.
- `settlementAmount`: nominal yang benar-benar dipotong/ditambahkan pada akun.

Portfolio mengembalikan nilai native dan nilai hasil konversi, disertai `fxStatus`, `fxRate`, `displayCurrency`, dan daftar `missingCurrencies`.

## Telegram: update kurs dari internet

Menu `Pengaturan -> Update Kurs` akan:

1. Membaca mata uang yang digunakan oleh akun, transaksi, utang, dividen, dan instrumen investasi.
2. Mengabaikan mata uang yang sama dengan base currency.
3. Mengambil kurs referensi terbaru hanya untuk pasangan yang diperlukan.
4. Menyimpan satu kurs terakhir per pasangan dengan source `API`.
5. Menghitung ulang dashboard saat dibuka tanpa mengubah nominal atau mata uang asli.

Stablecoin atau kode non-fiat seperti USDT tidak dipaksakan memakai kurs fiat. Gunakan kurs manual atau adapter provider crypto khusus.

Kurs default berasal dari Frankfurter dan merupakan kurs referensi harian, bukan kurs beli/jual bank.
