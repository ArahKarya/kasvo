import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { THEME_COOKIE } from "@/components/amounts-cookie";
import { ThemeSwitch } from "@/components/theme-switch";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { LocaleSwitch } from "@/components/locale-switch";
import { NAV_ITEMS } from "@/components/nav-items";
import { PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "More" };

const themeOf = (v: string | undefined) => (v === "light" || v === "dark" ? v : "system");

/**
 * Inside the Capacitor app (its user agent ends in "KasvoApp") the setup screen lives in the
 * app bundle, served at the WebView's local origin.
 */
function appSetupUrl(userAgent: string): string | null {
  if (!userAgent.includes("KasvoApp")) return null;
  return /iPhone|iPad|iPod/.test(userAgent) ? "capacitor://localhost/?setup=1" : "https://localhost/?setup=1";
}

/** Everything the phone's tab bar has no room for. */
export default async function MorePage() {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const inTabs = new Set(["dashboard", "transactions", "budgets"]);
  const setupUrl = appSetupUrl((await headers()).get("user-agent") ?? "");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageTitle>{t.mobileNav.more}</PageTitle>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {NAV_ITEMS.filter((i) => !inTabs.has(i.key)).map(({ href, key, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-border/30">
              <Icon size={18} className="text-muted" aria-hidden="true" />
              <span className="flex-1">{t.nav[key]}</span>
              <ChevronRight size={16} className="text-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <p className="truncate text-sm text-muted">{fmt(t.mobileNav.signedInAs, { email: user.email })}</p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">{t.mobileNav.theme}</span>
          <ThemeSwitch initial={themeOf((await cookies()).get(THEME_COOKIE)?.value)} labels={{ label: t.mobileNav.theme, light: t.mobileNav.themeLight, dark: t.mobileNav.themeDark, system: t.mobileNav.themeSystem }} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">{t.mobileNav.language}</span>
          <LocaleSwitch locale={locale} t={t} />
        </div>
        {setupUrl && (
          <a href={setupUrl} className="block text-sm text-accent">
            {t.mobileNav.changeServer}
          </a>
        )}
        <form action={logoutAction}>
          <button className="text-sm text-danger">{t.auth.logout}</button>
        </form>
      </section>
    </div>
  );
}
