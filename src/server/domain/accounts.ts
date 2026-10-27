import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import type { AccountType } from "@/generated/prisma/client";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { DomainError, notFound } from "./errors";
import { amountSchema, daySchema, idSchema, optionalText } from "./schemas";

export const ACCOUNT_TYPES = ["BANK", "EWALLET", "CASH", "CREDIT_CARD", "LOAN", "INVESTMENT"] as const satisfies readonly AccountType[];

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(ACCOUNT_TYPES),
  institution: optionalText(60),
  currency: z.string().regex(/^[A-Z]{3}$/).default("IDR"),
  openingBalance: amountSchema.default(0n),
  openingDate: daySchema,
});

export const updateAccountSchema = createAccountSchema.omit({ currency: true }).partial();

export type CreateAccountInput = z.input<typeof createAccountSchema>;
export type UpdateAccountInput = z.input<typeof updateAccountSchema>;

export interface AccountWithBalance {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: string;
  openingBalance: bigint;
  openingDate: Date;
  archivedAt: Date | null;
  balance: bigint;
  transactionCount: number;
}

/** Accounts with balances derived from opening balance plus live transactions. */
export async function listAccounts(userId: string, opts: { includeArchived?: boolean } = {}): Promise<AccountWithBalance[]> {
  const [accounts, sums] = await Promise.all([
    db.account.findMany({
      where: { userId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { type: "asc" }, { name: "asc" }],
    }),
    db.transaction.groupBy({
      by: ["accountId"],
      where: { userId, deletedAt: null },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  const byAccount = new Map(sums.map((s) => [s.accountId, s]));
  return accounts.map((a) => {
    const s = byAccount.get(a.id);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      institution: a.institution,
      currency: a.currency,
      openingBalance: a.openingBalance,
      openingDate: a.openingDate,
      archivedAt: a.archivedAt,
      balance: a.openingBalance + (s?._sum.amount ?? 0n),
      transactionCount: s?._count._all ?? 0,
    };
  });
}

export async function getAccount(userId: string, id: string): Promise<AccountWithBalance> {
  const account = (await listAccounts(userId, { includeArchived: true })).find((a) => a.id === id);
  if (!account) throw notFound("Account", id);
  return account;
}

async function assertNameFree(userId: string, name: string, exceptId?: string): Promise<void> {
  const clash = await db.account.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new DomainError("CONFLICT", "name_taken", `An account named "${name}" already exists.`, "Pick a different name.");
}

export async function createAccount(actor: Actor, input: CreateAccountInput): Promise<{ id: string }> {
  const data = createAccountSchema.parse(input);
  await assertNameFree(actor.userId, data.name);
  return db.$transaction(async (tx) => {
    const account = await tx.account.create({ data: { ...data, userId: actor.userId } });
    await audit(tx, actor, { action: "account.create", entity: "Account", entityId: account.id, after: account });
    return { id: account.id };
  });
}

export async function updateAccount(actor: Actor, id: string, input: UpdateAccountInput): Promise<void> {
  idSchema.parse(id);
  const data = updateAccountSchema.parse(input);
  const before = await db.account.findFirst({ where: { id, userId: actor.userId } });
  if (!before) throw notFound("Account", id);
  if (data.name && data.name.toLowerCase() !== before.name.toLowerCase()) await assertNameFree(actor.userId, data.name, id);
  await db.$transaction(async (tx) => {
    const after = await tx.account.update({ where: { id }, data });
    await audit(tx, actor, { action: "account.update", entity: "Account", entityId: id, before, after });
  });
}

/** Archived accounts drop out of lists and net worth; their history stays. */
export async function setAccountArchived(actor: Actor, id: string, archived: boolean): Promise<void> {
  const before = await db.account.findFirst({ where: { id, userId: actor.userId } });
  if (!before) throw notFound("Account", id);
  await db.$transaction(async (tx) => {
    const after = await tx.account.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await audit(tx, actor, { action: archived ? "account.archive" : "account.unarchive", entity: "Account", entityId: id, before, after });
  });
}
