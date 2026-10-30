import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveAssetAction, removeValuationAction, updateAssetAction, valueAssetAction } from "@/app/actions/assets";
import { ActionForm } from "@/components/action-form";
import { AssetFields } from "@/components/asset-fields";
import { ASSET_ICONS } from "@/components/asset-icons";
import { Disclosure } from "@/components/disclosure";
import { buttonClass, Card, Field, Input } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { getAsset } from "@/server/domain/assets";
import { AssetSparkline } from "@/components/asset-sparkline";
import { buildSeries, isStale, lastChange, monthEndValues, STALE_AFTER_DAYS } from "@/server/domain/asset-trend";
import { monthsUntil } from "@/server/domain/goal-math";
import { todayIn } from "@/server/domain/dates";
import { DomainError } from "@/server/domain/errors";
import { formatMoney } from "@/server/domain/money";
import { getDictionary } from "@/i18n/server";
import { fmt, formatDay, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Asset" };

export default async function AssetPage({ params }: PageProps<"/assets/[id]">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { id } = await params;
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const asset = await getAsset(user.id, id).catch((error: unknown) => {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const il = intlLocale(locale);
  const today = todayIn(timezone);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const a = t.assets;
  const Icon = ASSET_ICONS[asset.kind];
  const series = buildSeries(
    { day: asset.purchasedOn, value: asset.purchaseValue },
    [...asset.valuations].reverse().map((v) => ({ day: v.valuedOn, value: v.value })),
  );
  const change = lastChange(series);
  const months = monthEndValues(series, today, 12);
  const monthLabel = (month: string) => new Intl.DateTimeFormat(il, { month: "short", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const stale = isStale(asset.valuedOn, today);
  const optional = (label: string) => `${label} (${t.common.optional})`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/assets" className="text-sm text-muted hover:text-text">
        ← {t.common.back}
      </Link>
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-5">
        <span aria-hidden="true" className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold-text">
          <Icon size={28} />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="text-2xl font-bold tracking-tight break-words">{asset.name}</h1>
          <p className="text-sm text-muted">
            {[a.kinds[asset.kind], asset.units ? `${asset.units} unit` : null, asset.purchaseValue !== null ? fmt(a.purchasePrice, { amount: money(asset.purchaseValue) }) : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="w-full border-t border-border pt-3 sm:w-auto sm:border-0 sm:pt-0 sm:text-right">
          <p className="num text-xl font-bold">{money(asset.value)}</p>
          {asset.gain !== null && (
            <p className={`num text-sm ${asset.gain > 0n ? "text-income" : asset.gain < 0n ? "text-expense" : "text-muted"}`}>
              {asset.gain > 0n ? "+" : ""}
              {money(asset.gain)}
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">{a.acquired}</p>
          <p className="num mt-1 text-lg font-bold">{asset.purchaseValue !== null ? money(asset.purchaseValue) : "—"}</p>
          <p className="mt-1 text-xs text-muted">
            {asset.purchasedOn ? formatDay(asset.purchasedOn, il) : ""}
            {asset.purchasedOn ? ` · ${fmt(a.ageMonths, { n: String(monthsUntil(asset.purchasedOn, today)) })}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">{a.marketValue}</p>
          <p className="num mt-1 text-lg font-bold">{money(asset.value)}</p>
          <p className="mt-1 text-xs text-muted">{asset.valuedOn ? fmt(a.valuedAsOf, { date: formatDay(asset.valuedOn, il) }) : a.notValued}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">{asset.gain !== null && asset.gain > 0n ? a.gainLabel : a.lossLabel}</p>
          <p className={`num mt-1 text-lg font-bold ${asset.gain === null || asset.gain === 0n ? "" : asset.gain > 0n ? "text-income" : "text-expense"}`}>
            {asset.gain === null ? "—" : `${asset.gain > 0n ? "+" : ""}${money(asset.gain)}`}
          </p>
          <p className="mt-1 text-xs text-muted">
            {asset.gain !== null && asset.purchaseValue ? fmt(a.pctOfCost, { pct: `${((Number(asset.gain) / Number(asset.purchaseValue)) * 100).toFixed(1)}%` }) : ""}
          </p>
        </div>
      </section>

      {series.length > 1 && (
        <Card>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{a.trendTitle}</h2>
            {change && (
              <p className={`num text-sm ${change.delta > 0n ? "text-income" : change.delta < 0n ? "text-expense" : "text-muted"}`}>
                {change.delta > 0n ? "+" : ""}
                {money(change.delta)}
                {change.pct !== null ? ` (${change.pct > 0 ? "+" : ""}${change.pct.toFixed(1)}%)` : ""} <span className="text-xs text-muted">{fmt(a.trendSince, { date: formatDay(change.since, il) })}</span>
              </p>
            )}
          </div>
          <AssetSparkline
            points={months.map((m) => ({ label: monthLabel(m.month), value: m.value === null ? null : Number(m.value), text: m.value === null ? "" : money(m.value) }))}
            tone={!change || change.delta === 0n ? "flat" : change.delta > 0n ? "up" : "down"}
            summary={fmt(a.monitorChartAsset, { name: asset.name, months: String(months.length) })}
            height={72}
          />
          <p className="mt-1 flex justify-between text-[10px] text-muted">
            <span>{monthLabel(months[0].month)}</span>
            <span>{monthLabel(months[months.length - 1].month)}</span>
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-1 font-semibold">{a.updateValue}</h2>
        {stale && ["GOLD", "STOCK", "FUND", "CRYPTO"].includes(asset.kind) && <p className="mb-2 text-xs font-medium text-gold-text">{fmt(a.staleHint, { n: String(STALE_AFTER_DAYS) })}</p>}
        <p className="mb-4 text-xs text-muted">{a.valueHint}</p>
        <ActionForm action={valueAssetAction.bind(null, asset.id)} submit={t.common.save} success={t.common.saved} resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={a.value} hint={t.tx.amountHint}>
              <Input name="value" inputMode="decimal" placeholder="16jt" />
            </Field>
            {asset.units && (
              <Field label={optional(a.unitPrice)}>
                <Input name="unitPrice" inputMode="decimal" placeholder="1,45jt" />
              </Field>
            )}
            <Field label={a.valuedOn}>
              <Input name="valuedOn" type="date" required defaultValue={today} />
            </Field>
          </div>
        </ActionForm>
      </Card>

      <section className="space-y-2">
        <h2 className="font-semibold">{a.history}</h2>
        {asset.valuations.length === 0 ? (
          <p className="text-sm text-muted">{a.noHistory}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {asset.valuations.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-muted">{formatDay(v.valuedOn, il)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{v.unitPrice !== null ? `${money(v.unitPrice)} / unit` : v.note}</span>
                <span className="num font-medium">{money(v.value)}</span>
                <form action={removeValuationAction}>
                  <input type="hidden" name="id" value={v.id} />
                  <button className={buttonClass.ghost}>{a.remove}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <Disclosure summary={a.editTitle}>
          <div className="mt-4">
            <ActionForm action={updateAssetAction.bind(null, asset.id)} submit={t.common.save} success={t.common.saved}>
              <AssetFields t={t} asset={asset} />
            </ActionForm>
          </div>
        </Disclosure>
      </Card>

      <form action={archiveAssetAction}>
        <input type="hidden" name="id" value={asset.id} />
        <input type="hidden" name="archived" value={asset.archived ? "0" : "1"} />
        <button className={asset.archived ? buttonClass.secondary : buttonClass.danger}>{asset.archived ? t.common.unarchive : t.common.archive}</button>
      </form>
    </div>
  );
}
