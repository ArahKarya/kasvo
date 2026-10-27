"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth";
import { userActor, type Actor } from "@/server/domain/actor";
import { db } from "@/server/db";
import { todayIn } from "@/server/domain/dates";
import { DomainError } from "@/server/domain/errors";
import { contributeToGoal, createGoal, removeContribution, setGoalArchived, updateGoal } from "@/server/domain/goals";
import { createDebt, payDebt, removeDebtPayment, setDebtArchived, updateDebt } from "@/server/domain/debts";
import { getDictionary } from "@/i18n/server";
import { fmt, type Dictionary } from "@/i18n/dictionaries";
import type { MessageState } from "./imports";

const PATHS = ["/goals", "/debts", "/dashboard", "/transactions", "/accounts"];

const str = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

function fieldLabel(t: Dictionary, path: PropertyKey | undefined): string {
  const g = t.goals;
  const d = t.debts;
  const labels: Record<string, string> = {
    name: g.name,
    targetAmount: g.target,
    targetDate: g.targetDate,
    amount: g.amount,
    bookedOn: g.date,
    principal: d.principal,
    instalmentAmount: d.instalmentAmount,
    instalmentCount: d.instalmentCount,
    firstDueOn: d.firstDueOn,
    annualRate: d.annualRate,
    paidOn: d.payDate,
    transactionId: d.linkExisting,
  };
  return labels[String(path)] ?? String(path ?? "");
}

/** Runs a domain call as the signed-in user and turns failures into a translated message. */
async function attempt(work: (actor: Actor) => Promise<unknown>): Promise<MessageState> {
  const user = await requireUser();
  const { t } = await getDictionary();
  try {
    await work(userActor(user.id));
  } catch (error: unknown) {
    if (error instanceof DomainError) return { error: t.errors[error.reason] };
    if (error instanceof ZodError) return { error: fmt(t.errors.invalidField, { field: fieldLabel(t, error.issues[0]?.path[0]) }) };
    console.error("[plans action]", error);
    return { error: t.errors.generic };
  }
  for (const path of PATHS) revalidatePath(path, "layout");
  return { ok: true, version: Date.now() };
}

async function userToday(userId: string): Promise<string> {
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  return todayIn(timezone);
}

const goalFields = (form: FormData) => ({
  name: str(form, "name"),
  targetAmount: str(form, "targetAmount"),
  targetDate: str(form, "targetDate"),
  accountId: str(form, "accountId"),
  note: str(form, "note"),
});

export async function createGoalAction(_prev: MessageState, form: FormData): Promise<MessageState> {
  return attempt((actor) => createGoal(actor, goalFields(form)));
}

export async function updateGoalAction(id: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  return attempt((actor) => updateGoal(actor, id, goalFields(form)));
}

export async function contributeAction(goalId: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  return attempt((actor) => contributeToGoal(actor, { goalId, amount: str(form, "amount"), bookedOn: str(form, "bookedOn"), note: str(form, "note") }));
}

export async function removeContributionAction(form: FormData): Promise<void> {
  await attempt((actor) => removeContribution(actor, str(form, "id")));
}

export async function archiveGoalAction(form: FormData): Promise<void> {
  await attempt((actor) => setGoalArchived(actor, str(form, "id"), str(form, "archived") === "1"));
  if (str(form, "archived") === "1") redirect("/goals");
}

const debtFields = (form: FormData) => ({
  name: str(form, "name"),
  direction: str(form, "direction") as "BORROWED" | "LENT",
  counterparty: str(form, "counterparty"),
  principal: str(form, "principal"),
  instalmentAmount: str(form, "instalmentAmount"),
  instalmentCount: str(form, "instalmentCount") || "1",
  firstDueOn: str(form, "firstDueOn"),
  annualRate: str(form, "annualRate"),
  accountId: str(form, "accountId"),
  note: str(form, "note"),
});

export async function createDebtAction(_prev: MessageState, form: FormData): Promise<MessageState> {
  return attempt((actor) => createDebt(actor, debtFields(form)));
}

export async function updateDebtAction(id: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  const { counterparty, note, ...rest } = debtFields(form);
  return attempt((actor) => updateDebt(actor, id, { ...rest, counterparty: counterparty || null, note: note || null }));
}

export async function payDebtAction(debtId: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  const user = await requireUser();
  const today = await userToday(user.id);
  const transactionId = str(form, "transactionId");
  return attempt((actor) =>
    payDebt(
      actor,
      {
        debtId,
        amount: str(form, "amount"),
        paidOn: transactionId ? "" : str(form, "paidOn"),
        accountId: transactionId ? "" : str(form, "accountId"),
        transactionId,
        categoryId: str(form, "categoryId"),
        note: str(form, "note"),
      },
      today,
    ),
  );
}

export async function removePaymentAction(form: FormData): Promise<void> {
  await attempt((actor) => removeDebtPayment(actor, str(form, "id")));
}

export async function archiveDebtAction(form: FormData): Promise<void> {
  await attempt((actor) => setDebtArchived(actor, str(form, "id"), str(form, "archived") === "1"));
  if (str(form, "archived") === "1") redirect("/debts");
}
