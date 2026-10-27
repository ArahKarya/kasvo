"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth";
import { userActor, type Actor } from "@/server/domain/actor";
import { DomainError } from "@/server/domain/errors";
import { commitImport, discardImport, remapImport, revertImport, stageFile, stagePdf } from "@/server/domain/import/service";
import { applyRules, createRule, deleteRule, setRuleEnabled } from "@/server/domain/rules";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/dictionaries";
import type { FormState } from "./ledger";

export interface MessageState extends FormState {
  message?: string;
}

async function attempt<T>(work: (actor: Actor) => Promise<T>): Promise<{ value?: T; error?: string }> {
  const user = await requireUser();
  const { t } = await getDictionary();
  try {
    return { value: await work(userActor(user.id)) };
  } catch (error: unknown) {
    if (error instanceof DomainError) return { error: t.errors[error.reason] };
    if (error instanceof ZodError) return { error: t.errors.generic };
    console.error("[imports action]", error);
    return { error: t.errors.generic };
  }
}

const str = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};
const optionalIndex = (form: FormData, key: string): number | undefined => (str(form, key) === "" ? undefined : Number(str(form, key)));

const PATHS = ["/import", "/transactions", "/dashboard", "/accounts"];
const refresh = () => PATHS.forEach((p) => revalidatePath(p));

/** PDFs are recognised by their signature, not the file name. */
const isPdf = (bytes: Uint8Array): boolean => bytes.length > 4 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";

export async function uploadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: (await getDictionary()).t.errors.no_rows };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const accountId = str(form, "accountId");
  // The password goes straight to the PDF reader and is not kept anywhere.
  const password = form.get("password");
  const r = await attempt((actor) =>
    isPdf(bytes)
      ? stagePdf(actor, { accountId, fileName: file.name, bytes, password: typeof password === "string" && password !== "" ? password : undefined })
      : stageFile(actor, { accountId, fileName: file.name, text: new TextDecoder().decode(bytes) }),
  );
  if (r.error || !r.value) return { error: r.error };
  const query = new URLSearchParams();
  if (r.value.alreadyImportedAs) query.set("again", "1");
  if (r.value.unsigned) query.set("unsigned", String(r.value.unsigned));
  redirect(`/import/${r.value.batchId}${query.size ? `?${query}` : ""}`);
}

export async function remapAction(batchId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const split = str(form, "amountMode") === "split";
  const r = await attempt((actor) =>
    remapImport(actor, batchId, {
      headerRow: Number(str(form, "headerRow")),
      date: Number(str(form, "date")),
      description: form.getAll("description").map(Number),
      ...(split
        ? { debit: optionalIndex(form, "debit"), credit: optionalIndex(form, "credit") }
        : { amount: optionalIndex(form, "amount"), direction: optionalIndex(form, "direction") }),
      dateOrder: (str(form, "dateOrder") || "DMY") as "DMY" | "MDY" | "YMD",
    }),
  );
  if (r.error) return { error: r.error };
  revalidatePath(`/import/${batchId}`);
  return { ok: true, version: Date.now() };
}

/** Each row posts `inc:<id>` when ticked and `cat:<id>` with its category. */
export async function commitAction(batchId: string, rowIds: string[], _prev: FormState, form: FormData): Promise<FormState> {
  const overrides = Object.fromEntries(
    rowIds.map((id) => [id, { skip: form.get(`inc:${id}`) !== "on", categoryId: str(form, `cat:${id}`) || null }]),
  );
  const r = await attempt((actor) => commitImport(actor, batchId, { overrides, includeDuplicates: true }));
  if (r.error) return { error: r.error };
  refresh();
  redirect(`/import/${batchId}`);
}

export async function discardAction(form: FormData): Promise<void> {
  await attempt((actor) => discardImport(actor, str(form, "id")));
  refresh();
  redirect("/import");
}

export async function revertAction(form: FormData): Promise<void> {
  const id = str(form, "id");
  await attempt((actor) => revertImport(actor, id));
  refresh();
  redirect(`/import/${id}`);
}

export async function createRuleAction(_prev: MessageState, form: FormData): Promise<MessageState> {
  const { t } = await getDictionary();
  const r = await attempt(async (actor) => {
    const created = await createRule(actor, {
      contains: str(form, "contains"),
      categoryId: str(form, "categoryId"),
      accountId: str(form, "accountId") || undefined,
      minAmount: str(form, "minAmount") || undefined,
      maxAmount: str(form, "maxAmount") || undefined,
      setPayee: str(form, "setPayee") || undefined,
      priority: str(form, "priority") ? Number(str(form, "priority")) : undefined,
    });
    const applied = form.get("apply") === "on" ? await applyRules(actor, created.id) : 0;
    return { ...created, applied };
  });
  if (r.error || !r.value) return { error: r.error };
  refresh();
  revalidatePath("/rules");
  const message = r.value.applied
    ? fmt(t.rules.applied, { n: r.value.applied })
    : fmt(t.rules.created, { n: r.value.matchesExisting });
  return { ok: true, version: Date.now(), message };
}

export async function applyRulesAction(): Promise<MessageState> {
  const { t } = await getDictionary();
  const r = await attempt((actor) => applyRules(actor));
  if (r.error) return { error: r.error };
  refresh();
  revalidatePath("/rules");
  return { ok: true, version: Date.now(), message: fmt(t.rules.applied, { n: r.value ?? 0 }) };
}

export async function toggleRuleAction(form: FormData): Promise<void> {
  await attempt((actor) => setRuleEnabled(actor, str(form, "id"), form.get("enabled") === "1"));
  revalidatePath("/rules");
}

export async function deleteRuleAction(form: FormData): Promise<void> {
  await attempt((actor) => deleteRule(actor, str(form, "id")));
  revalidatePath("/rules");
}
