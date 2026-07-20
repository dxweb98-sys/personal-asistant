import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../common/http-error.js";
import { moneyToNumber } from "../../common/money.js";

export type ExportFormat = "csv" | "xlsx" | "pdf";
export type ExportKind = "summary" | "payments" | "debt";

type Row = Record<string, string | number>;
const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
const dateID = (value: Date) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(value);

async function debtData(userId: string, debtId?: string) {
  const debts = await prisma.debt.findMany({
    where: { userId, ...(debtId ? { id: debtId } : {}) },
    include: {
      payments: { include: { allocations: true }, orderBy: { paidAt: "desc" } },
      charges: true,
      installments: { orderBy: { dueDate: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (debtId && debts.length === 0)
    throw new HttpError(404, "Utang tidak ditemukan");
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
      rows: debts.map((d) => ({
        Utang: d.name,
        Kreditur: d.creditor,
        Kebijakan: d.paymentPolicy,
        Prioritas: d.priority,
        "Pokok Awal": moneyToNumber(d.originalPrincipal),
        "Sisa Pokok": moneyToNumber(d.remainingPrincipal),
        "Denda Tertagih": d.charges
          .filter((c) => ["BILLED", "PARTIAL"].includes(c.billingStatus))
          .reduce(
            (a, c) => a + moneyToNumber(c.amount) - moneyToNumber(c.paidAmount),
            0,
          ),
        "Denda Tertunda": d.charges
          .filter((c) => c.billingStatus === "PENDING")
          .reduce((a, c) => a + moneyToNumber(c.amount), 0),
        Status: d.status,
      })),
    };
  }
  if (kind === "payments") {
    return {
      title: "Laporan Seluruh Pembayaran",
      rows: debts.flatMap((d) =>
        d.payments.map((p) => ({
          Tanggal: dateID(p.paidAt),
          Utang: d.name,
          Kreditur: d.creditor,
          Nominal: moneyToNumber(p.amount),
          "Ke Pokok": p.allocations.reduce(
            (a, x) => a + moneyToNumber(x.principalAmount),
            0,
          ),
          "Ke Denda/Biaya": p.allocations.reduce(
            (a, x) => a + moneyToNumber(x.chargeAmount),
            0,
          ),
          Sumber: p.source,
          Catatan: p.note ?? "-",
        })),
      ),
    };
  }
  const debt = debts[0]!;
  return {
    title: `Laporan Utang - ${debt.name}`,
    rows: debt.installments.map((i) => ({
      Periode: i.period,
      "Jatuh Tempo": dateID(i.dueDate),
      "Tagihan Pokok": moneyToNumber(i.scheduledPrincipal),
      "Pokok Dibayar": moneyToNumber(i.paidPrincipal),
      "Sisa Tagihan": Math.max(
        0,
        moneyToNumber(i.scheduledPrincipal) - moneyToNumber(i.paidPrincipal),
      ),
      Status: i.status,
    })),
  };
}

function csv(rows: Row[]) {
  if (!rows.length) return Buffer.from("Tidak ada data\n");
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return Buffer.from(
    [
      headers.map(esc).join(","),
      ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
    ].join("\n"),
    "utf8",
  );
}

async function xlsx(title: string, rows: Row[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Freedom Debt Agent";
  const ws = wb.addWorksheet("Laporan");
  ws.addRow([title]);
  ws.mergeCells(
    1,
    1,
    1,
    Math.max(1, Object.keys(rows[0] ?? { Data: "" }).length),
  );
  ws.getRow(1).font = { bold: true, size: 16 };
  if (rows.length) {
    const headers = Object.keys(rows[0]!);
    ws.addRow(headers);
    ws.getRow(2).font = { bold: true };
    rows.forEach((r) => ws.addRow(headers.map((h) => r[h])));
    ws.columns.forEach((c) => (c.width = 20));
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

function pdf(title: string, rows: Row[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).text(title, { align: "center" });
    doc.moveDown();
    doc.fontSize(9).fillColor("#333333");
    if (!rows.length) doc.text("Tidak ada data.");
    rows.forEach((row, index) => {
      doc
        .fontSize(11)
        .fillColor("#000000")
        .text(
          `${index + 1}. ${String(row.Utang ?? row.Periode ?? row.Tanggal ?? "Data")}`,
          { underline: true },
        );
      for (const [k, v] of Object.entries(row)) {
        if (["Utang", "Periode", "Tanggal"].includes(k)) continue;
        const val = typeof v === "number" ? rupiah(v) : String(v);
        doc.fontSize(9).text(`${k}: ${val}`);
      }
      doc.moveDown(0.6);
      if (doc.y > 740) doc.addPage();
    });
    doc.end();
  });
}

export async function buildExport(
  userId: string,
  kind: ExportKind,
  format: ExportFormat,
  debtId?: string,
) {
  const data = await rowsFor(userId, kind, debtId);
  const buffer =
    format === "csv"
      ? csv(data.rows)
      : format === "xlsx"
        ? await xlsx(data.title, data.rows)
        : await pdf(data.title, data.rows);
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
