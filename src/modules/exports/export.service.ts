import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { HttpError } from "../../common/http-error.js";
import { moneyToNumber } from "../../common/money.js";
import { prisma } from "../../lib/prisma.js";
import type { ReportQuery } from "../report/report.schema.js";
import { reportService } from "../report/report.service.js";
import { auditService } from "../audit/audit.service.js";

export type ExportFormat = "csv" | "xlsx" | "pdf" | "json";
export type ExportKind = "summary" | "payments" | "debt";
type Row = Record<string, string | number | null>;

const db = prisma as any;
const numberValue = (value: unknown) => Number(value ?? 0) || 0;
const sanitize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
const dateID = (value: Date, timeZone = "Asia/Jakarta") =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone }).format(value);
const jsonSafe = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") return item.toString();
      if (item && typeof item === "object" && "toNumber" in item) {
        return Number(item);
      }
      return item;
    }),
  );

async function debtData(userId: string, debtId?: string) {
  const debts = await db.debt.findMany({
    where: { userId, ...(debtId ? { id: debtId } : {}) },
    include: {
      payments: {
        include: { allocations: true },
        orderBy: { paidAt: "desc" },
      },
      charges: true,
      installments: { orderBy: { dueDate: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (debtId && debts.length === 0) throw new HttpError(404, "Utang tidak ditemukan");
  return debts;
}

async function rowsFor(
  userId: string,
  kind: ExportKind,
  debtId?: string,
): Promise<{ title: string; rows: Row[] }> {
  const debts = await debtData(userId, debtId);
  if (kind === "summary") {
    return {
      title: "Ringkasan Seluruh Utang",
      rows: debts.map((debt: any) => ({
        Utang: debt.name,
        Kreditur: debt.creditor,
        MataUang: debt.currency,
        Kebijakan: debt.paymentPolicy,
        Prioritas: debt.priority,
        PokokAwal: moneyToNumber(debt.originalPrincipal),
        SisaPokok: moneyToNumber(debt.remainingPrincipal),
        DendaTertagih: debt.charges
          .filter((charge: any) => ["BILLED", "PARTIAL"].includes(charge.billingStatus))
          .reduce(
            (sum: number, charge: any) =>
              sum + moneyToNumber(charge.amount) - moneyToNumber(charge.paidAmount),
            0,
          ),
        DendaTertunda: debt.charges
          .filter((charge: any) => charge.billingStatus === "PENDING")
          .reduce(
            (sum: number, charge: any) =>
              sum + moneyToNumber(charge.amount) - moneyToNumber(charge.paidAmount),
            0,
          ),
        Status: debt.status,
      })),
    };
  }
  if (kind === "payments") {
    return {
      title: "Laporan Seluruh Pembayaran",
      rows: debts.flatMap((debt: any) =>
        debt.payments.map((payment: any) => ({
          Tanggal: dateID(payment.paidAt),
          Utang: debt.name,
          Kreditur: debt.creditor,
          MataUang: debt.currency,
          Nominal: moneyToNumber(payment.amount),
          KePokok: payment.allocations.reduce(
            (sum: number, item: any) => sum + moneyToNumber(item.principalAmount),
            0,
          ),
          KeDendaBiaya: payment.allocations.reduce(
            (sum: number, item: any) => sum + moneyToNumber(item.chargeAmount),
            0,
          ),
          Status: payment.status ?? "POSTED",
          Sumber: payment.source,
          Catatan: payment.note ?? "-",
        })),
      ),
    };
  }
  const debt = debts[0]!;
  return {
    title: `Laporan Utang - ${debt.name}`,
    rows: debt.installments.map((installment: any) => ({
      Periode: installment.period,
      JatuhTempo: dateID(installment.dueDate),
      MataUang: debt.currency,
      TagihanPokok: moneyToNumber(installment.scheduledPrincipal),
      PokokDibayar: moneyToNumber(installment.paidPrincipal),
      SisaTagihan: Math.max(
        0,
        moneyToNumber(installment.scheduledPrincipal) -
          moneyToNumber(installment.paidPrincipal),
      ),
      Status: installment.status,
    })),
  };
}

function csv(rows: Row[]) {
  if (!rows.length) return Buffer.from("Tidak ada data\n");
  const headers = Object.keys(rows[0]!);
  const escapeValue = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return Buffer.from(
    [
      headers.map(escapeValue).join(","),
      ...rows.map((row) => headers.map((header) => escapeValue(row[header])).join(",")),
    ].join("\n"),
    "utf8",
  );
}

async function basicXlsx(title: string, rows: Row[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Personal Finance OS";
  const worksheet = workbook.addWorksheet("Laporan");
  const columnCount = Math.max(1, Object.keys(rows[0] ?? { Data: "" }).length);
  worksheet.addRow([title]);
  worksheet.mergeCells(1, 1, 1, columnCount);
  worksheet.getRow(1).font = { bold: true, size: 16 };
  if (rows.length) {
    const headers = Object.keys(rows[0]!);
    worksheet.addRow(headers);
    worksheet.getRow(2).font = { bold: true };
    rows.forEach((row) => worksheet.addRow(headers.map((header) => row[header])));
    worksheet.columns.forEach((column) => {
      column.width = 20;
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function basicPdf(title: string, rows: Row[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ margin: 36, size: "A4" });
    const chunks: Buffer[] = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.fontSize(18).text(title, { align: "center" });
    document.moveDown();
    if (!rows.length) document.fontSize(10).text("Tidak ada data.");
    rows.forEach((row, index) => {
      document
        .fontSize(11)
        .text(`${index + 1}. ${String(row.Utang ?? row.Periode ?? row.Tanggal ?? "Data")}`, {
          underline: true,
        });
      for (const [key, value] of Object.entries(row)) {
        if (["Utang", "Periode", "Tanggal"].includes(key)) continue;
        document.fontSize(9).text(`${key}: ${String(value ?? "-")}`);
      }
      document.moveDown(0.6);
      if (document.y > 740) document.addPage();
    });
    document.end();
  });
}

function reportTransactionRows(report: any): Row[] {
  return report.transactions.map((transaction: any) => ({
    ID: transaction.id,
    Tanggal: new Date(transaction.occurredAt).toISOString(),
    Status: transaction.status,
    Jenis: transaction.type,
    Deskripsi: transaction.description ?? "",
    Kategori: transaction.category?.name ?? "",
    Tag: (transaction.tags ?? []).map((item: any) => item.tag.name).join(", "),
    AccountSumber: transaction.sourceAccount?.name ?? "",
    AccountTujuan: transaction.destinationAccount?.name ?? "",
    NominalAsli: numberValue(transaction.amount),
    MataUangAsli: transaction.currency,
    KursKeMataUangUtama: transaction.fxRateToBase
      ? numberValue(transaction.fxRateToBase)
      : null,
    NilaiMataUangUtama: transaction.baseAmount ? numberValue(transaction.baseAmount) : null,
    MataUangUtama: transaction.baseCurrency ?? report.currency,
    DibatalkanPada: transaction.voidedAt
      ? new Date(transaction.voidedAt).toISOString()
      : "",
    AlasanPembatalan: transaction.voidReason ?? "",
  }));
}

async function financialXlsx(report: any) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Personal Finance OS";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Ringkasan");
  summary.addRows([
    ["Laporan Keuangan", report.period.label],
    ["Mata uang utama", report.currency],
    ["Total pendapatan", report.totals.income],
    ["Total pengeluaran", report.totals.expense],
    ["Pembayaran utang", report.totals.debtPayment],
    ["Arus kas bersih", report.totals.netCashFlow],
    ["Transfer masuk", report.totals.transferIn],
    ["Transfer keluar", report.totals.transferOut],
    ["Total tagihan", report.totals.totalBills],
    ["Tagihan belum dibayar", report.totals.unpaidBills],
    ["Tagihan jatuh tempo", report.totals.overdueBills],
    ["Total utang", report.totals.totalDebt],
    ["Nilai investasi", report.totals.investmentValue],
    ["Dana Belum Dialokasikan", report.totals.unallocatedFunds],
  ]);
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 24;
  summary.getRow(1).font = { bold: true, size: 16 };

  const rows = reportTransactionRows(report);
  const detail = workbook.addWorksheet("Detail Transaksi");
  if (rows.length) {
    detail.columns = Object.keys(rows[0]!).map((header) => ({ header, key: header, width: 22 }));
    detail.addRows(rows);
  }

  for (const [name, type] of [
    ["Pendapatan", "INCOME"],
    ["Pengeluaran", "EXPENSE"],
    ["Transfer", "TRANSFER"],
    ["Pembayaran Utang", "DEBT_PAYMENT"],
  ] as const) {
    const worksheet = workbook.addWorksheet(name);
    const selected = rows.filter((row) => row.Jenis === type);
    if (selected.length) {
      worksheet.columns = Object.keys(selected[0]!).map((header) => ({
        header,
        key: header,
        width: 22,
      }));
      worksheet.addRows(selected);
    }
  }

  for (const account of report.accounts) {
    const worksheet = workbook.addWorksheet(
      `Akun-${sanitize(account.accountName).slice(0, 25) || account.accountId.slice(0, 8)}`.slice(0, 31),
    );
    worksheet.addRows([
      ["Account", account.accountName],
      ["Jenis", account.accountType],
      ["Status", account.status],
      ["Mata uang", account.currency],
      ["Saldo awal periode", account.openingBalance],
      ["Pendapatan", account.income],
      ["Pengeluaran", account.expense],
      ["Pembayaran utang", account.debtPayment],
      ["Transfer masuk", account.transferIn],
      ["Transfer keluar", account.transferOut],
      ["Penyesuaian", account.adjustment],
      ["Saldo akhir periode", account.closingBalance],
      ["Nilai dalam mata uang utama", account.convertedClosingBalance],
    ]);
    worksheet.getColumn(1).width = 30;
    worksheet.getColumn(2).width = 24;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function financialPdf(report: any) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ margin: 42, size: "A4" });
    const chunks: Buffer[] = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.fontSize(18).text("Laporan Keuangan", { align: "center" });
    document.fontSize(10).text(report.period.label, { align: "center" });
    document.moveDown();
    const summaryRows: Array<[string, unknown]> = [
      ["Mata uang", report.currency],
      ["Pendapatan", report.totals.income],
      ["Pengeluaran", report.totals.expense],
      ["Pembayaran utang", report.totals.debtPayment],
      ["Arus kas bersih", report.totals.netCashFlow],
      ["Total utang", report.totals.totalDebt],
      ["Nilai investasi", report.totals.investmentValue],
      ["Dana Belum Dialokasikan", report.totals.unallocatedFunds],
    ];
    for (const [label, value] of summaryRows) {
      document.fontSize(10).text(`${label}: ${String(value ?? 0)}`);
    }
    document.moveDown();
    document.fontSize(13).text("Ringkasan per Account", { underline: true });
    for (const account of report.accounts) {
      document
        .fontSize(10)
        .text(
          `${account.accountName} (${account.currency}) — saldo akhir ${account.closingBalance}`,
        );
    }
    document.moveDown();
    document.fontSize(13).text("Transaksi", { underline: true });
    for (const transaction of report.transactions.slice(0, 100)) {
      document
        .fontSize(9)
        .text(
          `${new Date(transaction.occurredAt).toISOString().slice(0, 10)} • ${transaction.type} • ${transaction.currency} ${numberValue(transaction.amount)} • ${transaction.description ?? "-"}`,
        );
      if (document.y > 750) document.addPage();
    }
    if (report.transactions.length > 100) {
      document.fontSize(9).text("Detail dibatasi 100 transaksi pada PDF. Gunakan XLSX atau CSV untuk data lengkap.");
    }
    document.end();
  });
}

export async function buildFinancialExport(
  userId: string,
  query: ReportQuery,
  format: ExportFormat,
) {
  const report = await reportService.build(
    userId,
    { ...query, page: 1, limit: 100 },
    { allTransactions: true },
  );
  const allTransactionsReport = report;
  const title = `Laporan Keuangan ${report.period.label}`;
  let buffer: Buffer;
  if (format === "xlsx") buffer = await financialXlsx(allTransactionsReport);
  else if (format === "pdf") buffer = await financialPdf(allTransactionsReport);
  else if (format === "json") {
    buffer = Buffer.from(JSON.stringify(jsonSafe(allTransactionsReport), null, 2), "utf8");
  } else {
    buffer = csv(reportTransactionRows(allTransactionsReport));
  }
  const periodName = sanitize(report.period.label) || "seluruh-periode";
  const filename = `laporan-keuangan-${periodName}.${format}`;
  await auditService.create(userId, {
    action: "EXPORT_CREATED",
    entityType: "FinancialReport",
    metadata: { format, filename, filters: query },
  });
  return {
    buffer,
    title,
    filename,
    mime:
      format === "csv"
        ? "text/csv; charset=utf-8"
        : format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : format === "json"
            ? "application/json; charset=utf-8"
            : "application/pdf",
  };
}

export async function buildExport(
  userId: string,
  kind: ExportKind,
  format: Exclude<ExportFormat, "json">,
  debtId?: string,
) {
  const data = await rowsFor(userId, kind, debtId);
  const buffer =
    format === "csv"
      ? csv(data.rows)
      : format === "xlsx"
        ? await basicXlsx(data.title, data.rows)
        : await basicPdf(data.title, data.rows);
  return {
    buffer,
    title: data.title,
    filename: `${kind}-${new Date().toISOString().slice(0, 10)}.${format}`,
    mime:
      format === "csv"
        ? "text/csv"
        : format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
  };
}
