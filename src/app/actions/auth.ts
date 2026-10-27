"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser, login, logout, register } from "@/server/auth";
import { db } from "@/server/db";
import { getDictionary, LOCALE_COOKIE } from "@/i18n/server";
import { isLocale } from "@/i18n/dictionaries";

export interface AuthFormState {
  error?: string;
}

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  password: z.string().min(8).max(200),
});

export async function loginAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const { t } = await getDictionary();
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: t.auth.checkFields };
  if (!(await login(parsed.data.email, parsed.data.password))) return { error: t.auth.invalid };
  redirect("/dashboard");
}

export async function registerAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const { t, locale } = await getDictionary();
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: t.auth.checkFields };
  const outcome = await register({ ...parsed.data, locale });
  if (outcome === "taken") return { error: t.auth.taken };
  if (outcome === "closed") return { error: t.auth.closed };
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}

/** Saves the language on the cookie, and on the user when signed in. */
export async function setLocaleAction(form: FormData): Promise<void> {
  const locale = form.get("locale");
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const user = await currentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale } });
  revalidatePath("/", "layout");
}
