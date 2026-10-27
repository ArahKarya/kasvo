import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/server/db";
import { DomainError } from "@/server/domain/errors";
import { contributeToGoal, createGoal, getGoal, listGoals, updateGoal, type GoalView } from "@/server/domain/goals";
import { createDebt, getDebt, listDebts, payDebt, type DebtView } from "@/server/domain/debts";
import type { McpContext } from "../context";
import { money, run } from "../result";
import { resolveAccount, resolveCategory, today } from "../resolve";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const amount = z.union([z.number(), z.string()]);

/** Accepts a goal or debt id or its exact name (case-insensitive). */
async function resolveNamed(ctx: McpContext, kind: "goal" | "debt", ref: string): Promise<string> {
  const where = { userId: ctx.actor.userId, OR: [{ id: ref }, { name: { equals: ref, mode: "insensitive" as const } }] };
  const row = kind === "goal" ? await db.goal.findFirst({ where, select: { id: true } }) : await db.debt.findFirst({ where, select: { id: true } });
  if (row) return row.id;
  throw new DomainError("NOT_FOUND", "not_found", `No ${kind} matches "${ref}".`, `Call kasvo_list_${kind}s for names and ids.`);
}

function goalOut(ctx: McpContext, g: GoalView) {
  const p = g.progress;
  return {
    id: g.id,
    name: g.name,
    target: money(ctx, g.targetAmount),
    targetDate: g.targetDate,
    trackedBy: g.accountName ? `balance of account "${g.accountName}"` : "manual contributions",
    saved: money(ctx, p.saved),
    remaining: money(ctx, p.remaining),
    reachedPct: Math.round(p.reached * 1000) / 10,
    state: p.state,
    monthsLeft: p.monthsLeft,
    neededPerMonth: p.neededPerMonth === null ? null : money(ctx, p.neededPerMonth),
    projectedOnAtRecentPace: p.projectedOn,
    archived: g.archived,
  };
}

function debtOut(ctx: McpContext, d: DebtView) {
  const s = d.status;
  return {
    id: d.id,
    name: d.name,
    direction: d.direction === "BORROWED" ? "I owe" : "owed to me",
    counterparty: d.counterparty,
    principal: money(ctx, d.principal),
    instalment: money(ctx, d.instalmentAmount),
    instalments: `${s.paidCount}/${d.instalmentCount} paid`,
    annualRatePct: d.annualRate,
    linkedAccount: d.accountName,
    totalDue: money(ctx, s.totalDue),
    paid: money(ctx, s.paid),
    outstanding: money(ctx, s.outstanding),
    state: s.state,
    overdue: s.overdueCount ? { instalments: s.overdueCount, amount: money(ctx, s.overdueAmount) } : null,
    next: s.next ? { seq: s.next.seq, dueOn: s.next.dueOn, amountLeft: money(ctx, s.next.amount - s.next.paid) } : null,
    endsOn: s.endsOn,
    archived: d.archived,
  };
}

export function registerPlanTools(server: McpServer, ctx: McpContext): void {
  const userId = ctx.actor.userId;

  server.registerTool(
    "kasvo_list_goals",
    {
      title: "List savings goals",
      description:
        "Savings goals with progress, what is needed per month to hit the target date, the projected date at the pace of the last 90 days, and a state (achieved / on_track / behind / overdue / open). A goal follows either a linked account's balance or manual contributions.",
      inputSchema: { includeArchived: z.boolean().optional() },
      annotations: READ,
    },
    ({ includeArchived }) => run(async () => ({ goals: (await listGoals(userId, today(ctx), { includeArchived })).map((g) => goalOut(ctx, g)) })),
  );

  server.registerTool(
    "kasvo_list_debts",
    {
      title: "List debts and receivables",
      description:
        "Debts the user owes and money owed to them, with outstanding amount, instalments paid, the next due instalment, overdue instalments, and a state (active / due_soon within 7 days / overdue / settled).",
      inputSchema: { includeArchived: z.boolean().optional() },
      annotations: READ,
    },
    ({ includeArchived }) => run(async () => ({ debts: (await listDebts(userId, today(ctx), { includeArchived })).map((d) => debtOut(ctx, d)) })),
  );

  server.registerTool(
    "kasvo_get_debt",
    {
      title: "Debt schedule and payments",
      description: "One debt with its full instalment schedule (status per instalment) and every recorded payment.",
      inputSchema: { debt: z.string().describe("Debt id or name") },
      annotations: READ,
    },
    ({ debt }) =>
      run(async () => {
        const d = await getDebt(userId, await resolveNamed(ctx, "debt", debt), today(ctx));
        return {
          ...debtOut(ctx, d),
          schedule: d.status.lines.map((l) => ({ seq: l.seq, dueOn: l.dueOn, amount: money(ctx, l.amount), paid: money(ctx, l.paid), status: l.status })),
          payments: d.payments.map((p) => ({ id: p.id, paidOn: p.paidOn, amount: money(ctx, p.amount), account: p.accountName, transactionId: p.transactionId, note: p.note })),
        };
      }),
  );

  if (!ctx.scopes.includes("write")) return;

  server.registerTool(
    "kasvo_create_goal",
    {
      title: "Create a savings goal",
      description: "Creates a savings goal. Pass `account` to track a dedicated savings account's balance; otherwise progress comes from kasvo_contribute_goal.",
      inputSchema: {
        name: z.string(),
        target: amount.describe('e.g. 25000000 or "25jt"'),
        targetDate: z.string().optional().describe("YYYY-MM-DD"),
        account: z.string().optional().describe("Account id or name whose balance is the progress"),
        note: z.string().optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const { id } = await createGoal(ctx.actor, {
          name: a.name,
          targetAmount: a.target,
          targetDate: a.targetDate,
          accountId: a.account ? await resolveAccount(ctx, a.account) : undefined,
          note: a.note,
        });
        return goalOut(ctx, (await getGoal(userId, id, today(ctx))));
      }),
  );

  server.registerTool(
    "kasvo_update_goal",
    {
      title: "Update a savings goal",
      description: "Changes a goal's name, target, date, linked account, or note. Pass null to clear the date or the account.",
      inputSchema: {
        goal: z.string().describe("Goal id or name"),
        name: z.string().optional(),
        target: amount.optional(),
        targetDate: z.string().nullable().optional(),
        account: z.string().nullable().optional(),
        note: z.string().optional(),
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    (a) =>
      run(async () => {
        const id = await resolveNamed(ctx, "goal", a.goal);
        await updateGoal(ctx.actor, id, {
          name: a.name,
          targetAmount: a.target,
          targetDate: a.targetDate,
          accountId: a.account === undefined || a.account === null ? a.account : await resolveAccount(ctx, a.account),
          note: a.note,
        });
        return goalOut(ctx, await getGoal(userId, id, today(ctx)));
      }),
  );

  server.registerTool(
    "kasvo_contribute_goal",
    {
      title: "Add to a savings goal",
      description: "Records money set aside for a goal without a linked account. A negative amount takes money back out. For goals linked to an account, record a transfer into that account instead.",
      inputSchema: { goal: z.string().describe("Goal id or name"), amount: amount.describe('e.g. "500rb"; negative to withdraw'), date: z.string().optional().describe("YYYY-MM-DD; defaults to today"), note: z.string().optional() },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const goalId = await resolveNamed(ctx, "goal", a.goal);
        await contributeToGoal(ctx.actor, { goalId, amount: a.amount, bookedOn: a.date ?? today(ctx), note: a.note });
        return goalOut(ctx, await getGoal(userId, goalId, today(ctx)));
      }),
  );

  server.registerTool(
    "kasvo_create_debt",
    {
      title: "Create a debt or receivable",
      description:
        "Records a debt the user owes (BORROWED: KPR, kredit motor, paylater, a loan from a friend) or money owed to them (LENT). The monthly schedule is derived from instalmentCount and firstDueOn; a one-off debt has a count of 1. Creating a debt does not book any money.",
      inputSchema: {
        name: z.string(),
        direction: z.enum(["BORROWED", "LENT"]),
        counterparty: z.string().optional().describe("Lender or borrower"),
        principal: amount,
        instalmentAmount: amount.optional().describe("Defaults to principal / instalmentCount, rounded up"),
        instalmentCount: z.number().int().min(1).max(600).optional(),
        firstDueOn: z.string().describe("YYYY-MM-DD of the first (or only) payment"),
        annualRatePct: z.number().optional().describe("Yearly interest in percent, for payoff planning"),
        account: z.string().optional().describe("LOAN or CREDIT_CARD account; payments then become transfers into it"),
        note: z.string().optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const { id } = await createDebt(ctx.actor, {
          name: a.name,
          direction: a.direction,
          counterparty: a.counterparty,
          principal: a.principal,
          instalmentAmount: a.instalmentAmount,
          instalmentCount: a.instalmentCount,
          firstDueOn: a.firstDueOn,
          annualRate: a.annualRatePct,
          accountId: a.account ? await resolveAccount(ctx, a.account) : undefined,
          note: a.note,
        });
        return debtOut(ctx, (await listDebts(userId, today(ctx), { ids: [id] }))[0]);
      }),
  );

  server.registerTool(
    "kasvo_pay_debt",
    {
      title: "Record a debt payment",
      description:
        "Records a repayment. Pass `account` to also book the money (a transfer when the debt has a linked loan account, else an expense for debts owed or income for receivables). If the payment already exists as a transaction, e.g. from an imported statement, pass `transactionId` instead so it is not counted twice. Without either, only the debt is updated. Amount defaults to what is left of the next instalment.",
      inputSchema: {
        debt: z.string().describe("Debt id or name"),
        amount: amount.optional(),
        date: z.string().optional().describe("YYYY-MM-DD; defaults to today, ignored with transactionId"),
        account: z.string().optional(),
        transactionId: z.string().optional(),
        category: z.string().optional().describe("Category for a booked expense or income; defaults to Cicilan for debts owed"),
        note: z.string().optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const debtId = await resolveNamed(ctx, "debt", a.debt);
        const debt = await db.debt.findFirstOrThrow({ where: { id: debtId }, select: { direction: true } });
        const r = await payDebt(
          ctx.actor,
          {
            debtId,
            amount: a.amount,
            paidOn: a.transactionId ? undefined : (a.date ?? today(ctx)),
            accountId: a.account ? await resolveAccount(ctx, a.account) : undefined,
            transactionId: a.transactionId,
            categoryId: a.category ? await resolveCategory(ctx, a.category, debt.direction === "BORROWED" ? "EXPENSE" : "INCOME") : undefined,
            note: a.note,
          },
          today(ctx),
        );
        return { paymentId: r.id, amount: money(ctx, r.amount), transactionId: r.transactionId, outstanding: money(ctx, r.status.outstanding), state: r.status.state, next: r.status.next?.dueOn ?? null };
      }),
  );
}
