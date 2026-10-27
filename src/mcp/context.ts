import "server-only";

import { db } from "@/server/db";
import type { Actor } from "@/server/domain/actor";
import type { Scope, TokenIdentity } from "@/server/domain/tokens";

/** Everything a tool needs to act on behalf of one user. */
export interface McpContext {
  actor: Actor;
  scopes: Scope[];
  timezone: string;
  currency: string;
  locale: string;
}

export async function contextFor(identity: TokenIdentity, clientName?: string): Promise<McpContext> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: identity.userId },
    select: { timezone: true, baseCurrency: true, locale: true },
  });
  return {
    actor: { userId: identity.userId, kind: "AGENT", clientName: clientName ?? identity.name },
    scopes: identity.scopes,
    timezone: user.timezone,
    currency: user.baseCurrency,
    locale: user.locale === "en" ? "en-ID" : "id-ID",
  };
}
