# Freedom Debt Agent — API Contract & Usage Guide

Base URL: `http://localhost:3000/api/v1`

Semua request memakai header pengguna sementara:

```http
x-user-id: 11111111-1111-4111-8111-111111111111
Content-Type: application/json
```

Format sukses:

```json
{ "success": true, "message": "...", "data": {} }
```

Format error:

```json
{ "success": false, "message": "...", "details": {} }
```

## Konsep utama

- `paymentPolicy`: `FIXED`, `FLEXIBLE`, atau `NEGOTIABLE`.
- `priority`: `CRITICAL`, `URGENT`, `NORMAL`, atau `SLOW`.
- `remainingPrincipal`: hanya sisa pokok, tidak dicampur denda.
- `installments`: tagihan pokok per periode.
- `charges`: denda, bunga, admin, atau biaya lain.
- `settlementPolicy`: kapan denda dibayar: `IMMEDIATE`, `NEXT_INSTALLMENT`, `END_OF_TERM`, atau `MANUAL`.
- `calculationType`: cara hitung denda: `FIXED`, `DAILY`, `PERCENTAGE_DAILY`, `PERCENTAGE_FIXED`, `MANUAL`, atau `NONE`.

## 1. Menambahkan utang baru

`POST /debts`

### Cicilan motor fixed, denda harian masuk bulan berikutnya

```json
{
  "name": "Cicilan Motor",
  "creditor": "Leasing ABC",
  "originalPrincipal": 18000000,
  "paymentPolicy": "FIXED",
  "fixedMonthlyAmount": 1200000,
  "minimumMonthlyAmount": 1200000,
  "targetMonthlyAmount": 1200000,
  "dueDay": 10,
  "priority": "CRITICAL",
  "canBeNegotiated": false,
  "allocationPolicy": "CURRENT_INSTALLMENT_FIRST",
  "lateFeeRule": {
    "calculationType": "DAILY",
    "dailyAmount": 10000,
    "graceDays": 0,
    "maxDays": 30,
    "maxAmount": 300000,
    "settlementPolicy": "NEXT_INSTALLMENT"
  }
}
```

### Utang fleksibel

```json
{
  "name": "Utang ke Kakak",
  "creditor": "Kakak",
  "originalPrincipal": 8000000,
  "paymentPolicy": "FLEXIBLE",
  "minimumMonthlyAmount": 300000,
  "targetMonthlyAmount": 1000000,
  "priority": "NORMAL",
  "canBeNegotiated": true,
  "allocationPolicy": "PRINCIPAL_FIRST"
}
```

### Denda fixed sekali dan dibayar langsung

```json
{
  "name": "Paylater",
  "creditor": "Provider Paylater",
  "originalPrincipal": 5000000,
  "paymentPolicy": "FIXED",
  "fixedMonthlyAmount": 800000,
  "dueDay": 20,
  "priority": "URGENT",
  "lateFeeRule": {
    "calculationType": "FIXED",
    "fixedAmount": 75000,
    "graceDays": 1,
    "settlementPolicy": "IMMEDIATE"
  }
}
```

Response `201` berisi utang dan aturan denda yang tersimpan.

### Membuat kredit motor sekaligus berdasarkan tenor bulan

Untuk kredit dengan cicilan tetap, kirim `tenorMonths` dan `generateInstallments: true`. Sistem akan membuat seluruh tagihan bulanan secara otomatis.

`POST /debts`

```json
{
  "name": "Kredit Motor",
  "creditor": "Leasing ABC",
  "originalPrincipal": 28800000,
  "paymentPolicy": "FIXED",
  "fixedMonthlyAmount": 1200000,
  "startDate": "2026-08-01",
  "dueDay": 10,
  "tenorMonths": 24,
  "generateInstallments": true,
  "priority": "CRITICAL",
  "canBeNegotiated": false,
  "lateFeeRule": {
    "calculationType": "DAILY",
    "dailyAmount": 10000,
    "graceDays": 0,
    "maxDays": 30,
    "maxAmount": 300000,
    "settlementPolicy": "NEXT_INSTALLMENT"
  }
}
```

Hasilnya, sistem membuat 24 baris `debt_installments`, mulai periode `2026-08` sampai `2028-07`. Jika `dueDay` tidak tersedia pada suatu bulan, misalnya tanggal 31 pada Februari, sistem memakai hari terakhir bulan tersebut. Cicilan terakhir otomatis disesuaikan agar total jadwal tidak melebihi `originalPrincipal`.

Contoh response ringkas:

```json
{
  "success": true,
  "message": "Utang berhasil ditambahkan",
  "data": {
    "id": "UUID-UTANG",
    "name": "Kredit Motor",
    "tenorMonths": 24,
    "remainingPrincipal": "28800000.00",
    "maturityDate": "2028-07-10",
    "installments": [
      {
        "period": "2026-08",
        "scheduledPrincipal": "1200000.00",
        "dueDate": "2026-08-10",
        "status": "UPCOMING"
      }
    ]
  }
}
```

`generateInstallments` adalah field request saja dan tidak disimpan di database. `tenorMonths` disimpan untuk referensi kontrak kredit.

## 2. Membuat tagihan bulanan

`POST /debts/:debtId/installments`

```json
{
  "period": "2026-07",
  "scheduledPrincipal": 1200000,
  "dueDate": "2026-07-10"
}
```

Gunakan satu record untuk setiap periode. Kombinasi `debtId + period` unik.

## 3. Mencatat rencana telat bayar

`POST /debts/:debtId/installments/:installmentId/plan-late`

```json
{
  "expectedPaymentDate": "2026-07-15",
  "estimatedLateFee": 50000,
  "note": "Gaji masuk tanggal 15"
}
```

Ini hanya mencatat rencana. Denda aktual tetap dihitung atau dimasukkan ketika pembayaran/konfirmasi kreditur terjadi.

## 4. Membayar utang

`POST /debts/:debtId/payments`

```json
{
  "amount": 1200000,
  "paidAt": "2026-07-15",
  "source": "TELEGRAM",
  "installmentId": "UUID-TAGIHAN-JULI",
  "idempotencyKey": "telegram-update-12345-payment-motor-jul26",
  "note": "Bayar cicilan Juli"
}
```

`idempotencyKey` wajib disarankan untuk Telegram agar retry tidak menggandakan pembayaran.

Contoh response:

```json
{
  "success": true,
  "message": "Pembayaran berhasil dicatat",
  "data": {
    "payment": {
      "amount": "1200000.00",
      "allocations": [
        { "principalAmount": "1200000.00", "chargeAmount": "0.00" }
      ]
    },
    "debt": {
      "name": "Cicilan Motor",
      "remainingPrincipal": 16800000,
      "status": "ACTIVE"
    },
    "installment": {
      "period": "2026-07",
      "paidPrincipal": "1200000.00",
      "status": "PAID_LATE",
      "charges": [
        {
          "type": "LATE_FEE",
          "amount": "50000.00",
          "billingStatus": "PENDING",
          "settlementPolicy": "NEXT_INSTALLMENT",
          "targetPeriod": "2026-08"
        }
      ]
    },
    "overallSummary": {
      "totalRemainingPrincipal": 30800000,
      "totalBilledCharges": 0,
      "totalPendingCharges": 50000,
      "activeDebts": 3
    }
  }
}
```

### Pembayaran parsial

Kirim nominal yang tersedia. Status installment menjadi `PARTIAL`. Alokasi mengikuti `allocationPolicy` utang.

### Denda masuk bulan berikutnya

Denda dibuat `PENDING` dengan `targetPeriod` berikutnya. Ketika tagihan berikutnya dibuat, denda dapat ditautkan/ditagihkan melalui endpoint charge atau proses scheduler lanjutan.

### Denda dibayar akhir tenor

Gunakan `settlementPolicy: END_OF_TERM`. Ketika pokok nol tetapi denda masih ada, status utang menjadi `SETTLEMENT_PENDING`, bukan `PAID`.

## 5. Menambahkan denda atau biaya manual

`POST /debts/:debtId/charges`

```json
{
  "type": "LATE_FEE",
  "amount": 75000,
  "settlementPolicy": "END_OF_TERM",
  "sourceInstallmentId": "UUID-TAGIHAN",
  "estimated": false,
  "description": "Denda aktual dari leasing"
}
```

Gunakan ini ketika nominal denda baru diketahui dari kreditur.

## 6. Mencatat negosiasi

`POST /debts/:debtId/negotiations`

```json
{
  "status": "AGREED",
  "previousMonthlyAmount": 1000000,
  "agreedMonthlyAmount": 500000,
  "effectiveFrom": "2026-08-01",
  "effectiveUntil": "2026-12-31",
  "reason": "Penurunan pendapatan sementara"
}
```

## 7. Penyesuaian jatuh tempo atau nominal

`POST /debts/:debtId/installments/:installmentId/adjustments`

```json
{
  "type": "DUE_DATE_EXTENSION",
  "newDueDate": "2026-07-15",
  "lateFeeWaived": true,
  "reason": "Disetujui pihak leasing"
}
```

Dapat juga memakai `PAYMENT_REDUCTION`, `PAYMENT_HOLIDAY`, atau `LATE_FEE_WAIVER`.

## 8. Melihat daftar dan detail

- `GET /debts` — semua utang.
- `GET /debts?status=ACTIVE` — filter status.
- `GET /debts/:id` — detail lengkap: rule, installments, charges, payments, allocations, negotiations.

## 9. Melihat keseluruhan kondisi utang

`GET /reports/summary`

Response memisahkan:

- `totalRemainingPrincipal` — sisa pokok.
- `totalBilledCharges` — biaya yang sudah harus dibayar.
- `totalPendingCharges` — biaya tercatat tetapi belum ditagihkan.
- `totalOutstanding` — seluruh pokok + biaya.
- `mandatoryMonthly` — estimasi kewajiban minimum/fixed bulanan.
- `byPriority` — jumlah dan saldo per level.

## 10. Mendapatkan rekomendasi pembayaran bulanan

`POST /reports/recommendations`

```json
{
  "monthlyIncome": 12000000,
  "essentialExpenses": 6500000,
  "safetyBuffer": 1500000,
  "strategy": "PRIORITY"
}
```

Strategi:

- `PRIORITY`: critical/urgent lebih dahulu.
- `AVALANCHE`: bunga tertinggi.
- `SNOWBALL`: saldo pokok terkecil.

Aturan rekomendasi:

1. Kurangi kebutuhan pokok dan safety buffer.
2. Dahulukan utang `FIXED`.
3. Berikan minimum untuk `FLEXIBLE` bila dana cukup.
4. `NEGOTIABLE` dapat disarankan untuk negosiasi ulang.
5. Jangan otomatis mengubah kontrak utang; semua perubahan harus dicatat sebagai negotiation/adjustment.

## Urutan penggunaan dari Telegram

1. User: “Tambah cicilan motor…” → `POST /debts`.
2. Sistem membuat periode berjalan → `POST /installments`.
3. User: “Motor akan telat sampai tanggal 15” → `POST /plan-late`.
4. User: “Bayar motor 1,2 juta” → tampilkan preview di bot, lalu setelah konfirmasi `POST /payments`.
5. Bot membaca response payment dan menampilkan sisa motor + summary keseluruhan.
6. User: “Lihat semua utang” → `GET /reports/summary` dan opsional `GET /debts`.

---

# Telegram Bot

## Konfigurasi

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=123456:telegram-token
```

Bot menggunakan long polling. Untuk mematikan bot tanpa mematikan API, ubah `TELEGRAM_ENABLED=false`.

## Command

| Command    | Fungsi                                 |
| ---------- | -------------------------------------- |
| `/start`   | Registrasi chat dan membuka menu utama |
| `/menu`    | Membuka ulang menu tombol              |
| `/tambah`  | Menambahkan utang baru                 |
| `/hutang`  | Daftar utang dan progress              |
| `/tagihan` | Estimasi kewajiban rutin bulanan       |
| `/bayar`   | Memilih utang dan membayar             |
| `/summary` | Ringkasan seluruh kondisi utang        |
| `/export`  | Pusat export CSV, Excel, dan PDF       |

### Menambahkan kredit motor

```text
/tambah Motor | Leasing ABC | 28800000 | 1200000 | 24 | 10
```

Urutan data:

1. Nama utang.
2. Nama kreditur.
3. Total pokok.
4. Cicilan bulanan.
5. Tenor dalam bulan.
6. Tanggal jatuh tempo bulanan.

Bot membuat seluruh jadwal cicilan secara otomatis.

### Membayar utang

```text
/bayar motor 1200000
```

Atau jalankan `/bayar`, pilih utang melalui tombol, lalu kirim nominalnya. Setelah pembayaran, bot menampilkan nominal pembayaran, sisa pokok utang tersebut, dan total sisa semua utang.

# Export API

Semua endpoint memakai header user yang sama dengan endpoint lain:

```http
x-user-id: 11111111-1111-4111-8111-111111111111
```

## Export summary seluruh utang

```http
GET /api/v1/exports/summary?format=xlsx
```

Format: `csv`, `xlsx`, atau `pdf`.

Isi laporan:

- Nama utang dan kreditur.
- Pokok awal dan sisa pokok.
- Denda yang sudah ditagihkan.
- Denda yang masih tertunda.
- Payment policy, prioritas, dan status.

## Export seluruh pembayaran

```http
GET /api/v1/exports/payments?format=xlsx
```

Isi laporan:

- Tanggal pembayaran.
- Utang dan kreditur.
- Nominal total.
- Alokasi ke pokok.
- Alokasi ke denda atau biaya.
- Sumber pembayaran dan catatan.

## Export laporan per utang

```http
GET /api/v1/exports/debts/{debtId}?format=pdf
```

Isi laporan:

- Seluruh periode cicilan.
- Jatuh tempo tiap periode.
- Tagihan pokok.
- Pokok yang sudah dibayar.
- Sisa tagihan per periode.
- Status tiap cicilan.

Response ketiga endpoint merupakan file attachment, bukan JSON.
