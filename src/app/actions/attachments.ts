"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { userActor } from "@/server/domain/actor";
import { addAttachment, removeAttachment } from "@/server/domain/attachments";
import { DomainError } from "@/server/domain/errors";
import { getDictionary } from "@/i18n/server";

export interface UploadResult {
  ok: boolean;
  error?: string;
}

/** One file per call, so a 5 MB PDF stays under the request limit and each file reports its own error. */
export async function uploadAttachmentAction(transactionId: string, form: FormData): Promise<UploadResult> {
  const user = await requireUser();
  const { t } = await getDictionary();
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: t.errors.attachment_type };
  try {
    await addAttachment(userActor(user.id), { transactionId, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  } catch (error: unknown) {
    if (error instanceof DomainError) return { ok: false, error: t.errors[error.reason] };
    console.error("[attachment upload]", error);
    return { ok: false, error: t.errors.generic };
  }
  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/transactions");
  return { ok: true };
}

export async function removeAttachmentAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = form.get("id");
  if (typeof id !== "string") return;
  const { transactionId } = await removeAttachment(userActor(user.id), id);
  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/transactions");
}
