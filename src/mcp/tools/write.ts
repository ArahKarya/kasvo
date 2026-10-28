import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ACCOUNT_TYPES, createAccount } from "@/server/domain/accounts";
import { createCategory } from "@/server/domain/categories";
import { editTransaction, recordTransaction, recordTransfer, restoreTransactions } from "@/server/domain/transactions";
import { getTransaction } from "@/server/domain/transaction-queries";
import { DomainError } from "@/server/domain/errors";
import type { McpContext } from "../context";
import { run } from "../result";
import { resolveAccount, resolveCategory, today } from "../resolve";

const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const amountArg = z.union([z.number(), z.string()]).describe('Positive amount: 25000, "25rb", "1,5jt", "Rp1.250.000", or a sum such as "25rb+10rb×2"');
const necessityArg = z.enum(["NEED", "WANT"]).describe("Need or want for the 50/30/20 view; omit to inherit the category's default (expenses only)");
const dateArg = z.string().optional().describe("YYYY-MM-DD; defaults to today in the user's time zone");

const transactionArgs = {
  kind: z.enum(["EXPENSE", "INCOME"]),
  amount: amountArg,
  account: z.string().describe("Account id or name"),
  description: z.string().describe("What it was, e.g. 'Makan siang'"),
  date: dateArg,
  category: z.string().optional().describe("Category id or name matching the kind"),
  payee: z.string().optional(),
  note: z.string().optional(),
  necessity: necessityArg.optional(),
};

const transactionObject = z.object(transactionArgs);
type TransactionArgs = z.infer<typeof transactionObject>;

export function registerWriteTools(server: McpServer, ctx: McpContext): void {
  const record = async (a: TransactionArgs) =>
    recordTransaction(ctx.actor, {
      kind: a.kind,
      amount: a.amount,
      accountId: await resolveAccount(ctx, a.account),
      categoryId: a.category ? await resolveCategory(ctx, a.category, a.kind) : undefined,
      bookedOn: a.date ?? today(ctx),
      description: a.description,
      payee: a.payee,
      note: a.note,
      necessity: a.kind === "EXPENSE" ? a.necessity : undefined,
    });

  server.registerTool(
    "kasvo_record_transaction",
    {
      title: "Record a transaction",
      description: "Records one income or expense. Use kasvo_record_transfer for money moved between the user's own accounts.",
      inputSchema: transactionArgs,
      annotations: WRITE,
    },
    (a) => run(async () => ({ id: (await record(a)).id })),
  );

  server.registerTool(
    "kasvo_record_transactions",
    {
      title: "Record many transactions",
      description:
        "Records up to 200 incomes/expenses, e.g. from a receipt or a chat log. Each item succeeds or fails on its own; the result lists the id or the error for every item, in order.",
      inputSchema: { items: z.array(transactionObject).min(1).max(200) },
      annotations: WRITE,
    },
    ({ items }) =>
      run(async () => {
        const results: ({ index: number; id: string } | { index: number; error: string })[] = [];
        for (const [index, item] of items.entries()) {
          try {
            results.push({ index, id: (await record(item)).id });
          } catch (error: unknown) {
            results.push({ index, error: error instanceof Error ? error.message : String(error) });
          }
        }
        return { recorded: results.filter((r) => "id" in r).length, failed: results.filter((r) => "error" in r).length, results };
      }),
  );

  server.registerTool(
    "kasvo_record_transfer",
    {
      title: "Record a transfer",
      description: "Moves money between two of the user's accounts (e.g. top up GoPay from BCA). Not counted as income or spending. An optional fee is recorded as an expense on the sending account.",
      inputSchema: {
        from: z.string().describe("Sending account id or name"),
        to: z.string().describe("Receiving account id or name"),
        amount: amountArg,
        date: dateArg,
        description: z.string().optional(),
        note: z.string().optional(),
        fee: amountArg.optional(),
        feeCategory: z.string().optional().describe("Expense category for the fee"),
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () =>
        recordTransfer(ctx.actor, {
          fromAccountId: await resolveAccount(ctx, a.from),
          toAccountId: await resolveAccount(ctx, a.to),
          amount: a.amount,
          fee: a.fee,
          feeCategoryId: a.feeCategory ? await resolveCategory(ctx, a.feeCategory, "EXPENSE") : undefined,
          bookedOn: a.date ?? today(ctx),
          description: a.description,
          note: a.note,
        }),
      ),
  );

  server.registerTool(
    "kasvo_edit_transaction",
    {
      title: "Edit a transaction",
      description:
        "Changes fields of one transaction; omitted fields stay as they are. Pass null to clear category, payee, note, or necessity (null makes it follow the category's need/want again). For a transfer only date, description, and note can change.",
      inputSchema: {
        id: z.string(),
        kind: z.enum(["EXPENSE", "INCOME"]).optional(),
        amount: amountArg.optional(),
        account: z.string().optional(),
        date: z.string().optional(),
        description: z.string().optional(),
        category: z.string().nullable().optional(),
        payee: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        necessity: z.enum(["NEED", "WANT"]).nullable().optional(),
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    (a) =>
      run(async () => {
        const current = await getTransaction(ctx.actor.userId, a.id);
        if (!current) throw new DomainError("NOT_FOUND", "not_found", `Transaction ${a.id} not found.`, "Use kasvo_find_transactions to get ids.");
        const kind = a.kind ?? (current.amount < 0n ? "EXPENSE" : "INCOME");
        await editTransaction(ctx.actor, a.id, {
          kind: a.kind,
          amount: a.amount,
          accountId: a.account ? await resolveAccount(ctx, a.account) : undefined,
          bookedOn: a.date,
          description: a.description,
          categoryId: a.category === null ? null : a.category ? await resolveCategory(ctx, a.category, kind) : undefined,
          payee: a.payee,
          note: a.note,
          necessity: a.necessity,
        });
        return { id: a.id, updated: true };
      }),
  );

  server.registerTool(
    "kasvo_categorize",
    {
      title: "Categorize transactions",
      description: "Sets the same category on up to 500 transactions. Use kasvo_find_transactions with category 'none' to find uncategorized ones first. Transfers are skipped.",
      inputSchema: { ids: z.array(z.string()).min(1).max(500), category: z.string().describe("Category id or name") },
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ ids, category }) =>
      run(async () => {
        const failed: { id: string; error: string }[] = [];
        let updated = 0;
        for (const id of ids) {
          try {
            const row = await getTransaction(ctx.actor.userId, id);
            if (!row) throw new Error("not found");
            if (row.transferId) throw new Error("transfers have no category");
            const categoryId = await resolveCategory(ctx, category, row.amount < 0n ? "EXPENSE" : "INCOME");
            await editTransaction(ctx.actor, id, { categoryId });
            updated++;
          } catch (error: unknown) {
            failed.push({ id, error: error instanceof Error ? error.message : String(error) });
          }
        }
        return { updated, failed };
      }),
  );

  server.registerTool(
    "kasvo_restore_transactions",
    {
      title: "Restore deleted transactions",
      description: "Undoes a delete. Deleted transactions can be restored for 30 days.",
      inputSchema: { ids: z.array(z.string()).min(1).max(500) },
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ ids }) => run(async () => ({ restored: await restoreTransactions(ctx.actor, ids) })),
  );

  server.registerTool(
    "kasvo_create_category",
    {
      title: "Create a category",
      description: "Adds an income or expense category, optionally under a parent of the same kind (one level deep).",
      inputSchema: { name: z.string(), kind: z.enum(["INCOME", "EXPENSE"]), parent: z.string().optional().describe("Parent category id or name") },
      annotations: WRITE,
    },
    (a) =>
      run(async () =>
        createCategory(ctx.actor, { name: a.name, kind: a.kind, parentId: a.parent ? await resolveCategory(ctx, a.parent, a.kind) : undefined }),
      ),
  );

  server.registerTool(
    "kasvo_create_account",
    {
      title: "Create an account",
      description: "Adds a bank account, e-wallet, cash wallet, credit card, loan, or investment account.",
      inputSchema: {
        name: z.string(),
        type: z.enum(ACCOUNT_TYPES),
        institution: z.string().optional().describe("e.g. BCA, Mandiri, GoPay"),
        openingBalance: z.union([z.number(), z.string()]).optional().describe("Balance on the opening date; may be negative for cards and loans"),
        openingDate: dateArg,
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () =>
        createAccount(ctx.actor, {
          name: a.name,
          type: a.type,
          institution: a.institution,
          openingBalance: a.openingBalance ?? 0,
          openingDate: a.openingDate ?? today(ctx),
        }),
      ),
  );
}
