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
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const a = t.assets;
  const Icon = ASSET_ICONS[asset.kind];
  const optional = (label: string) => `${label} (${t.common.optional})`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/assets" className="text-sm text-muted hover:text-text">
        ← {t.common.back}
      </Link>
      <section className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5">
        <span aria-hidden="true" className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold-text">
          <Icon size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{asset.name}</h1>
          <p className="text-sm text-muted">
            {[a.kinds[asset.kind], asset.units ? `${asset.units} unit` : null, asset.purchaseValue !== null ? fmt(a.purchasePrice, { amount: money(asset.purchaseValue) }) : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right">
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
            {asset.purchasedOn ? ` · ${fmt(a.ageMonths, { n: String(Math.max(0, Math.floor((Date.now() - new Date(asset.purchasedOn).getTime()) / 2629800000))) })}` : ""}
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

      <Card>
        <h2 className="mb-1 font-semibold">{a.updateValue}</h2>
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
              <Input name="valuedOn" type="date" required defaultValue={todayIn(timezone)} />
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
