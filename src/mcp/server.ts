import "server-only";

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listAccounts } from "@/server/domain/accounts";
import { listCategories } from "@/server/domain/categories";
import { formatMoney } from "@/server/domain/money";
import type { McpContext } from "./context";
import { registerDestructiveTools } from "./tools/destructive";
import { registerImportTools } from "./tools/imports";
import { registerBudgetTools } from "./tools/budgets";
import { registerReadTools } from "./tools/read";
import { registerWriteTools } from "./tools/write";

export const SERVER_INFO = { name: "kasvo", version: "0.4.0" } as const;

const INSTRUCTIONS = `Kasvo holds the user's personal finances (Indonesia first; amounts are whole rupiah unless an account says otherwise).
- Start with kasvo_overview. Accounts and categories can be referenced by name or id.
- Negative amounts are money out. Transfers between the user's own accounts are never income or spending.
- Amount inputs accept Indonesian notation: "25rb", "1,5jt", "Rp1.250.000".
- Destructive tools only prepare a change: show the returned summary to the user and call kasvo_confirm only after they agree.
- To import a bank statement: kasvo_stage_import (CSV text, or rows you read from a PDF), review with kasvo_get_import, then kasvo_commit_import.
- Every change is recorded in the user's audit log under this client's name.`;

/** One server per request or stdio session, with tools limited to the token's scopes. */
export function createKasvoServer(ctx: McpContext): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  if (ctx.scopes.includes("read")) {
    registerReadTools(server, ctx);
    registerResources(server, ctx);
    registerPrompts(server);
    registerImportTools(server, ctx);
    registerBudgetTools(server, ctx);
  }
  if (ctx.scopes.includes("write")) registerWriteTools(server, ctx);
  if (ctx.scopes.includes("destructive")) registerDestructiveTools(server, ctx);
  return server;
}

function registerResources(server: McpServer, ctx: McpContext): void {
  server.registerResource(
    "accounts",
    "kasvo://accounts",
    { title: "Accounts", description: "Active accounts and balances", mimeType: "text/plain" },
    async (uri) => {
      const rows = await listAccounts(ctx.actor.userId);
      const text = rows.map((a) => `${a.name} (${a.type}${a.institution ? `, ${a.institution}` : ""}): ${formatMoney(a.balance, a.currency, ctx.locale)} [${a.id}]`).join("\n");
      return { contents: [{ uri: uri.href, text: text || "No accounts yet." }] };
    },
  );
  server.registerResource(
    "categories",
    "kasvo://categories",
    { title: "Categories", description: "Income and expense categories", mimeType: "text/plain" },
    async (uri) => {
      const rows = await listCategories(ctx.actor.userId);
      const text = rows.map((c) => `${c.kind}: ${c.name} [${c.id}]`).join("\n");
      return { contents: [{ uri: uri.href, text }] };
    },
  );
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "monthly_review",
    {
      title: "Monthly review",
      description: "Review a month: where the money went, what changed, and what looks odd.",
      argsSchema: { month: z.string().optional().describe("YYYY-MM; defaults to the current month") },
    },
    ({ month }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Give me a short review of my finances for ${month ?? "this month"}. Use kasvo_overview, kasvo_spending_breakdown, kasvo_compare_periods against the previous month, and kasvo_find_anomalies. Answer in my language with: total income and spending, the top 5 categories, the biggest changes versus last month and why, anything that looks unusual, and one concrete suggestion. Keep it under 250 words.`,
          },
        },
      ],
    }),
  );
  server.registerPrompt(
    "budget_plan",
    {
      title: "Budget plan",
      description: "Propose monthly budgets from recent spending, then set them after approval.",
      argsSchema: { month: z.string().optional().describe("YYYY-MM to plan; defaults to the current month") },
    },
    ({ month }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Help me plan budgets for ${month ?? "this month"}. Use kasvo_budget_status (it includes each category's average over the last 3 months and the biggest unbudgeted categories) and kasvo_spending_breakdown for the last 3 months. Propose a budget per expense category as a table with last-3-month average and your suggestion, rounded to sensible rupiah amounts, and keep the total below my typical income from kasvo_cashflow. After I approve or edit the table, save it with kasvo_set_budget.`,
          },
        },
      ],
    }),
  );
  server.registerPrompt(
    "categorize_uncategorized",
    {
      title: "Categorize uncategorized",
      description: "Suggest and apply categories for uncategorized transactions.",
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Find my uncategorized transactions (kasvo_find_transactions with category 'none'), group them by likely category using kasvo_list_categories, show me the proposed grouping as a table, and after I approve, apply it with kasvo_categorize.",
          },
        },
      ],
    }),
  );
}
