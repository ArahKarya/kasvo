import { cookies } from "next/headers";
import { AmountsToggle } from "@/components/amounts-toggle";
import { HIDE_AMOUNTS_COOKIE, THEME_COOKIE, type ThemeChoice } from "@/components/amounts-cookie";
import { ThemeSwitch } from "@/components/theme-switch";
import { Logo } from "@/components/logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { MobileNav } from "@/components/mobile-nav";
import { QuickEntrySheet } from "@/components/quick-entry-sheet";
import { db } from "@/server/db";
import { todayIn } from "@/server/domain/dates";
import { pickerOptions } from "@/server/domain/options";
import { intlLocale } from "@/i18n/dictionaries";
import { Sidebar } from "@/components/sidebar";
import { logoutAction } from "@/app/actions/auth";
import { requireUser } from "@/server/auth";
import { getDictionary } from "@/i18n/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const jar = await cookies();
  const hidden = jar.get(HIDE_AMOUNTS_COOKIE)?.value === "1";
  const themeCookie = jar.get(THEME_COOKIE)?.value;
  const theme: ThemeChoice = themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";
  const eyeLabels = { hide: t.mobileNav.hideAmounts, show: t.mobileNav.showAmounts };
  const [{ timezone }, options] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } }),
    pickerOptions(user.id),
  ]);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <Logo className="py-3 text-base" />
        <AmountsToggle hidden={hidden} labels={eyeLabels} className="rounded-sm p-2 text-muted hover:bg-border/40 hover:text-text" />
      </header>
      <aside className="hidden flex-col gap-4 border-r border-border bg-surface p-4 md:flex md:w-56">
        <Logo className="text-lg" />
        <Sidebar labels={t.nav} />
        <div className="mt-auto space-y-3 border-t border-border pt-4">
          <p className="truncate text-xs text-muted">{user.email}</p>
          <div className="flex items-center justify-between gap-2">
            <LocaleSwitch locale={locale} t={t} />
            <AmountsToggle hidden={hidden} labels={eyeLabels} className="rounded-sm p-1.5 text-muted hover:bg-border/40 hover:text-text" />
          </div>
          <ThemeSwitch initial={theme} labels={{ label: t.mobileNav.theme, light: t.mobileNav.themeLight, dark: t.mobileNav.themeDark, system: t.mobileNav.themeSystem }} />
          <form action={logoutAction}>
            <button className="text-sm text-muted hover:text-text">{t.auth.logout}</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 md:py-8">{children}</main>
      <QuickEntrySheet
        accounts={options.accounts}
        categories={options.categories}
        today={todayIn(timezone)}
        locale={intlLocale(locale)}
        currency={user.baseCurrency}
        labels={{ quick: t.quick, tx: t.tx }}
      />
      <MobileNav labels={{ dashboard: t.nav.dashboard, transactions: t.nav.transactions, record: t.mobileNav.record, budgets: t.nav.budgets, more: t.mobileNav.more }} />
    </div>
  );
}
