import Papa from "papaparse";
import { z } from "zod";
import { parseStatementDate } from "./dates";
import { directionOf, parseStatementAmount } from "./numbers";

/** One statement line after parsing, before dedup and rules. */
export interface ParsedRow {
  line: number;
  bookedOn: Date;
  /** Signed: negative is money out. */
  amount: bigint;
  description: string;
}

/** Which column holds what. Indices are zero-based within the header row. */
export const mappingSchema = z
  .object({
    headerRow: z.number().int().min(0),
    date: z.number().int().min(0),
    description: z.array(z.number().int().min(0)).min(1),
    /** A single signed amount, possibly with a DB/CR suffix. */
    amount: z.number().int().min(0).optional(),
    /** Separate money-out and money-in columns. */
    debit: z.number().int().min(0).optional(),
    credit: z.number().int().min(0).optional(),
    /** Separate D/K marker column next to an unsigned amount. */
    direction: z.number().int().min(0).optional(),
    /** Transaction status (e-wallets); failed or cancelled rows are skipped. */
    status: z.number().int().min(0).optional(),
    dateOrder: z.enum(["DMY", "MDY", "YMD"]).default("DMY"),
  })
  .refine((m) => m.amount !== undefined || (m.debit !== undefined && m.credit !== undefined), "Map either an amount column or both debit and credit.");

export type ColumnMapping = z.output<typeof mappingSchema>;

export type ParseResult =
  | { ok: true; format: string; mapping: ColumnMapping; rows: ParsedRow[]; skipped: number }
  | { ok: false; reason: "empty" | "unrecognised"; preview: string[][] };

/** Header names per role, after `norm`. Banks and e-wallets (GoPay, OVO, DANA, ShopeePay exports). */
export const ALIASES = {
  date: [
    "tanggal", "tgl", "tanggaltransaksi", "tgltransaksi", "tgltran", "date", "transactiondate", "postingdate", "tanggalpembukuan", "postdate", "txndate",
    "waktu", "waktutransaksi", "tanggaldanwaktu", "tanggalwaktu", "datetime", "time", "createdat",
  ],
  description: [
    "keterangan", "uraian", "uraiantransaksi", "deskripsi", "description", "desktran", "remark", "remarks", "transactiondescription", "details", "detail", "berita",
    "detailtransaksi", "namatransaksi", "transaksi", "merchant", "namamerchant", "penerima", "catatan",
  ],
  amount: ["jumlah", "nominal", "amount", "mutasi", "nilai", "jumlahtransaksi", "total", "nominaltransaksi"],
  debit: ["debit", "debet", "mutasidebet", "mutasidebit", "withdrawal", "withdrawals", "keluar", "uangkeluar", "pengeluaran"],
  credit: ["kredit", "credit", "mutasikredit", "deposit", "deposits", "masuk", "uangmasuk", "pemasukan"],
  direction: ["tipe", "type", "dk", "dbcr", "jenis", "drcr", "posisi", "jenistransaksi", "tipetransaksi", "kategori"],
  balance: ["saldo", "balance", "saldoakhir", "runningbalance"],
  status: ["status", "statustransaksi"],
} as const;

export const norm = (cell: string): string => cell.toLowerCase().replace(/[^a-z]/g, "");

/** Failed, cancelled, or still pending e-wallet transactions never moved money. */
export const isFailedStatus = (status: string): boolean => /gagal|batal|failed|fail|cancel|expired|kedaluwarsa|pending|menunggu|refunded/i.test(status);

const findAll = (headers: string[], names: readonly string[]): number[] => headers.flatMap((h, i) => (names.includes(norm(h) as never) ? [i] : []));

/** Guesses the mapping from the first row that has a date column and some amount column. */
export function detectMapping(table: string[][]): ColumnMapping | null {
  for (let headerRow = 0; headerRow < Math.min(table.length, 30); headerRow++) {
    const headers = table[headerRow];
    const [date] = findAll(headers, ALIASES.date);
    const description = findAll(headers, ALIASES.description);
    const [amount] = findAll(headers, ALIASES.amount);
    const [debit] = findAll(headers, ALIASES.debit);
    const [credit] = findAll(headers, ALIASES.credit);
    const [direction] = findAll(headers, ALIASES.direction);
    const [status] = findAll(headers, ALIASES.status);
    if (date === undefined || description.length === 0) continue;
    if (debit !== undefined && credit !== undefined) return { headerRow, date, description, debit, credit, status, dateOrder: guessOrder(table, headerRow, date) };
    if (amount !== undefined) return { headerRow, date, description, amount, direction, status, dateOrder: guessOrder(table, headerRow, date) };
  }
  return null;
}

/** ISO dates ("2026-10-12 14:03") are common in e-wallet exports; everything else is day-first. */
function guessOrder(table: string[][], headerRow: number, date: number): "DMY" | "YMD" {
  const sample = table.slice(headerRow + 1, headerRow + 6).map((r) => r[date] ?? "");
  return sample.some((v) => /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(v.trim())) ? "YMD" : "DMY";
}

/** A name for the UI, from the header row's shape; parsing itself is the same for every bank. */
export function guessBank(text: string, headers: string[]): string {
  const h = headers.map(norm);
  const has = (...names: string[]) => names.every((n) => h.includes(n));
  if (has("tanggaltransaksi", "keterangan", "cabang", "jumlah")) return "bca";
  if (has("valdate", "transactioncode") || /mandiri|livin/i.test(text.slice(0, 2000))) return "mandiri";
  if (has("tgltran", "desktran")) return "bri";
  if (has("uraiantransaksi", "tipe", "nominal")) return "bni";
  const wallet = /\b(gopay|ovo|dana|shopeepay|linkaja)\b/i.exec(text.slice(0, 2000));
  if (wallet) return wallet[1].toLowerCase();
  return "csv";
}

/**
 * The statement's year, for dates printed without one: "Periode : 01/10/2026 - 31/10/2026",
 * "PERIODE : OKTOBER 2026", or "Periode 1 Okt 2026 - 31 Okt 2026" (the last year wins).
 */
export function statementYear(text: string): number | undefined {
  const head = text.slice(0, 4000);
  const slashed = /periode[^\n\d]*\d{1,2}\/\d{1,2}\/(\d{4})\s*[-–sd.]+\s*\d{1,2}\/\d{1,2}\/(\d{4})/i.exec(head);
  if (slashed) return Number(slashed[2]);
  const named = /periode[^\n]*?(\d{4})(?![\d/])(?:[^\n]*?(\d{4})(?![\d/]))?/i.exec(head);
  if (named) return Number(named[2] ?? named[1]);
  return undefined;
}

export function readTable(text: string): string[][] {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy", delimitersToGuess: [",", ";", "\t", "|"] });
  return result.data.map((row) => row.map((cell) => (cell ?? "").trim()));
}

export function parseCsv(text: string, explicit?: ColumnMapping): ParseResult {
  const table = readTable(text);
  if (table.length === 0) return { ok: false, reason: "empty", preview: [] };
  const mapping = explicit ?? detectMapping(table);
  if (!mapping) return { ok: false, reason: "unrecognised", preview: table.slice(0, 15) };

  const year = statementYear(text) ?? new Date().getUTCFullYear();
  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (let i = mapping.headerRow + 1; i < table.length; i++) {
    const row = parseLine(table[i], mapping, year, i + 1);
    if (row) rows.push(row);
    else skipped++;
  }
  return { ok: true, format: explicit ? "csv" : guessBank(text, table[mapping.headerRow]), mapping, rows, skipped };
}

/** Null for lines that are not transactions: totals, opening balance, blank amounts. */
function parseLine(cells: string[], m: ColumnMapping, year: number, line: number): ParsedRow | null {
  if (m.status !== undefined && isFailedStatus(cells[m.status] ?? "")) return null;
  const bookedOn = parseStatementDate(cells[m.date] ?? "", m.dateOrder, year);
  if (!bookedOn) return null;
  const description = m.description
    .map((i) => cells[i] ?? "")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!description) return null;

  let amount: bigint | null;
  if (m.amount !== undefined) {
    amount = parseStatementAmount(cells[m.amount] ?? "");
    const dir = m.direction !== undefined ? directionOf(cells[m.direction] ?? "") : null;
    if (amount !== null && dir !== null) amount = (amount < 0n ? -amount : amount) * BigInt(dir);
  } else {
    const out = parseStatementAmount(cells[m.debit!] ?? "") ?? 0n;
    const into = parseStatementAmount(cells[m.credit!] ?? "") ?? 0n;
    amount = (into < 0n ? -into : into) - (out < 0n ? -out : out);
  }
  if (amount === null || amount === 0n) return null;
  return { line, bookedOn, amount, description };
}
