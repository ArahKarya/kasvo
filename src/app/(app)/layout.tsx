import { Logo } from "@/components/logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { Sidebar } from "@/components/sidebar";
import { logoutAction } from "@/app/actions/auth";
import { requireUser } from "@/server/auth";
import { getDictionary } from "@/i18n/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b border-border bg-surface p-4 md:w-56 md:border-r md:border-b-0">
        <Logo className="text-lg" />
        <Sidebar labels={t.nav} />
        <div className="mt-auto hidden space-y-3 border-t border-border pt-4 md:block">
          <p className="truncate text-xs text-muted">{user.email}</p>
          <LocaleSwitch locale={locale} t={t} />
          <form action={logoutAction}>
            <button className="text-sm text-muted hover:text-text">{t.auth.logout}</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
