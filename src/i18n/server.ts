import "server-only";

import { cookies } from "next/headers";
import { currentUser } from "@/server/auth";
import { dictionaries, isLocale, type Dictionary, type Locale } from "./dictionaries";

export const LOCALE_COOKIE = "kasvo_locale";

/** The signed-in user's language, else the cookie, else Indonesian. */
export async function getLocale(): Promise<Locale> {
  const user = await currentUser();
  if (user && isLocale(user.locale)) return user.locale;
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(cookie) ? cookie : "id";
}

export async function getDictionary(): Promise<{ t: Dictionary; locale: Locale }> {
  const locale = await getLocale();
  return { t: dictionaries[locale], locale };
}
