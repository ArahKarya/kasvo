import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { notFound } from "./errors";

export const SCOPES = ["read", "write", "destructive"] as const;
export type Scope = (typeof SCOPES)[number];

export const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(SCOPES)).min(1),
  /** Days until expiry; omit for a token that lasts until revoked. */
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export type CreateTokenInput = z.input<typeof createTokenSchema>;

export interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  /** Not revoked and not expired. */
  active: boolean;
}

export interface TokenIdentity {
  tokenId: string;
  userId: string;
  name: string;
  scopes: Scope[];
}

const TOKEN_PREFIX = "kv_";
const hash = (raw: string): string => createHash("sha256").update(raw).digest("hex");

/** Writing implies reading, and destructive implies writing; store the closure. */
function withImplied(scopes: Scope[]): Scope[] {
  const set = new Set(scopes);
  if (set.has("destructive")) set.add("write");
  if (set.has("write")) set.add("read");
  return SCOPES.filter((s) => set.has(s));
}

/** Returns the plaintext token. It is never stored and cannot be shown again. */
export async function createToken(actor: Actor, input: CreateTokenInput): Promise<{ id: string; token: string }> {
  const data = createTokenSchema.parse(input);
  const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
  const expiresAt = data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86_400_000) : null;
  return db.$transaction(async (tx) => {
    const row = await tx.apiToken.create({
      data: {
        userId: actor.userId,
        name: data.name,
        prefix: token.slice(0, 10),
        tokenHash: hash(token),
        scopes: withImplied(data.scopes),
        expiresAt,
      },
    });
    const safe = { name: row.name, prefix: row.prefix, scopes: row.scopes, expiresAt: row.expiresAt };
    await audit(tx, actor, { action: "token.create", entity: "ApiToken", entityId: row.id, after: safe });
    return { id: row.id, token };
  });
}

export async function listTokens(userId: string): Promise<TokenRow[]> {
  const rows = await db.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, scopes: true, expiresAt: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  });
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    scopes: r.scopes as Scope[],
    active: !r.revokedAt && !(r.expiresAt && r.expiresAt.getTime() < now),
  }));
}

export async function revokeToken(actor: Actor, id: string): Promise<void> {
  const before = await db.apiToken.findFirst({ where: { id, userId: actor.userId } });
  if (!before) throw notFound("ApiToken", id);
  await db.$transaction(async (tx) => {
    await tx.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit(tx, actor, { action: "token.revoke", entity: "ApiToken", entityId: id });
  });
}

/** Null for unknown, revoked, or expired tokens. Records when the token was last used. */
export async function verifyToken(raw: string): Promise<TokenIdentity | null> {
  if (!raw.startsWith(TOKEN_PREFIX) || raw.length > 100) return null;
  const row = await db.apiToken.findUnique({ where: { tokenHash: hash(raw) } });
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt.getTime() < Date.now())) return null;
  // Write at most once a minute so busy agents do not hammer the row.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  return { tokenId: row.id, userId: row.userId, name: row.name, scopes: row.scopes as Scope[] };
}
