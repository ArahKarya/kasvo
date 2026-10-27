import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { computeBudgetLines, monthProgress, type BudgetLine, type MonthProgress } from "./budget-math";
import { DomainError, notFound } from "./errors";
import { monthRange } from "./dates";
import { amountSchema, idSchema } from "./schemas";

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM.");

export const setBudgetSchema = z.object({
  categoryId: idSchema,
  month: monthSchema,
  /** 0 removes the budget. */
  amount: amountSchema.refine((v) => v >= 0n, "Budget cannot be negative."),
});

export interface BudgetStatus {
  month: string;
  progress: MonthProgress;
  lines: BudgetLine[];
  budgeted: bigint;
  /** Spending in categories that have a budget (each transaction counted once). */
  spentInBudgets: bigint;
  /** All spending this month, budgeted or not. Transfers are excluded. */
  totalSpending: bigint;
  /** Biggest spending categories without a budget. */
  unbudgeted: { categoryId: string | null; name: string; spent: bigint }[];
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

async function expenseByCategory(userId: string, from: Date, to: Date): Promise<Map<string | null, bigint>> {
  const groups = await db.transaction.groupBy({
    by: ["categoryId"],
    where: { userId, deletedAt: null, transferId: null, amount: { lt: 0n }, bookedOn: { gte: from, lt: to } },
    _sum: { amount: true },
  });
  return new Map(groups.map((g) => [g.categoryId, -(g._sum.amount ?? 0n)]));
}

export async function budgetStatus(userId: string, month: string, today: string): Promise<BudgetStatus> {
  monthSchema.parse(month);
  const range = monthRange(month)!;
  const avgFrom = monthRange(shiftMonth(month, -3))!.start;
  const [budgets, categories, spent, prior] = await Promise.all([
    db.budget.findMany({ where: { userId, month } }),
    db.category.findMany({ where: { userId, kind: "EXPENSE" }, select: { id: true, name: true, parentId: true } }),
    expenseByCategory(userId, range.start, range.end),
    expenseByCategory(userId, avgFrom, range.start),
  ]);

  const name = new Map(categories.map((c) => [c.id, c.name]));
  const coversOf = (id: string) => [id, ...categories.filter((c) => c.parentId === id).map((c) => c.id)];
  const spentMap = new Map([...spent].filter((e): e is [string, bigint] => e[0] !== null));
  const average = new Map([...prior].flatMap(([id, v]) => (id ? [[id, v / 3n] as [string, bigint]] : [])));

  const lines = computeBudgetLines(
    budgets.map((b) => ({ categoryId: b.categoryId, name: name.get(b.categoryId) ?? "?", amount: b.amount, covers: coversOf(b.categoryId) })),
    spentMap,
    average,
    monthProgress(month, today),
  );
  const covered = new Set(lines.flatMap((l) => l.covers));
  const totalSpending = [...spent.values()].reduce((s, v) => s + v, 0n);
  const spentInBudgets = [...spentMap].filter(([id]) => covered.has(id)).reduce((s, [, v]) => s + v, 0n);
  const unbudgeted = [...spent]
    .filter(([id]) => id === null || !covered.has(id))
    .map(([id, v]) => ({ categoryId: id, name: id ? (name.get(id) ?? "?") : "(uncategorized)", spent: v }))
    .sort((a, b) => (b.spent > a.spent ? 1 : -1))
    .slice(0, 8);

  return {
    month,
    progress: monthProgress(month, today),
    lines,
    budgeted: lines.reduce((s, l) => s + l.amount, 0n),
    spentInBudgets,
    totalSpending,
    unbudgeted,
  };
}

/** Sets, changes, or (with 0) removes one category's budget for a month. */
export async function setBudget(actor: Actor, input: z.input<typeof setBudgetSchema>): Promise<void> {
  const data = setBudgetSchema.parse(input);
  const category = await db.category.findFirst({ where: { id: data.categoryId, userId: actor.userId } });
  if (!category) throw notFound("Category", data.categoryId);
  if (category.kind !== "EXPENSE") throw new DomainError("INVALID", "category_kind", "Budgets apply to expense categories only.");
  const key = { userId_categoryId_month: { userId: actor.userId, categoryId: data.categoryId, month: data.month } };

  await db.$transaction(async (tx) => {
    const before = await tx.budget.findUnique({ where: key });
    if (data.amount === 0n) {
      if (before) await tx.budget.delete({ where: key });
    } else {
      await tx.budget.upsert({ where: key, create: { userId: actor.userId, categoryId: data.categoryId, month: data.month, amount: data.amount }, update: { amount: data.amount } });
    }
    await audit(tx, actor, { action: data.amount === 0n ? "budget.remove" : "budget.set", entity: "Budget", entityId: `${data.categoryId}:${data.month}`, before, after: data });
  });
}

/** Copies one month's budgets into another, leaving budgets that already exist there alone. */
export async function copyBudgets(actor: Actor, from: string, to: string): Promise<number> {
  monthSchema.parse(from);
  monthSchema.parse(to);
  const [source, existing] = await Promise.all([
    db.budget.findMany({ where: { userId: actor.userId, month: from } }),
    db.budget.findMany({ where: { userId: actor.userId, month: to }, select: { categoryId: true } }),
  ]);
  const taken = new Set(existing.map((b) => b.categoryId));
  const fresh = source.filter((b) => !taken.has(b.categoryId));
  if (fresh.length === 0) return 0;
  await db.$transaction(async (tx) => {
    await tx.budget.createMany({ data: fresh.map((b) => ({ userId: actor.userId, categoryId: b.categoryId, month: to, amount: b.amount })) });
    await audit(tx, actor, { action: "budget.copy", entity: "Budget", entityId: `${from}->${to}`, after: { count: fresh.length } });
  });
  return fresh.length;
}

export const previousMonth = (month: string): string => shiftMonth(month, -1);
export const nextMonth = (month: string): string => shiftMonth(month, 1);
