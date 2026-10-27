import "server-only";

import { db } from "@/server/db";
import { DomainError } from "@/server/domain/errors";
import { todayIn } from "@/server/domain/dates";
import type { McpContext } from "./context";

/** Accepts an account id or its name (case-insensitive), so agents can say "BCA". */
export async function resolveAccount(ctx: McpContext, ref: string): Promise<string> {
  const userId = ctx.actor.userId;
  const byId = await db.account.findFirst({ where: { id: ref, userId }, select: { id: true } });
  if (byId) return byId.id;
  const matches = await db.account.findMany({
    where: { userId, archivedAt: null, name: { contains: ref, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  const exact = matches.filter((m) => m.name.toLowerCase() === ref.toLowerCase());
  if (exact.length === 1) return exact[0].id;
  if (matches.length === 1) return matches[0].id;
  throw new DomainError(
    "NOT_FOUND",
    "not_found",
    matches.length ? `"${ref}" matches several accounts: ${matches.map((m) => m.name).join(", ")}.` : `No account matches "${ref}".`,
    "Call kasvo_list_accounts and pass an exact name or id.",
  );
}

/** Accepts a category id or name for the given kind. */
export async function resolveCategory(ctx: McpContext, ref: string, kind: "INCOME" | "EXPENSE"): Promise<string> {
  const userId = ctx.actor.userId;
  const byId = await db.category.findFirst({ where: { id: ref, userId }, select: { id: true } });
  if (byId) return byId.id;
  const match = await db.category.findFirst({
    where: { userId, kind, archivedAt: null, name: { equals: ref, mode: "insensitive" } },
    select: { id: true },
  });
  if (match) return match.id;
  throw new DomainError("NOT_FOUND", "not_found", `No ${kind.toLowerCase()} category named "${ref}".`, "Call kasvo_list_categories, or create it with kasvo_create_category.");
}

export const today = (ctx: McpContext): string => todayIn(ctx.timezone);

/** First day of this month up to today, for tools whose period is optional. */
export function thisMonth(ctx: McpContext): { from: string; to: string } {
  const t = today(ctx);
  return { from: `${t.slice(0, 7)}-01`, to: t };
}
