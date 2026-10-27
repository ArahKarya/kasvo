import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import type { CategoryKind } from "@/generated/prisma/client";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { DomainError, notFound } from "./errors";
import { idSchema } from "./schemas";

export const CATEGORY_KINDS = ["INCOME", "EXPENSE"] as const satisfies readonly CategoryKind[];

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(CATEGORY_KINDS),
  parentId: idSchema.optional(),
});

export type CreateCategoryInput = z.input<typeof createCategorySchema>;

export interface CategoryRow {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  archivedAt: Date | null;
  transactionCount: number;
}

export async function listCategories(userId: string, opts: { includeArchived?: boolean } = {}): Promise<CategoryRow[]> {
  const rows = await db.category.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { transactions: { where: { deletedAt: null } } } } },
  });
  return rows.map(({ _count, ...c }) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parentId,
    archivedAt: c.archivedAt,
    transactionCount: _count.transactions,
  }));
}

async function assertNameFree(userId: string, kind: CategoryKind, name: string, exceptId?: string): Promise<void> {
  const clash = await db.category.findFirst({
    where: { userId, kind, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new DomainError("CONFLICT", "name_taken", `A category named "${name}" already exists.`, "Use the existing category or pick another name.");
}

export async function createCategory(actor: Actor, input: CreateCategoryInput): Promise<{ id: string }> {
  const data = createCategorySchema.parse(input);
  await assertNameFree(actor.userId, data.kind, data.name);
  if (data.parentId) {
    const parent = await db.category.findFirst({ where: { id: data.parentId, userId: actor.userId } });
    if (!parent) throw notFound("Category", data.parentId);
    if (parent.kind !== data.kind) throw new DomainError("INVALID", "category_kind", "A subcategory must have the same kind as its parent.");
    if (parent.parentId) throw new DomainError("INVALID", "category_nesting", "Categories nest one level deep only.");
  }
  return db.$transaction(async (tx) => {
    const category = await tx.category.create({ data: { ...data, userId: actor.userId } });
    await audit(tx, actor, { action: "category.create", entity: "Category", entityId: category.id, after: category });
    return { id: category.id };
  });
}

export async function renameCategory(actor: Actor, id: string, name: string): Promise<void> {
  const parsed = z.string().trim().min(1).max(60).parse(name);
  const before = await db.category.findFirst({ where: { id, userId: actor.userId } });
  if (!before) throw notFound("Category", id);
  if (parsed.toLowerCase() !== before.name.toLowerCase()) await assertNameFree(actor.userId, before.kind, parsed, id);
  await db.$transaction(async (tx) => {
    const after = await tx.category.update({ where: { id }, data: { name: parsed } });
    await audit(tx, actor, { action: "category.rename", entity: "Category", entityId: id, before, after });
  });
}

/** Archived categories stay on past transactions but are no longer offered for new ones. */
export async function setCategoryArchived(actor: Actor, id: string, archived: boolean): Promise<void> {
  const before = await db.category.findFirst({ where: { id, userId: actor.userId } });
  if (!before) throw notFound("Category", id);
  await db.$transaction(async (tx) => {
    const after = await tx.category.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await audit(tx, actor, { action: archived ? "category.archive" : "category.unarchive", entity: "Category", entityId: id, before, after });
  });
}
