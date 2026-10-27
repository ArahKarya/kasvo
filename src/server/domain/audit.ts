import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "./actor";

type Tx = Prisma.TransactionClient;

interface AuditEntry {
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/** JSON cannot hold BigInt or Date; store them as strings so the log stays readable. */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}

export async function audit(tx: Tx, actor: Actor, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: actor.userId,
      actorKind: actor.kind,
      clientName: actor.clientName ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}
