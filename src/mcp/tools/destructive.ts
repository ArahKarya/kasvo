import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/server/db";
import { deleteTransactions } from "@/server/domain/transactions";
import { revertImport } from "@/server/domain/import/service";
import { removeDebtPayment } from "@/server/domain/debts";
import { getImport } from "@/server/domain/import/queries";
import { consumePending, createPending } from "@/server/domain/pending";
import { DomainError } from "@/server/domain/errors";
import { formatMoney } from "@/server/domain/money";
import type { McpContext } from "../context";
import { day, run } from "../result";

const DELETE_TOOL = "kasvo_delete_transactions";
const REVERT_TOOL = "kasvo_revert_import";
const UNPAY_TOOL = "kasvo_remove_debt_payment";

/**
 * Destructive tools never act directly. They return a pendingId and a summary; nothing
 * changes until kasvo_confirm is called with that id, which should only happen after the
 * human has seen the summary and agreed.
 */
export function registerDestructiveTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    DELETE_TOOL,
    {
      title: "Delete transactions (step 1 of 2)",
      description:
        "Prepares deleting up to 500 transactions and returns a pendingId plus a summary. Nothing is deleted yet: show the summary to the user, and only after they agree call kasvo_confirm. Deleting one leg of a transfer deletes both. Deleted rows can be restored for 30 days.",
      inputSchema: { ids: z.array(z.string()).min(1).max(500) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ ids }) =>
      run(async () => {
        const rows = await db.transaction.findMany({
          where: { id: { in: ids }, userId: ctx.actor.userId, deletedAt: null },
          include: { account: { select: { name: true, currency: true } } },
          orderBy: { bookedOn: "asc" },
        });
        if (rows.length === 0) throw new DomainError("NOT_FOUND", "not_found", "None of those transactions exist.", "Use kasvo_find_transactions to get ids.");
        const lines = rows.slice(0, 20).map((r) => `${day(r.bookedOn)}  ${r.account.name}  ${formatMoney(r.amount, r.account.currency, ctx.locale)}  ${r.description}`);
        const more = rows.length > 20 ? `\n…and ${rows.length - 20} more` : "";
        const missing = ids.length - rows.length;
        const summary = `Delete ${rows.length} transaction(s):\n${lines.join("\n")}${more}${missing ? `\n(${missing} id(s) not found and ignored)` : ""}`;
        return { ...(await createPending(ctx.actor, DELETE_TOOL, { ids: rows.map((r) => r.id) }, summary)), next: "Show this summary to the user. If they agree, call kasvo_confirm with pendingId." };
      }),
  );

  server.registerTool(
    REVERT_TOOL,
    {
      title: "Revert an import (step 1 of 2)",
      description: "Prepares removing every transaction a committed import created. Returns a pendingId and a summary; call kasvo_confirm only after the user agrees. The rows can be restored for 30 days.",
      inputSchema: { importId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ importId }) =>
      run(async () => {
        const batch = await getImport(ctx.actor.userId, importId);
        if (!batch) throw new DomainError("NOT_FOUND", "not_found", `Import ${importId} not found.`, "Call kasvo_list_imports.");
        if (batch.status !== "COMMITTED") throw new DomainError("INVALID", "import_state", `Import is ${batch.status.toLowerCase()}, not committed.`);
        const summary = `Revert import ${batch.fileName ?? batch.id} into ${batch.accountName}: remove ${batch.committedCount} transaction(s) committed on ${batch.committedAt?.toISOString().slice(0, 10)}.`;
        return { ...(await createPending(ctx.actor, REVERT_TOOL, { importId }, summary)), next: "Show this summary to the user. If they agree, call kasvo_confirm with pendingId." };
      }),
  );

  server.registerTool(
    UNPAY_TOOL,
    {
      title: "Remove a debt payment (step 1 of 2)",
      description:
        "Prepares removing a recorded debt payment (ids come from kasvo_get_debt). A transaction booked together with the payment is deleted too and can be restored for 30 days; a linked existing transaction is kept. Call kasvo_confirm only after the user agrees.",
      inputSchema: { paymentId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ paymentId }) =>
      run(async () => {
        const p = await db.debtPayment.findFirst({ where: { id: paymentId, userId: ctx.actor.userId }, include: { debt: { select: { name: true } }, transaction: { select: { deletedAt: true } } } });
        if (!p) throw new DomainError("NOT_FOUND", "not_found", `Payment ${paymentId} not found.`, "Call kasvo_get_debt for payment ids.");
        const ledger = p.ledgerCreated && p.transaction && !p.transaction.deletedAt ? " and delete the transaction booked with it" : "";
        const summary = `Remove the ${formatMoney(p.amount, ctx.currency, ctx.locale)} payment of ${day(p.paidOn)} from "${p.debt.name}"${ledger}.`;
        return { ...(await createPending(ctx.actor, UNPAY_TOOL, { paymentId }, summary)), next: "Show this summary to the user. If they agree, call kasvo_confirm with pendingId." };
      }),
  );

  server.registerTool(
    "kasvo_confirm",
    {
      title: "Confirm a pending action (step 2 of 2)",
      description: "Executes a pending destructive action. Only call this after the user has explicitly agreed to the summary. Each pendingId works once and expires after 10 minutes.",
      inputSchema: { pendingId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    ({ pendingId }) =>
      run(async () => {
        const { tool, payload } = await consumePending(ctx.actor, pendingId);
        if (tool === DELETE_TOOL) {
          const { ids } = z.object({ ids: z.array(z.string()) }).parse(payload);
          return { done: tool, deleted: await deleteTransactions(ctx.actor, ids), ids, undo: "Call kasvo_restore_transactions with these ids to undo." };
        }
        if (tool === REVERT_TOOL) {
          const { importId } = z.object({ importId: z.string() }).parse(payload);
          return { done: tool, deleted: await revertImport(ctx.actor, importId), importId };
        }
        if (tool === UNPAY_TOOL) {
          const { paymentId } = z.object({ paymentId: z.string() }).parse(payload);
          return { done: tool, ...(await removeDebtPayment(ctx.actor, paymentId)) };
        }
        throw new DomainError("INVALID", "not_found", `Unknown pending tool ${tool}.`);
      }),
  );
}
