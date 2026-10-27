import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { budgetStatus, copyBudgets, previousMonth, setBudget } from "@/server/domain/budgets";
import type { McpContext } from "../context";
import { money, run } from "../result";
import { resolveCategory, today } from "../resolve";

const monthArg = z.string().optional().describe("YYYY-MM; defaults to the current month");

export function registerBudgetTools(server: McpServer, ctx: McpContext): void {
  const currentMonth = () => today(ctx).slice(0, 7);

  server.registerTool(
    "kasvo_budget_status",
    {
      title: "Budget status",
      description:
        "Budget versus actual spending per expense category for a month, with the end-of-month projection at the current pace, a state (ok / warning at 80% or when the pace overshoots / over), the average of the 3 previous months, and the biggest categories without a budget.",
      inputSchema: { month: monthArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ month }) =>
      run(async () => {
        const s = await budgetStatus(ctx.actor.userId, month ?? currentMonth(), today(ctx));
        return {
          month: s.month,
          daysElapsed: s.progress.daysElapsed,
          daysInMonth: s.progress.daysInMonth,
          budgeted: money(ctx, s.budgeted),
          spentInBudgets: money(ctx, s.spentInBudgets),
          totalSpending: money(ctx, s.totalSpending),
          budgets: s.lines.map((l) => ({
            category: l.name,
            budget: money(ctx, l.amount),
            spent: money(ctx, l.spent),
            remaining: money(ctx, l.remaining),
            usedPct: Math.round(l.used * 1000) / 10,
            projected: money(ctx, l.projected),
            state: l.state,
            averageLast3Months: money(ctx, l.average),
          })),
          unbudgeted: s.unbudgeted.map((u) => ({ category: u.name, spent: money(ctx, u.spent) })),
        };
      }),
  );

  if (!ctx.scopes.includes("write")) return;

  server.registerTool(
    "kasvo_set_budget",
    {
      title: "Set budgets",
      description: "Sets the monthly budget for one or more expense categories. An amount of 0 removes that budget. A parent category's budget also covers its subcategories.",
      inputSchema: {
        month: monthArg,
        budgets: z.array(z.object({ category: z.string().describe("Expense category id or name"), amount: z.union([z.number(), z.string()]).describe('e.g. 1500000 or "1,5jt"') })).min(1).max(100),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (a) =>
      run(async () => {
        const month = a.month ?? currentMonth();
        for (const b of a.budgets) {
          await setBudget(ctx.actor, { categoryId: await resolveCategory(ctx, b.category, "EXPENSE"), month, amount: b.amount });
        }
        return { month, set: a.budgets.length };
      }),
  );

  server.registerTool(
    "kasvo_copy_budgets",
    {
      title: "Copy budgets",
      description: "Copies one month's budgets into another month. Budgets that already exist in the target month are kept.",
      inputSchema: { from: z.string().optional().describe("YYYY-MM; defaults to last month"), to: monthArg },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (a) =>
      run(async () => {
        const to = a.to ?? currentMonth();
        const from = a.from ?? previousMonth(to);
        return { from, to, copied: await copyBudgets(ctx.actor, from, to) };
      }),
  );
}
