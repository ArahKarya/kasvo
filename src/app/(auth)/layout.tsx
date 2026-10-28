import { redirect } from "next/navigation";
import { Bot, CircleCheck, PiggyBank, Zap } from "lucide-react";
import { Logo } from "@/components/logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { currentUser } from "@/server/auth";
import { getDictionary } from "@/i18n/server";

const HIGHLIGHT_ICONS = [Zap, PiggyBank, Bot];

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await currentUser()) redirect("/dashboard");
  const { t, locale } = await getDictionary();
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative overflow-hidden bg-[linear-gradient(150deg,#1d7a57_0%,#145c42_50%,#0b3b2a_100%)] px-6 pt-[calc(2rem+env(safe-area-inset-top))] pb-10 text-white lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#f4ae2a]/20 blur-3xl" />
        <div className="relative mx-auto w-full max-w-md">
          <Logo className="text-2xl text-white" mark={36} inverted />
          <p className="mt-4 text-xl font-semibold tracking-tight lg:text-3xl">{t.app.tagline}</p>
          <ul className="mt-6 hidden space-y-3 text-white/85 lg:block">
            {t.app.highlights.map((h, i) => {
              const Icon = HIGHLIGHT_ICONS[i] ?? CircleCheck;
              return (
                <li key={h} className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12">
                    <Icon size={16} />
                  </span>
                  {h}
                </li>
              );
            })}
          </ul>
          <p className="mt-8 hidden text-sm text-white/60 lg:block">{t.app.selfHosted}</p>
        </div>
      </section>
      <section className="flex flex-col justify-center px-4 py-10">
        <div className="mx-auto w-full max-w-sm space-y-6">
          <div className="flex justify-end">
            <LocaleSwitch locale={locale} t={t} />
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>
        </div>
      </section>
    </main>
  );
}
