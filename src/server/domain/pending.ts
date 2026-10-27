import "server-only";

import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "./actor";
import { DomainError } from "./errors";

const TTL_MS = 10 * 60 * 1000;

export interface PendingTicket {
  pendingId: string;
  summary: string;
  expiresAt: Date;
}

/** Parks a destructive request. The caller shows `summary` to the human before confirming. */
export async function createPending(actor: Actor, tool: string, payload: Prisma.InputJsonValue, summary: string): Promise<PendingTicket> {
  const row = await db.pendingAction.create({
    data: {
      userId: actor.userId,
      clientName: actor.clientName ?? null,
      tool,
      payload,
      summary,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return { pendingId: row.id, summary, expiresAt: row.expiresAt };
}

/**
 * Atomically claims a pending action so it can run exactly once. Throws when it is unknown,
 * belongs to someone else, was already used, or has expired.
 */
export async function consumePending(actor: Actor, id: string): Promise<{ tool: string; payload: Prisma.JsonValue }> {
  const claimed = await db.pendingAction.updateMany({
    where: { id, userId: actor.userId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new DomainError("NOT_FOUND", "not_found", `Pending action ${id} is unknown, already used, or expired.`, "Call the destructive tool again to get a fresh pendingId.");
  }
  const row = await db.pendingAction.findUniqueOrThrow({ where: { id } });
  return { tool: row.tool, payload: row.payload };
}
