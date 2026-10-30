import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { addAttachment, getAttachment, listAttachments, type AttachmentMeta } from "@/server/domain/attachments";
import { MAX_ATTACHMENT_BYTES } from "@/server/domain/attachment-files";
import { DomainError } from "@/server/domain/errors";
import { db } from "@/server/db";
import type { McpContext } from "../context";
import { run } from "../result";

const metaOut = (a: AttachmentMeta) => ({
  id: a.id,
  transactionId: a.transactionId,
  fileName: a.fileName,
  type: a.mimeType,
  sizeKB: Math.ceil(a.size / 1024),
  addedBy: a.createdBy ?? "user",
  addedAt: a.createdAt.toISOString(),
});

async function ownTransaction(ctx: McpContext, id: string): Promise<string> {
  const row = await db.transaction.findFirst({ where: { id, userId: ctx.actor.userId, deletedAt: null }, select: { id: true } });
  if (!row) throw new DomainError("NOT_FOUND", "not_found", `Transaction ${id} not found.`, "Use kasvo_find_transactions to get ids.");
  return row.id;
}

export function registerAttachmentTools(server: McpServer, ctx: McpContext): void {
  const userId = ctx.actor.userId;

  server.registerTool(
    "kasvo_list_attachments",
    {
      title: "List a transaction's attachments",
      description: "Receipts, invoices, and transfer proofs kept with a transaction (kasvo_find_transactions shows how many each has). Open one with kasvo_get_attachment.",
      inputSchema: { transactionId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ transactionId }) => run(async () => ({ attachments: (await listAttachments(userId, await ownTransaction(ctx, transactionId))).map(metaOut) })),
  );

  server.registerTool(
    "kasvo_get_attachment",
    {
      title: "Open an attachment",
      description:
        "Returns the file itself: photos as an image you can read (e.g. to check a receipt's total, date, or merchant against the transaction), PDFs as an embedded resource. Do not record anything from it without the user's go-ahead.",
      inputSchema: { id: z.string().describe("Attachment id from kasvo_list_attachments") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }): Promise<CallToolResult> => {
      const file = await getAttachment(userId, id);
      if (!file) return run(async () => Promise.reject(new DomainError("NOT_FOUND", "not_found", `Attachment ${id} not found.`, "Call kasvo_list_attachments for ids.")));
      const data = Buffer.from(file.data).toString("base64");
      const info = { type: "text" as const, text: JSON.stringify(metaOut(file), null, 2) };
      return file.mimeType.startsWith("image/")
        ? { content: [info, { type: "image", data, mimeType: file.mimeType }] }
        : { content: [info, { type: "resource", resource: { uri: `kasvo://attachments/${file.id}`, mimeType: file.mimeType, blob: data } }] };
    },
  );

  if (!ctx.scopes.includes("write")) return;

  server.registerTool(
    "kasvo_attach_file",
    {
      title: "Attach a file to a transaction",
      description: `Keeps a receipt, invoice, or transfer proof with a transaction: a JPG, PNG, WebP, or PDF given as base64, up to ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB and 5 files per transaction. The type is checked from the bytes.`,
      inputSchema: {
        transactionId: z.string(),
        fileBase64: z.string().max(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 16),
        fileName: z.string().max(120).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (a) =>
      run(async () => {
        const transactionId = await ownTransaction(ctx, a.transactionId);
        return metaOut(await addAttachment(ctx.actor, { transactionId, fileName: a.fileName, bytes: new Uint8Array(Buffer.from(a.fileBase64, "base64")) }));
      }),
  );
}
