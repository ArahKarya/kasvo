"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth";
import { userActor, type Actor } from "@/server/domain/actor";
import { DomainError } from "@/server/domain/errors";
import { createAccount, setAccountArchived, updateAccount, type CreateAccountInput } from "@/server/domain/accounts";
import { createCategory, renameCategory, setCategoryArchived, type CreateCategoryInput } from "@/server/domain/categories";
import { deleteTransactions, editTransaction, recordTransaction, recordTransfer } from "@/server/domain/transactions";
import { getDictionary } from "@/i18n/server";
import { fmt, type Dictionary } from "@/i18n/dictionaries";

export interface FormState {
  ok?: boolean;
  error?: string;
  /** Bumped on every success so forms can reset themselves. */
  version?: number;
}

/** Labels for the fields a validation error can point at. */
function fieldLabel(t: Dictionary, path: PropertyKey | undefined): string {
  const labels: Record<string, string> = {
    name: t.accounts.name,
    institution: t.accounts.institution,
    openingBalance: t.accounts.openingBalance,
    openingDate: t.accounts.openingDate,
    amount: t.tx.amount,
    fee: t.tx.fee,
    bookedOn: t.tx.date,
    description: t.tx.description,
    payee: t.tx.payee,
    note: t.tx.note,
    accountId: t.tx.account,
    fromAccountId: t.tx.from,
    toAccountId: t.tx.to,
  };
  return labels[String(path)] ?? String(path ?? "");
}

/** Runs a domain call as the signed-in user and turns failures into a translated message. */
async function perform(work: (actor: Actor) => Promise<unknown>, paths: string[]): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getDictionary();
  try {
    await work(userActor(user.id));
  } catch (error: unknown) {
    if (error instanceof DomainError) return { error: t.errors[error.reason] };
    if (error instanceof ZodError) return { error: fmt(t.errors.invalidField, { field: fieldLabel(t, error.issues[0]?.path[0]) }) };
    console.error("[ledger action]", error);
    return { error: t.errors.generic };
  }
  for (const path of paths) revalidatePath(path);
  return { ok: true, version: Date.now() };
}

const text = (form: FormData, key: string): string | undefined => {
  const v = form.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};

const LEDGER_PATHS = ["/dashboard", "/accounts", "/transactions", "/categories"];

export async function createAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  return perform(
    (actor) =>
      createAccount(actor, {
        name: text(form, "name") ?? "",
        type: (text(form, "type") ?? "") as CreateAccountInput["type"],
        institution: text(form, "institution"),
        openingBalance: text(form, "openingBalance") ?? 0,
        openingDate: text(form, "openingDate") ?? "",
      }),
    LEDGER_PATHS,
  );
}

export async function updateAccountAction(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  return perform(
    (actor) =>
      updateAccount(actor, id, {
        name: text(form, "name") ?? "",
        type: (text(form, "type") ?? "") as CreateAccountInput["type"],
        institution: text(form, "institution"),
        openingBalance: text(form, "openingBalance") ?? 0,
        openingDate: text(form, "openingDate") ?? "",
      }),
    LEDGER_PATHS,
  );
}

export async function archiveAccountAction(form: FormData): Promise<void> {
  const id = text(form, "id") ?? "";
  await perform((actor) => setAccountArchived(actor, id, form.get("archived") === "1"), LEDGER_PATHS);
  redirect("/accounts");
}

export async function createCategoryAction(_prev: FormState, form: FormData): Promise<FormState> {
  return perform(
    (actor) =>
      createCategory(actor, { name: text(form, "name") ?? "", kind: (text(form, "kind") ?? "") as CreateCategoryInput["kind"], parentId: text(form, "parentId") }),
    LEDGER_PATHS,
  );
}

export async function renameCategoryAction(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  return perform((actor) => renameCategory(actor, id, text(form, "name") ?? ""), LEDGER_PATHS);
}

export async function archiveCategoryAction(form: FormData): Promise<void> {
  const id = text(form, "id") ?? "";
  await perform((actor) => setCategoryArchived(actor, id, form.get("archived") === "1"), LEDGER_PATHS);
}

export async function recordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const kind = text(form, "kind");
  if (kind === "TRANSFER") {
    return perform(
      (actor) =>
        recordTransfer(actor, {
          fromAccountId: text(form, "accountId") ?? "",
          toAccountId: text(form, "toAccountId") ?? "",
          amount: text(form, "amount") ?? "",
          fee: text(form, "fee"),
          feeCategoryId: text(form, "feeCategoryId"),
          bookedOn: text(form, "bookedOn") ?? "",
          description: text(form, "description"),
          note: text(form, "note"),
        }),
      LEDGER_PATHS,
    );
  }
  return perform(
    (actor) =>
      recordTransaction(actor, {
        accountId: text(form, "accountId") ?? "",
        kind: kind === "INCOME" ? "INCOME" : "EXPENSE",
        amount: text(form, "amount") ?? "",
        bookedOn: text(form, "bookedOn") ?? "",
        description: text(form, "description") ?? "",
        payee: text(form, "payee"),
        note: text(form, "note"),
        categoryId: text(form, "categoryId"),
      }),
    LEDGER_PATHS,
  );
}

export async function editTransactionAction(id: string, isTransfer: boolean, _prev: FormState, form: FormData): Promise<FormState> {
  const shared = {
    bookedOn: text(form, "bookedOn") ?? "",
    description: text(form, "description") ?? "",
    note: text(form, "note") ?? null,
  };
  return perform(
    (actor) =>
      editTransaction(
        actor,
        id,
        isTransfer
          ? shared
          : {
              ...shared,
              accountId: text(form, "accountId") ?? "",
              kind: text(form, "kind") === "INCOME" ? "INCOME" : "EXPENSE",
              amount: text(form, "amount") ?? "",
              payee: text(form, "payee") ?? null,
              categoryId: text(form, "categoryId") ?? null,
            },
      ),
    LEDGER_PATHS,
  );
}

export async function deleteTransactionAction(form: FormData): Promise<void> {
  const id = text(form, "id") ?? "";
  await perform((actor) => deleteTransactions(actor, [id]), LEDGER_PATHS);
  redirect("/transactions");
}
