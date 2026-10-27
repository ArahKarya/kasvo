import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import type { Rule } from "@/generated/prisma/client";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { notFound } from "./errors";
import { matchRule } from "./rule-match";
import { idSchema, optionalText, positiveAmountSchema } from "./schemas";

export const ruleSchema = z
  .object({
    contains: z.string().trim().min(2).max(100),
    categoryId: idSchema,
    accountId: idSchema.optional(),
    minAmount: positiveAmountSchema.optional(),
    maxAmount: positiveAmountSchema.optional(),
    setPayee: optionalText(120),
    priority: z.number().int().min(0).max(10_000).default(100),
  })
  .refine((r) => !r.minAmount || !r.maxAmount || r.minAmount <= r.maxAmount, { message: "minAmount must not exceed maxAmount.", path: ["maxAmount"] });

export type RuleInput = z.input<typeof ruleSchema>;

export interface RuleRow extends Rule {
  categoryName: string;
  accountName: string | null;
}

/** Enabled rules in the order they are tried. */
export async function activeRules(userId: string): Promise<Rule[]> {
  return db.rule.findMany({ where: { userId, enabled: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
}

export async function listRules(userId: string): Promise<RuleRow[]> {
  const rows = await db.rule.findMany({
    where: { userId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    include: { category: { select: { name: true } }, account: { select: { name: true } } },
  });
  return rows.map(({ category, account, ...r }) => ({ ...r, categoryName: category.name, accountName: account?.name ?? null }));
}

/** The rule only fires on transactions whose direction matches its category's kind. */
export async function createRule(actor: Actor, input: RuleInput): Promise<{ id: string; matchesExisting: number }> {
  const data = ruleSchema.parse(input);
  const category = await db.category.findFirst({ where: { id: data.categoryId, userId: actor.userId } });
  if (!category) throw notFound("Category", data.categoryId);
  if (data.accountId && !(await db.account.findFirst({ where: { id: data.accountId, userId: actor.userId } }))) throw notFound("Account", data.accountId);

  const rule = await db.$transaction(async (tx) => {
    const row = await tx.rule.create({ data: { ...data, kind: category.kind, userId: actor.userId } });
    await audit(tx, actor, { action: "rule.create", entity: "Rule", entityId: row.id, after: row });
    return row;
  });
  return { id: rule.id, matchesExisting: (await uncategorizedMatches(actor.userId, [rule])).length };
}

export async function setRuleEnabled(actor: Actor, id: string, enabled: boolean): Promise<void> {
  const before = await db.rule.findFirst({ where: { id, userId: actor.userId } });
  if (!before) throw notFound("Rule", id);
  await db.$transaction(async (tx) => {
    const after = await tx.rule.update({ where: { id }, data: { enabled } });
    await audit(tx, actor, { action: enabled ? "rule.enable" : "rule.disable", entity: "Rule", entityId: id, before, after });
  });
}

export async function deleteRule(actor: Actor, id: string): Promise<void> {
  const before = await db.rule.findFirst({ where: { id, userId: actor.userId } });
  if (!before) throw notFound("Rule", id);
  await db.$transaction(async (tx) => {
    await tx.rule.delete({ where: { id } });
    await audit(tx, actor, { action: "rule.delete", entity: "Rule", entityId: id, before });
  });
}

/** Uncategorized, non-transfer transactions that the given rules would categorize. */
async function uncategorizedMatches(userId: string, rules: Rule[]) {
  const rows = await db.transaction.findMany({
    where: { userId, deletedAt: null, transferId: null, categoryId: null },
    select: { id: true, description: true, payee: true, amount: true, accountId: true },
  });
  return rows.flatMap((row) => {
    const rule = matchRule(rules, row);
    return rule ? [{ id: row.id, payee: row.payee, rule }] : [];
  });
}

/** Runs rules over every uncategorized transaction. Returns how many were categorized. */
export async function applyRules(actor: Actor, ruleId?: string): Promise<number> {
  const rules = (await activeRules(actor.userId)).filter((r) => !ruleId || r.id === ruleId);
  const matches = await uncategorizedMatches(actor.userId, rules);
  if (matches.length === 0) return 0;
  await db.$transaction(async (tx) => {
    for (const m of matches) {
      await tx.transaction.update({
        where: { id: m.id },
        data: { categoryId: m.rule.categoryId, ...(m.rule.setPayee && !m.payee ? { payee: m.rule.setPayee } : {}) },
      });
    }
    await audit(tx, actor, {
      action: "rule.apply",
      entity: "Transaction",
      entityId: ruleId ?? "all-rules",
      after: { count: matches.length, ids: matches.map((m) => m.id) },
    });
  });
  return matches.length;
}
