import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listAccounts } from "@/server/domain/accounts";
import { listCategories } from "@/server/domain/categories";
import { getOverview } from "@/server/domain/overview";
import { cashflow, comparePeriods, findAnomalies, spendingBreakdown } from "@/server/domain/reports";
import { findTransactions } from "@/server/domain/transaction-queries";
import type { McpContext } from "../context";
import { day, money, run } from "../result";
import { resolveAccount, resolveCategory, thisMonth } from "../resolve";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const dayArg = z.string().describe("YYYY-MM-DD");
const period = {
  from: dayArg.optional().describe("Start day, inclusive. Defaults to the 1st of this month."),
  to: dayArg.optional().describe("End day, inclusive. Defaults to today."),
};

export function registerReadTools(server: McpServer, ctx: McpContext): void {
  const userId = ctx.actor.userId;
  const periodOf = (a: { from?: string; to?: string }) => ({ ...thisMonth(ctx), ...(a.from ? { from: a.from } : {}), ...(a.to ? { to: a.to } : {}) });

  server.registerTool(
    "kasvo_overview",
    {
      title: "Financial overview",
      description: "Net worth, balance of every active account, and this month's income and spending. Start here for any question about the user's money.",
      annotations: READ,
    },
    () =>
      run(async () => {
        const [o, accounts] = await Promise.all([getOverview(userId, ctx.timezone), listAccounts(userId)]);
        return {
          currency: ctx.currency,
          month: thisMonth(ctx),
          netWorth: money(ctx, o.netWorth),
          incomeThisMonth: money(ctx, o.incomeThisMonth),
          spendingThisMonth: money(ctx, o.expenseThisMonth),
          accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: money(ctx, a.balance, a.currency) })),
        };
      }),
  );

  server.registerTool(
    "kasvo_list_accounts",
    {
      title: "List accounts",
      description: "Accounts with id, type, institution, currency, and current balance. Other tools accept either the id or the exact name.",
      inputSchema: { includeArchived: z.boolean().optional() },
      annotations: READ,
    },
    ({ includeArchived }) =>
      run(async () => ({
        accounts: (await listAccounts(userId, { includeArchived })).map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          institution: a.institution,
          currency: a.currency,
          balance: money(ctx, a.balance, a.currency),
          transactionCount: a.transactionCount,
          archived: Boolean(a.archivedAt),
        })),
      })),
  );

  server.registerTool(
    "kasvo_list_categories",
    {
      title: "List categories",
      description: "Income and expense categories with id, parent, and how many transactions use each.",
      inputSchema: { kind: z.enum(["INCOME", "EXPENSE"]).optional() },
      annotations: READ,
    },
    ({ kind }) =>
      run(async () => {
        const rows = await listCategories(userId);
        const name = new Map(rows.map((r) => [r.id, r.name]));
        return {
          categories: rows
            .filter((r) => !kind || r.kind === kind)
            .map((r) => ({ id: r.id, name: r.name, kind: r.kind, parent: r.parentId ? name.get(r.parentId) : null, transactionCount: r.transactionCount })),
        };
      }),
  );

  server.registerTool(
    "kasvo_find_transactions",
    {
      title: "Find transactions",
      description:
        "Search transactions. All filters are optional and combine with AND. Amounts are signed: negative is money out. Totals cover every match, not just the page; transfers are excluded from totals.",
      inputSchema: {
        ...period,
        account: z.string().optional().describe("Account id or name"),
        category: z.string().optional().describe('Category id or name, or "none" for uncategorized'),
        kind: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
        text: z.string().optional().describe("Matches description, payee, or note"),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(200).optional().describe("Default 50"),
      },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const accountId = a.account ? await resolveAccount(ctx, a.account) : undefined;
        let categoryId: string | undefined;
        if (a.category === "none") categoryId = "none";
        else if (a.category) categoryId = await resolveCategory(ctx, a.category, a.kind === "INCOME" ? "INCOME" : "EXPENSE");
        const page = await findTransactions(userId, {
          from: a.from,
          to: a.to,
          accountId,
          categoryId,
          kind: a.kind,
          q: a.text,
          page: a.page,
          pageSize: a.pageSize,
        });
        return {
          total: page.total,
          page: page.page,
          pageSize: page.pageSize,
          income: money(ctx, page.income),
          spending: money(ctx, page.expense),
          transactions: page.items.map((t) => ({
            id: t.id,
            date: day(t.bookedOn),
            amount: money(ctx, t.amount, t.account.currency),
            description: t.description,
            payee: t.payee,
            note: t.note,
            account: t.account.name,
            category: t.category?.name ?? null,
            transfer: t.transferId ? { counterparty: t.counterparty?.name ?? null } : null,
            source: t.source,
          })),
        };
      }),
  );

  server.registerTool(
    "kasvo_spending_breakdown",
    {
      title: "Spending breakdown",
      description: "Totals for a period grouped by category, payee, or account, largest first, with each group's share of the total.",
      inputSchema: {
        ...period,
        by: z.enum(["category", "payee", "account"]).optional().describe("Default category"),
        kind: z.enum(["EXPENSE", "INCOME"]).optional().describe("Default EXPENSE"),
        account: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const accountId = a.account ? await resolveAccount(ctx, a.account) : undefined;
        const p = periodOf(a);
        const r = await spendingBreakdown(userId, { period: p, by: a.by, kind: a.kind, accountId, limit: a.limit });
        return {
          period: p,
          total: money(ctx, r.total),
          groups: r.rows.map((row) => ({ label: row.label, total: money(ctx, row.total), count: row.count, sharePct: Math.round(row.share * 1000) / 10 })),
        };
      }),
  );

  server.registerTool(
    "kasvo_compare_periods",
    {
      title: "Compare periods",
      description: "Per-category totals for period A versus period B, biggest movers first. Use it to answer 'why did spending go up?'.",
      inputSchema: {
        aFrom: dayArg,
        aTo: dayArg,
        bFrom: dayArg,
        bTo: dayArg,
        kind: z.enum(["EXPENSE", "INCOME"]).optional(),
      },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const r = await comparePeriods(userId, { from: a.aFrom, to: a.aTo }, { from: a.bFrom, to: a.bTo }, a.kind);
        return {
          a: { from: a.aFrom, to: a.aTo, total: money(ctx, r.a.total) },
          b: { from: a.bFrom, to: a.bTo, total: money(ctx, r.b.total) },
          change: money(ctx, r.b.total - r.a.total),
          categories: r.rows.map((row) => ({ label: row.label, a: money(ctx, row.a), b: money(ctx, row.b), change: money(ctx, row.change), changePct: row.changePct })),
        };
      }),
  );

  server.registerTool(
    "kasvo_cashflow",
    {
      title: "Cash flow",
      description: "Income, spending, and net per day, week, or month over a period. Transfers between the user's own accounts are excluded.",
      inputSchema: { ...period, interval: z.enum(["day", "week", "month"]).optional(), account: z.string().optional() },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const accountId = a.account ? await resolveAccount(ctx, a.account) : undefined;
        const p = periodOf(a);
        const buckets = await cashflow(userId, { period: p, interval: a.interval, accountId });
        return {
          period: p,
          buckets: buckets.map((b) => ({ start: b.start, income: money(ctx, b.income), spending: money(ctx, b.expense), net: money(ctx, b.net) })),
        };
      }),
  );

  server.registerTool(
    "kasvo_find_anomalies",
    {
      title: "Find anomalies",
      description:
        "Flags unusually large expenses (vs. the previous 90 days), payees not seen in the previous 180 days, and possible duplicate charges (same account, day, amount, and description).",
      inputSchema: period,
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const p = periodOf(a);
        const r = await findAnomalies(userId, p);
        return {
          period: p,
          large: r.large.map((x) => ({ ...x, amount: money(ctx, x.amount) })),
          newPayees: r.newPayees.map((x) => ({ ...x, total: money(ctx, x.total) })),
          possibleDuplicates: r.possibleDuplicates.map((x) => ({ ...x, amount: money(ctx, x.amount) })),
        };
      }),
  );
}
