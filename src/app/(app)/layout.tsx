import { Logo } from "@/components/logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { MobileNav } from "@/components/mobile-nav";
import { Sidebar } from "@/components/sidebar";
import { logoutAction } from "@/app/actions/auth";
import { requireUser } from "@/server/auth";
import { getDictionary } from "@/i18n/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="sticky top-0 z-20 flex items-center border-b border-border bg-surface px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <Logo className="py-3 text-base" />
      </header>
      <aside className="hidden flex-col gap-4 border-r border-border bg-surface p-4 md:flex md:w-56">
        <Logo className="text-lg" />
        <Sidebar labels={t.nav} />
        <div className="mt-auto space-y-3 border-t border-border pt-4">
          <p className="truncate text-xs text-muted">{user.email}</p>
          <LocaleSwitch locale={locale} t={t} />
          <form action={logoutAction}>
            <button className="text-sm text-muted hover:text-text">{t.auth.logout}</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 md:py-8">{children}</main>
      <MobileNav labels={{ dashboard: t.nav.dashboard, transactions: t.nav.transactions, record: t.mobileNav.record, budgets: t.nav.budgets, more: t.mobileNav.more }} />
    </div>
  );
}
