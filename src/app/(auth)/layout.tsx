import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { currentUser } from "@/server/auth";
import { getDictionary } from "@/i18n/server";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await currentUser()) redirect("/dashboard");
  const { t, locale } = await getDictionary();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 px-4 py-12">
      <div className="flex items-center justify-between">
        <Logo className="text-xl" />
        <LocaleSwitch locale={locale} t={t} />
      </div>
      <p className="-mt-4 text-sm text-muted">{t.app.tagline}</p>
      <div className="rounded-xl border border-border bg-surface p-6">{children}</div>
    </main>
  );
}
