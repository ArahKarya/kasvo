"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { userActor, type Actor } from "@/server/domain/actor";
import { createAsset, removeValuation, setAssetArchived, updateAsset, valueAsset } from "@/server/domain/assets";
import { todayIn } from "@/server/domain/dates";
import { DomainError } from "@/server/domain/errors";
import { getDictionary } from "@/i18n/server";
import { fmt, type Dictionary } from "@/i18n/dictionaries";
import type { MessageState } from "./imports";

const PATHS = ["/assets", "/dashboard"];

const str = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

function fieldLabel(t: Dictionary, path: PropertyKey | undefined): string {
  const a = t.assets;
  const labels: Record<string, string> = {
    name: a.name, units: a.units, purchaseValue: a.purchaseValue, purchasedOn: a.purchasedOn, currentValue: a.currentValue,
    value: a.value, unitPrice: a.unitPrice, valuedOn: a.valuedOn,
  };
  return labels[String(path)] ?? String(path ?? "");
}

async function attempt(work: (actor: Actor, today: string) => Promise<unknown>): Promise<MessageState> {
  const user = await requireUser();
  const { t } = await getDictionary();
  try {
    const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
    await work(userActor(user.id), todayIn(timezone));
  } catch (error: unknown) {
    if (error instanceof DomainError) return { error: t.errors[error.reason] };
    if (error instanceof ZodError) return { error: fmt(t.errors.invalidField, { field: fieldLabel(t, error.issues[0]?.path[0]) }) };
    console.error("[assets action]", error);
    return { error: t.errors.generic };
  }
  for (const path of PATHS) revalidatePath(path, "layout");
  return { ok: true, version: Date.now() };
}

const fields = (form: FormData) => ({
  name: str(form, "name"),
  kind: str(form, "kind") as "OTHER",
  units: str(form, "units"),
  purchaseValue: str(form, "purchaseValue"),
  purchasedOn: str(form, "purchasedOn"),
  note: str(form, "note"),
});

export async function createAssetAction(_prev: MessageState, form: FormData): Promise<MessageState> {
  return attempt((actor, today) => createAsset(actor, { ...fields(form), currentValue: str(form, "currentValue") }, today));
}

export async function updateAssetAction(id: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  return attempt((actor) => updateAsset(actor, id, fields(form)));
}

export async function valueAssetAction(assetId: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  return attempt((actor) => valueAsset(actor, { assetId, valuedOn: str(form, "valuedOn"), value: str(form, "value"), unitPrice: str(form, "unitPrice"), note: str(form, "note") }));
}

export async function removeValuationAction(form: FormData): Promise<void> {
  await attempt((actor) => removeValuation(actor, str(form, "id")));
}

export async function archiveAssetAction(form: FormData): Promise<void> {
  await attempt((actor) => setAssetArchived(actor, str(form, "id"), str(form, "archived") === "1"));
  if (str(form, "archived") === "1") redirect("/assets");
}
