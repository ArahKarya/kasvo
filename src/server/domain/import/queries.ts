import "server-only";

import { db } from "@/server/db";
import type { ImportBatch, StagedRow } from "@/generated/prisma/client";

export interface ImportSummary extends Omit<ImportBatch, "rawContent" | "mapping"> {
  accountName: string;
}

export interface ImportDetail extends ImportSummary {
  hasFile: boolean;
  rows: (StagedRow & { categoryName: string | null })[];
}

export async function listImports(userId: string, limit = 50): Promise<ImportSummary[]> {
  const rows = await db.importBatch.findMany({
    where: { userId, status: { not: "DISCARDED" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    omit: { rawContent: true, mapping: true },
    include: { account: { select: { name: true } } },
  });
  return rows.map(({ account, ...b }) => ({ ...b, accountName: account.name }));
}

export async function getImport(userId: string, batchId: string): Promise<ImportDetail | null> {
  const batch = await db.importBatch.findFirst({
    where: { id: batchId, userId },
    omit: { mapping: true },
    include: {
      account: { select: { name: true } },
      rows: { orderBy: { line: "asc" }, include: { category: { select: { name: true } } } },
    },
  });
  if (!batch) return null;
  const { account, rows, rawContent, ...rest } = batch;
  return {
    ...rest,
    accountName: account.name,
    hasFile: rawContent !== null,
    rows: rows.map(({ category, ...r }) => ({ ...r, categoryName: category?.name ?? null })),
  };
}

/** The stored file's first lines, for the column-mapping screen. */
export async function importPreview(userId: string, batchId: string): Promise<string[][] | null> {
  const batch = await db.importBatch.findFirst({ where: { id: batchId, userId }, select: { rawContent: true } });
  if (!batch?.rawContent) return null;
  const { readTable } = await import("./csv");
  return readTable(batch.rawContent).slice(0, 15);
}
