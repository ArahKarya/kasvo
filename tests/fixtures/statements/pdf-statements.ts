/**
 * Synthetic statement PDFs shaped like common Indonesian layouts. All names, numbers, and
 * amounts are made up; real statements are never committed.
 */
import { buildPdf, tablePage, type PdfCell } from "../pdf-builder";

type Row = [number, string][];

/** KlikBCA-style e-statement: dates without a year, DB suffix, multi-line descriptions, password-protected. */
export function bcaStatementPdf(password = "01011990"): Uint8Array<ArrayBuffer> {
  const header: Row = [[40, "TANGGAL"], [95, "KETERANGAN"], [330, "CBG"], [420, "MUTASI"], [560, "SALDO"]];
  const page1: Row[] = [
    [[40, "REKENING TAHAPAN"], [420, "PERIODE : OKTOBER 2026"]],
    [[40, "BUDI CONTOH"], [420, "NO. REKENING : 0000000000"]],
    header,
    [[40, "01/10"], [95, "SALDO AWAL"], [548, "10,000,000.00"]],
    [[40, "02/10"], [95, "TRSF E-BANKING DB"], [330, "0000"], [400, "1,500,000.00 DB"], [548, "8,500,000.00"]],
    [[95, "0210/FTSCY/WS95051"]],
    [[95, "KOST OKTOBER"]],
    [[40, "05/10"], [95, "KARTU DEBIT INDOMARET"], [410, "85,500.00 DB"], [552, "8,414,500.00"]],
    [[40, "25/10"], [95, "TRSF E-BANKING CR"], [400, "12,000,000.00"], [548, "20,414,500.00"]],
    [[95, "GAJI OKTOBER PT MAJU"]],
    [[40, "Bersambung ke halaman berikut"]],
  ];
  const page2: Row[] = [
    header,
    [[40, "28/10"], [95, "BIAYA ADM"], [410, "15,000.00 DB"], [548, "20,399,500.00"]],
    [[95, "SALDO AKHIR"], [548, "20,399,500.00"]],
  ];
  return buildPdf([tablePage(page1), tablePage(page2)], { userPassword: password });
}

/** Debit and credit in separate columns, full Indonesian dates, comma decimals. */
export function mandiriStatementPdf(): Uint8Array<ArrayBuffer> {
  const rows: Row[] = [
    [[40, "Mandiri Rekening Koran"], [400, "Periode 1 Okt 2026 - 31 Okt 2026"]],
    [[40, "Tanggal"], [130, "Keterangan"], [430, "Debit"], [530, "Kredit"], [630, "Saldo"]],
    [[40, "01 Okt 2026"], [130, "Saldo Awal"], [620, "5.000.000,00"]],
    [[40, "03 Okt 2026"], [130, "Pembayaran PLN Prabayar"], [415, "250.000,00"], [540, "0,00"], [620, "4.750.000,00"]],
    [[40, "10 Okt 2026"], [130, "Transfer dari ANI"], [440, "0,00"], [512, "1.000.000,00"], [620, "5.750.000,00"]],
  ];
  return buildPdf([tablePage(rows)]);
}

/** E-wallet history: ISO date-times, signed rupiah amounts, failed transactions to skip. */
export function gopayHistoryPdf(): Uint8Array<ArrayBuffer> {
  const rows: Row[] = [
    [[40, "Riwayat Transaksi GoPay"]],
    [[40, "Waktu"], [160, "Detail Transaksi"], [420, "Status"], [520, "Nominal"]],
    [[40, "2026-10-12 14:03"], [160, "GoFood - Warung Contoh"], [420, "Berhasil"], [515, "-Rp45.000"]],
    [[40, "2026-10-13 08:10"], [160, "Top Up dari BCA"], [420, "Berhasil"], [510, "+Rp200.000"]],
    [[40, "2026-10-14 19:22"], [160, "GoRide"], [420, "Gagal"], [515, "-Rp18.000"]],
    [[40, "2026-10-15 07:45"], [160, "Bayar QRIS Kopi Contoh"], [420, "Berhasil"], [515, "-Rp22.000"]],
  ];
  return buildPdf([tablePage(rows)]);
}

export const scannedLikePdf = (): Uint8Array<ArrayBuffer> => buildPdf([[] as PdfCell[]]);
