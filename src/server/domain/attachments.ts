import "server-only";

import { createHash } from "node:crypto";
import { db } from "@/server/db";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { cleanFileName, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TRANSACTION, sniffType } from "./attachment-files";
import { DomainError, notFound } from "./errors";

export interface AttachmentMeta {
  id: string;
  transactionId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdBy: string | null;
  createdAt: Date;
}

const META = { id: true, transactionId: true, fileName: true, mimeType: true, size: true, createdBy: true, createdAt: true } as const;

/**
 * Keeps a file with a transaction. The type comes from the bytes; the bytes are never shown to
 * the audit log, only their name, type, size, and hash.
 */
export async function addAttachment(actor: Actor, input: { transactionId: string; fileName?: string; bytes: Uint8Array }): Promise<AttachmentMeta> {
  if (input.bytes.byteLength === 0) throw new DomainError("INVALID", "attachment_type", "The file is empty.");
  if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new DomainError("INVALID", "attachment_too_large", "Attachments are limited to 5 MB.", "Send a smaller photo or a shorter PDF.");
  }
  const type = sniffType(input.bytes);
  if (!type) throw new DomainError("INVALID", "attachment_type", "Only JPG, PNG, WebP, and PDF files can be attached.");

  return db.$transaction(async (tx) => {
    const transaction = await tx.transaction.findFirst({ where: { id: input.transactionId, userId: actor.userId, deletedAt: null }, select: { id: true } });
    if (!transaction) throw notFound("Transaction", input.transactionId);
    const count = await tx.attachment.count({ where: { transactionId: transaction.id } });
    if (count >= MAX_ATTACHMENTS_PER_TRANSACTION) {
      throw new DomainError("INVALID", "attachment_limit", `A transaction can have at most ${MAX_ATTACHMENTS_PER_TRANSACTION} attachments.`, "Remove one first.");
    }
    const row = await tx.attachment.create({
      data: {
        userId: actor.userId,
        transactionId: transaction.id,
        fileName: cleanFileName(input.fileName, type),
        mimeType: type,
        size: input.bytes.byteLength,
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
        data: Buffer.from(input.bytes),
        createdBy: actor.kind === "AGENT" ? (actor.clientName ?? "agent") : null,
      },
      select: { ...META, sha256: true },
    });
    const { sha256, ...meta } = row;
    await audit(tx, actor, { action: "attachment.add", entity: "Transaction", entityId: transaction.id, after: { ...meta, sha256 } });
    return meta;
  });
}

export async function listAttachments(userId: string, transactionId: string): Promise<AttachmentMeta[]> {
  return db.attachment.findMany({ where: { userId, transactionId }, select: META, orderBy: { createdAt: "asc" } });
}

/** The file itself, only for its owner. */
export async function getAttachment(userId: string, id: string): Promise<(AttachmentMeta & { data: Uint8Array }) | null> {
  const row = await db.attachment.findFirst({ where: { id, userId }, select: { ...META, data: true } });
  return row ? { ...row, data: new Uint8Array(row.data) } : null;
}

export async function removeAttachment(actor: Actor, id: string): Promise<{ transactionId: string }> {
  return db.$transaction(async (tx) => {
    const before = await tx.attachment.findFirst({ where: { id, userId: actor.userId }, select: META });
    if (!before) throw notFound("Attachment", id);
    await tx.attachment.delete({ where: { id } });
    await audit(tx, actor, { action: "attachment.remove", entity: "Transaction", entityId: before.transactionId, before });
    return { transactionId: before.transactionId };
  });
}
