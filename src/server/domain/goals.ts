import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { DomainError, notFound } from "./errors";
import { addDays, parseDay, toDay } from "./dates";
import { goalProgress, type GoalProgress } from "./goal-math";
import { amountSchema, daySchema, idSchema, optionalDaySchema, optionalIdSchema, optionalText, positiveAmountSchema } from "./schemas";

type Tx = Prisma.TransactionClient;

/** The pace of a goal is the average of this many recent days, per month. */
const PACE_DAYS = 90;

export const createGoalSchema = z.object({
  name: z.string().trim().min(1).max(60),
  targetAmount: positiveAmountSchema,
  targetDate: optionalDaySchema,
  accountId: optionalIdSchema,
  note: optionalText(500),
});

export const updateGoalSchema = createGoalSchema.partial().extend({
  /** null clears the field, undefined leaves it alone. */
  targetDate: z.union([z.null(), z.literal("").transform(() => null), daySchema]).optional(),
  accountId: z.union([z.null(), z.literal("").transform(() => null), idSchema]).optional(),
});

export const contributeSchema = z.object({
  goalId: idSchema,
  /** Negative takes money back out of the goal. */
  amount: amountSchema.refine((v) => v !== 0n, "Amount cannot be zero."),
  bookedOn: daySchema,
  note: optionalText(200),
});

export interface GoalView {
  id: string;
  name: string;
  targetAmount: bigint;
  targetDate: string | null;
  accountId: string | null;
  accountName: string | null;
  note: string | null;
  archived: boolean;
  createdOn: string;
  progress: GoalProgress;
}

export interface GoalDetail extends GoalView {
  contributions: { id: string; bookedOn: string; amount: bigint; note: string | null }[];
}

async function checkAccount(tx: Tx, userId: string, id: string): Promise<void> {
  const account = await tx.account.findFirst({ where: { id, userId } });
  if (!account) throw notFound("Account", id);
  if (account.archivedAt) throw new DomainError("INVALID", "archived", `Account "${account.name}" is archived.`);
}

async function assertNameFree(tx: Tx, userId: string, name: string, exceptId?: string): Promise<void> {
  const clash = await tx.goal.findFirst({ where: { userId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
  if (clash) throw new DomainError("CONFLICT", "name_taken", `A goal named "${name}" already exists.`);
}

const sumBy = <K extends string>(rows: { key: K | null; sum: bigint | null }[]): Map<K, bigint> =>
  new Map(rows.flatMap((r) => (r.key ? [[r.key, r.sum ?? 0n] as [K, bigint]] : [])));

export async function listGoals(userId: string, today: string, opts: { includeArchived?: boolean; ids?: string[] } = {}): Promise<GoalView[]> {
  const goals = await db.goal.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { archivedAt: null }), ...(opts.ids ? { id: { in: opts.ids } } : {}) },
    include: { account: { select: { name: true, openingBalance: true } } },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { targetDate: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  });
  const since = parseDay(addDays(today, -PACE_DAYS))!;
  const goalIds = goals.map((g) => g.id);
  const accountIds = [...new Set(goals.flatMap((g) => (g.accountId ? [g.accountId] : [])))];
  const live = { userId, deletedAt: null, accountId: { in: accountIds } };

  const [saved, savedRecent, balance, balanceRecent] = await Promise.all([
    db.goalContribution.groupBy({ by: ["goalId"], where: { goalId: { in: goalIds } }, _sum: { amount: true } }),
    db.goalContribution.groupBy({ by: ["goalId"], where: { goalId: { in: goalIds }, bookedOn: { gte: since } }, _sum: { amount: true } }),
    db.transaction.groupBy({ by: ["accountId"], where: live, _sum: { amount: true } }),
    db.transaction.groupBy({ by: ["accountId"], where: { ...live, bookedOn: { gte: since } }, _sum: { amount: true } }),
  ]);
  const savedMap = sumBy(saved.map((r) => ({ key: r.goalId, sum: r._sum.amount })));
  const savedRecentMap = sumBy(savedRecent.map((r) => ({ key: r.goalId, sum: r._sum.amount })));
  const balanceMap = sumBy(balance.map((r) => ({ key: r.accountId, sum: r._sum.amount })));
  const balanceRecentMap = sumBy(balanceRecent.map((r) => ({ key: r.accountId, sum: r._sum.amount })));
  const months = BigInt(PACE_DAYS / 30);

  return goals.map((g) => {
    const linked = g.accountId && g.account;
    const amount = linked ? g.account!.openingBalance + (balanceMap.get(g.accountId!) ?? 0n) : (savedMap.get(g.id) ?? 0n);
    const recent = linked ? (balanceRecentMap.get(g.accountId!) ?? 0n) : (savedRecentMap.get(g.id) ?? 0n);
    const targetDate = g.targetDate ? toDay(g.targetDate) : null;
    const createdOn = toDay(g.createdAt);
    return {
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      targetDate,
      accountId: g.accountId,
      accountName: g.account?.name ?? null,
      note: g.note,
      archived: g.archivedAt !== null,
      createdOn,
      progress: goalProgress({ target: g.targetAmount, saved: amount, targetDate, startedOn: createdOn, today, monthlyRate: recent / months }),
    };
  });
}

export async function getGoal(userId: string, id: string, today: string): Promise<GoalDetail> {
  const [goal] = await listGoals(userId, today, { includeArchived: true, ids: [id] });
  if (!goal) throw notFound("Goal", id);
  const rows = await db.goalContribution.findMany({ where: { goalId: id, userId }, orderBy: [{ bookedOn: "desc" }, { createdAt: "desc" }], take: 100 });
  return { ...goal, contributions: rows.map((r) => ({ id: r.id, bookedOn: toDay(r.bookedOn), amount: r.amount, note: r.note })) };
}

export async function createGoal(actor: Actor, input: z.input<typeof createGoalSchema>): Promise<{ id: string }> {
  const data = createGoalSchema.parse(input);
  return db.$transaction(async (tx) => {
    await assertNameFree(tx, actor.userId, data.name);
    if (data.accountId) await checkAccount(tx, actor.userId, data.accountId);
    const row = await tx.goal.create({ data: { userId: actor.userId, ...data } });
    await audit(tx, actor, { action: "goal.create", entity: "Goal", entityId: row.id, after: row });
    return { id: row.id };
  });
}

export async function updateGoal(actor: Actor, id: string, input: z.input<typeof updateGoalSchema>): Promise<void> {
  const patch = updateGoalSchema.parse(input);
  await db.$transaction(async (tx) => {
    const before = await tx.goal.findFirst({ where: { id, userId: actor.userId } });
    if (!before) throw notFound("Goal", id);
    if (patch.name) await assertNameFree(tx, actor.userId, patch.name, id);
    if (patch.accountId) await checkAccount(tx, actor.userId, patch.accountId);
    const after = await tx.goal.update({ where: { id }, data: patch });
    await audit(tx, actor, { action: "goal.update", entity: "Goal", entityId: id, before, after });
  });
}

export async function setGoalArchived(actor: Actor, id: string, archived: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.goal.findFirst({ where: { id, userId: actor.userId } });
    if (!before) throw notFound("Goal", id);
    await tx.goal.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await audit(tx, actor, { action: archived ? "goal.archive" : "goal.unarchive", entity: "Goal", entityId: id });
  });
}

/** Records money set aside for a goal. Goals linked to an account follow its balance instead. */
export async function contributeToGoal(actor: Actor, input: z.input<typeof contributeSchema>): Promise<{ id: string }> {
  const data = contributeSchema.parse(input);
  return db.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({ where: { id: data.goalId, userId: actor.userId } });
    if (!goal) throw notFound("Goal", data.goalId);
    if (goal.accountId) {
      throw new DomainError("INVALID", "goal_linked", `"${goal.name}" follows an account balance.`, "Record a transfer into the linked account instead.");
    }
    const row = await tx.goalContribution.create({ data: { userId: actor.userId, ...data } });
    await audit(tx, actor, { action: "goal.contribute", entity: "Goal", entityId: goal.id, after: row });
    return { id: row.id };
  });
}

export async function removeContribution(actor: Actor, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.goalContribution.findFirst({ where: { id, userId: actor.userId } });
    if (!before) throw notFound("Contribution", id);
    await tx.goalContribution.delete({ where: { id } });
    await audit(tx, actor, { action: "goal.contribution.remove", entity: "Goal", entityId: before.goalId, before });
  });
}
