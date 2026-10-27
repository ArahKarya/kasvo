"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { userActor } from "@/server/domain/actor";
import { createToken, revokeToken, SCOPES, type Scope } from "@/server/domain/tokens";
import { getDictionary } from "@/i18n/server";

export interface TokenFormState {
  token?: string;
  error?: string;
}

const EXPIRY_DAYS: Record<string, number | undefined> = { "30": 30, "90": 90, "365": 365, never: undefined };

export async function createTokenAction(_prev: TokenFormState, form: FormData): Promise<TokenFormState> {
  const user = await requireUser();
  const { t } = await getDictionary();
  const access = form.get("access");
  const name = form.get("name");
  if (typeof name !== "string" || !name.trim() || !SCOPES.includes(access as Scope)) return { error: t.auth.checkFields };
  const expiry = String(form.get("expiry") ?? "90");
  try {
    const { token } = await createToken(userActor(user.id), { name, scopes: [access as Scope], expiresInDays: EXPIRY_DAYS[expiry] });
    revalidatePath("/settings");
    return { token };
  } catch (error: unknown) {
    console.error("[settings]", error);
    return { error: t.errors.generic };
  }
}

export async function revokeTokenAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = form.get("id");
  if (typeof id === "string") await revokeToken(userActor(user.id), id);
  revalidatePath("/settings");
}
