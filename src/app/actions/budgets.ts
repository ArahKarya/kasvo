"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth";
import { userActor } from "@/server/domain/actor";
import { copyBudgets, setBudget } from "@/server/domain/budgets";
import { DomainError } from "@/server/domain/errors";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/dictionaries";
import type { MessageState } from "./imports";

const str = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

async function guarded(work: () => Promise<MessageState>): Promise<MessageState> {
  const { t } = await getDictionary();
  try {
    const result = await work();
    revalidatePath("/budgets");
    revalidatePath("/dashboard");
    return result;
  } catch (error: unknown) {
    if (error instanceof DomainError) return { error: t.errors[error.reason] };
    if (error instanceof ZodError) return { error: fmt(t.errors.invalidField, { field: t.budgets.amount }) };
    console.error("[budgets action]", error);
    return { error: t.errors.generic };
  }
}

export async function setBudgetAction(month: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  const user = await requireUser();
  return guarded(async () => {
    await setBudget(userActor(user.id), { month, categoryId: str(form, "categoryId"), amount: str(form, "amount") || "0" });
    return { ok: true, version: Date.now() };
  });
}

export async function copyBudgetsAction(from: string, to: string): Promise<MessageState> {
  const user = await requireUser();
  const { t } = await getDictionary();
  return guarded(async () => ({ ok: true, version: Date.now(), message: fmt(t.budgets.copied, { n: await copyBudgets(userActor(user.id), from, to) }) }));
}
