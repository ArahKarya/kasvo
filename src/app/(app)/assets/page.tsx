import type { Metadata } from "next";
import Link from "next/link";
import { createAssetAction } from "@/app/actions/assets";
import { ActionForm } from "@/components/action-form";
import { AssetFields } from "@/components/asset-fields";
import { ASSET_ICONS } from "@/components/asset-icons";
import { Disclosure } from "@/components/disclosure";
import { Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getMonitor, listAssets } from "@/server/domain/assets";
import { AssetMonitor } from "@/components/asset-monitor";
import { db } from "@/server/db";
import { todayIn } from "@/server/domain/dates";
import { formatMoney } from "@/server/domain/money";
import { getDictionary } from "@/i18n/server";
import { fmt, formatDay, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Assets" };

export default async function AssetsPage() {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const all = await listAssets(user.id, { includeArchived: true });
  const monitor = await getMonitor(user.id, todayIn(timezone));
  const il = intlLocale(locale);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const a = t.assets;
  const active = all.filter((x) => !x.archived);
  const archived = all.filter((x) => x.archived);
  const monthLabel = (month: string) => new Intl.DateTimeFormat(il, { month: "short", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const total = active.reduce((s, x) => s + x.value, 0n);
  const cost = active.reduce((s, x) => s + (x.purchaseValue ?? 0n), 0n);
  const gain = active.filter((x) => x.gain !== null).reduce((s, x) => s + x.gain!, 0n);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageTitle>{a.title}</PageTitle>
      <p className="-mt-3 text-sm text-muted">{a.intro}</p>

      {active.length > 0 && (
        <section className="rounded-2xl bg-[linear-gradient(135deg,#1d7a57_0%,#0f4a35_100%)] p-5 text-white">
          <p className="text-sm text-white/75">{a.total}</p>
          <p className="num text-3xl font-bold tracking-tight">{money(total)}</p>
          {cost > 0n && (
            <p className="mt-2 text-sm text-white/85">
              {a.gain}:{" "}
              <span className="num font-semibold">
                {gain > 0n ? "+" : ""}
                {money(gain)} ({cost > 0n ? `${gain > 0n ? "+" : ""}${((Number(gain) / Number(cost)) * 100).toFixed(1)}%` : "—"})
              </span>
            </p>
          )}
        </section>
      )}

      {active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">{a.empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {active.map((x) => {
            const Icon = ASSET_ICONS[x.kind];
            return (
              <li key={x.id}>
                <Link href={`/assets/${x.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent/50">
                  <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold-text">
                    <Icon size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{x.name}</span>
                    <span className="block text-xs text-muted">
                      {[a.kinds[x.kind], x.units ? `${x.units} unit` : null, x.purchaseValue !== null ? `${a.acquired} ${money(x.purchaseValue)}` : null, x.valuedOn ? fmt(a.asOf, { date: formatDay(x.valuedOn, il) }) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-semibold whitespace-nowrap">{money(x.value)}</span>
                    {x.gain !== null && x.gain !== 0n && (
                      <span className={`num block text-xs ${x.gain > 0n ? "text-income" : "text-expense"}`}>
                        {x.gain > 0n ? "+" : ""}
                        {money(x.gain)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <AssetMonitor monitor={monitor} t={t} money={money} monthLabel={monthLabel} />

      <Card>
        <Disclosure summary={a.add} defaultOpen={active.length === 0}>
          <div className="mt-4">
            <ActionForm action={createAssetAction} submit={t.common.save} success={t.common.saved} resetOnSuccess>
              <AssetFields t={t} withCurrentValue />
            </ActionForm>
          </div>
        </Disclosure>
      </Card>

      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">{a.archivedList}</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {archived.map((x) => (
              <li key={x.id} className="flex justify-between px-4 py-2">
                <Link href={`/assets/${x.id}`} className="hover:underline">
                  {x.name}
                </Link>
                <span className="num text-muted">{money(x.value)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
