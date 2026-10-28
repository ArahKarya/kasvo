import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { renameCategory, styleCategory } from "@/server/domain/categories";
import { parseDay } from "@/server/domain/dates";
import { netWorthTrend, wealthOf, allocationBetween } from "@/server/domain/wealth";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/components/category-icons";
import type { McpContext } from "../context";
import { money, run } from "../result";
import { resolveCategory, thisMonth, today } from "../resolve";
import { db } from "@/server/db";
import { DomainError } from "@/server/domain/errors";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const pct = (part: bigint, whole: bigint): number | null => (whole > 0n ? Math.round((Number(part) / Number(whole)) * 1000) / 10 : null);

export function registerInsightTools(server: McpServer, ctx: McpContext): void {
  const userId = ctx.actor.userId;

  server.registerTool(
    "kasvo_allocation",
    {
      title: "50/30/20 split",
      description:
        "Splits spending in a period into needs and wants and compares them, with savings (income − all spending), against the 50/30/20 rule as shares of income. A transaction's own need/want wins, then its category's default, then the parent category's. Spending in unmarked categories is reported separately so you can suggest marking them with kasvo_update_category.",
      inputSchema: {
        from: z.string().optional().describe("YYYY-MM-DD; defaults to the first day of this month"),
        to: z.string().optional().describe("YYYY-MM-DD inclusive; defaults to today"),
      },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const period = { from: a.from ?? thisMonth(ctx).from, to: a.to ?? today(ctx) };
        const start = parseDay(period.from);
        const last = parseDay(period.to);
        if (!start || !last) throw new DomainError("INVALID", "not_found", "Dates must be YYYY-MM-DD.");
        const s = await allocationBetween(userId, start, new Date(last.getTime() + 86_400_000));
        const savings = s.savings > 0n ? s.savings : 0n;
        return {
          period,
          income: money(ctx, s.income),
          needs: { amount: money(ctx, s.needs), pctOfIncome: pct(s.needs, s.income), targetPct: 50 },
          wants: { amount: money(ctx, s.wants), pctOfIncome: pct(s.wants, s.income), targetPct: 30 },
          savings: { amount: money(ctx, s.savings), pctOfIncome: pct(savings, s.income), targetPct: 20 },
          unclassified: money(ctx, s.unclassified),
        };
      }),
  );

  server.registerTool(
    "kasvo_net_worth",
    {
      title: "Net worth and its trend",
      description:
        "Net worth today and what it is made of (account balances, assets, money lent out, credit/loan balances, debts), plus month-end net worth for the last `months` months. A debt linked to a loan account is counted once, in that account.",
      inputSchema: { months: z.number().int().min(2).max(36).optional().describe("Defaults to 12") },
      annotations: READ,
    },
    ({ months }) =>
      run(async () => {
        const [w, trend] = await Promise.all([wealthOf(userId, today(ctx)), netWorthTrend(userId, today(ctx), months ?? 12)]);
        return {
          netWorth: money(ctx, w.netWorth),
          assets: { total: money(ctx, w.totalAssets), accountBalances: money(ctx, w.cash), assets: money(ctx, w.assets), receivables: money(ctx, w.receivables) },
          liabilities: { total: money(ctx, w.totalLiabilities), creditAndLoanAccounts: money(ctx, w.accountDebt), debts: money(ctx, w.debts) },
          trend: trend.map((p) => ({ month: p.month, netWorth: money(ctx, p.netWorth) })),
        };
      }),
  );

  if (!ctx.scopes.includes("write")) return;

  server.registerTool(
    "kasvo_update_category",
    {
      title: "Update a category",
      description: `Renames a category or sets its icon, colour, or need/want default (expense categories only; used by kasvo_allocation). Pass null to clear icon, colour, or need/want. Icons: ${Object.keys(CATEGORY_ICONS).join(", ")}. Colours: ${Object.keys(CATEGORY_COLORS).join(", ")}.`,
      inputSchema: {
        category: z.string().describe("Category id or name"),
        kind: z.enum(["INCOME", "EXPENSE"]).optional().describe("Needed only when an income and an expense category share the name; defaults to EXPENSE"),
        name: z.string().optional(),
        icon: z.enum(Object.keys(CATEGORY_ICONS) as [string, ...string[]]).nullable().optional(),
        color: z.enum(Object.keys(CATEGORY_COLORS) as [string, ...string[]]).nullable().optional(),
        necessity: z.enum(["NEED", "WANT"]).nullable().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (a) =>
      run(async () => {
        const id = await resolveCategory(ctx, a.category, a.kind ?? "EXPENSE");
        if (a.name) await renameCategory(ctx.actor, id, a.name);
        await styleCategory(ctx.actor, id, { icon: a.icon, color: a.color, necessity: a.necessity });
        const c = await db.category.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, kind: true, icon: true, color: true, necessity: true } });
        return c;
      }),
  );
}
