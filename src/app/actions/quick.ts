"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth";
import { userActor } from "@/server/domain/actor";
import { DomainError } from "@/server/domain/errors";
import { recordTransaction, recordTransfer, restoreTransactions } from "@/server/domain/transactions";
import { evaluateAmount } from "@/lib/amount-expression";
import { getDictionary } from "@/i18n/server";
import type { MessageState } from "./imports";

export interface QuickRecordState extends MessageState {
  /** The recorded transaction (the sending leg of a transfer), for attaching files to it. */
  transactionId?: string;
}

const PATHS = ["/dashboard", "/transactions", "/accounts", "/budgets", "/reports"];

const str = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

/**
 * The quick-entry sheet. The amount may be a keypad formula ("25rb+10rb"); it is evaluated
 * here again rather than trusted from the browser. An empty description falls back to the
 * category's name, or the kind.
 */
export async function quickRecordAction(_prev: MessageState, form: FormData): Promise<QuickRecordState> {
  const user = await requireUser();
  const { t } = await getDictionary();
  const amount = evaluateAmount(str(form, "amount"));
  if (amount === null || amount <= 0n) return { error: t.quick.invalidAmount };
  const kind = str(form, "kind");
  const actor = userActor(user.id);
  let transactionId: string;
  try {
    if (kind === "TRANSFER") {
      ({ ids: [transactionId] } = await recordTransfer(actor, {
        fromAccountId: str(form, "accountId"),
        toAccountId: str(form, "toAccountId"),
        amount,
        bookedOn: str(form, "bookedOn"),
        description: str(form, "description") || undefined,
      }));
    } else {
      const necessity = str(form, "necessity");
      ({ id: transactionId } = await recordTransaction(actor, {
        accountId: str(form, "accountId"),
        kind: kind === "INCOME" ? "INCOME" : "EXPENSE",
        amount,
        bookedOn: str(form, "bookedOn"),
        description: str(form, "description") || str(form, "fallbackDescription") || (kind === "INCOME" ? t.tx.income : t.tx.expense),
        categoryId: str(form, "categoryId") || undefined,
        necessity: necessity === "NEED" || necessity === "WANT" ? necessity : undefined,
      }));
    }
  } catch (error: unknown) {
    if (error instanceof DomainError) return { error: t.errors[error.reason] };
    if (error instanceof ZodError) return { error: t.errors.generic };
    console.error("[quick record]", error);
    return { error: t.errors.generic };
  }
  for (const path of PATHS) revalidatePath(path);
  return { ok: true, version: Date.now(), message: t.tx.recorded, transactionId };
}

/** "Undo" in the toast after a delete. */
export async function undoDeleteAction(ids: string[]): Promise<boolean> {
  const user = await requireUser();
  const restored = await restoreTransactions(userActor(user.id), ids);
  for (const path of PATHS) revalidatePath(path);
  return restored > 0;
}
