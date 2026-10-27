import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { commitAction, discardAction, remapAction, revertAction } from "@/app/actions/imports";
import { ActionForm } from "@/components/action-form";
import { ImportReview } from "@/components/import-review";
import { buttonClass, Card, Field, PageTitle, Select } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getImport, importPreview } from "@/server/domain/import/queries";
import { formatMoney } from "@/server/domain/money";
import { toDay } from "@/server/domain/dates";
import { pickerOptions } from "@/server/domain/options";
import { getDictionary } from "@/i18n/server";
import { fmt, intlLocale, type Dictionary } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Import" };

function MappingForm({ batchId, preview, t }: { batchId: string; preview: string[][]; t: Dictionary }) {
  const im = t.imports;
  const width = Math.max(...preview.map((r) => r.length), 1);
  const columns = Array.from({ length: width }, (_, i) => i);
  const columnOptions = (withNone: boolean) => (
    <>
      {withNone && <option value="">{im.noColumn}</option>}
      {columns.map((i) => (
        <option key={i} value={i}>
          {fmt(im.column, { n: i + 1 })}
        </option>
      ))}
    </>
  );

  return (
    <Card className="space-y-4">
      <p className="text-sm">{im.mappingIntro}</p>
      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="text-xs">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-2 py-1">#</th>
              {columns.map((i) => (
                <th key={i} className="px-2 py-1 text-left font-medium">
                  {fmt(im.column, { n: i + 1 })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {preview.map((row, r) => (
              <tr key={r}>
                <td className="px-2 py-1 text-muted">{r + 1}</td>
                {columns.map((i) => (
                  <td key={i} className="max-w-48 truncate whitespace-nowrap px-2 py-1">
                    {row[i] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ActionForm action={remapAction.bind(null, batchId)} submit={im.applyMapping}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={im.headerRow}>
            <Select name="headerRow" defaultValue="0">
              {preview.map((_, r) => (
                <option key={r} value={r}>
                  {r + 1}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={im.columnDate}>
            <Select name="date" defaultValue="0">
              {columnOptions(false)}
            </Select>
          </Field>
          <Field label={im.dateOrder}>
            <Select name="dateOrder" defaultValue="DMY">
              <option value="DMY">DD/MM/YYYY</option>
              <option value="MDY">MM/DD/YYYY</option>
              <option value="YMD">YYYY-MM-DD</option>
            </Select>
          </Field>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-1.5 text-sm font-medium">{im.columnDescription}</legend>
          <div className="flex flex-wrap gap-3">
            {columns.map((i) => (
              <label key={i} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="description" value={i} defaultChecked={i === 1} className="accent-[var(--accent)]" />
                {fmt(im.column, { n: i + 1 })}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-4 space-y-3">
          <legend className="mb-1.5 text-sm font-medium">{im.amountMode}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="amountMode" value="single" defaultChecked className="accent-[var(--accent)]" />
            {im.amountSingle}
          </label>
          <div className="grid gap-4 pl-6 sm:grid-cols-2">
            <Field label={im.columnAmount}>
              <Select name="amount" defaultValue="2">
                {columnOptions(true)}
              </Select>
            </Field>
            <Field label={im.columnDirection}>
              <Select name="direction" defaultValue="">
                {columnOptions(true)}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="amountMode" value="split" className="accent-[var(--accent)]" />
            {im.amountSplit}
          </label>
          <div className="grid gap-4 pl-6 sm:grid-cols-2">
            <Field label={im.columnDebit}>
              <Select name="debit" defaultValue="">
                {columnOptions(true)}
              </Select>
            </Field>
            <Field label={im.columnCredit}>
              <Select name="credit" defaultValue="">
                {columnOptions(true)}
              </Select>
            </Field>
          </div>
        </fieldset>
      </ActionForm>
    </Card>
  );
}

export default async function ImportBatchPage({ params, searchParams }: PageProps<"/import/[id]">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { id } = await params;
  const again = (await searchParams).again === "1";
  const batch = await getImport(user.id, id);
  if (!batch) notFound();
  const im = t.imports;
  const open = batch.status === "STAGED" || batch.status === "NEEDS_MAPPING";
  const [{ categories }, preview] = await Promise.all([pickerOptions(user.id), batch.status === "NEEDS_MAPPING" ? importPreview(user.id, id) : null]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/import" className="text-sm text-muted hover:text-text">
        ← {t.common.back}
      </Link>
      <PageTitle>{batch.fileName ?? im.title}</PageTitle>
      <p className="-mt-4 text-sm text-muted">
        {[batch.accountName, im.status[batch.status], fmt(im.format, { format: batch.format.toUpperCase() }), batch.status === "COMMITTED" ? fmt(im.committedCount, { n: batch.committedCount }) : fmt(im.counts, { rows: batch.rowCount, dups: batch.duplicateCount })].join(" · ")}
      </p>

      {again && batch.status === "STAGED" && <p className="rounded-sm border border-accent/40 bg-accent/5 px-3 py-2 text-sm">{im.alreadyImported}</p>}

      {batch.status === "NEEDS_MAPPING" && preview && <MappingForm batchId={batch.id} preview={preview} t={t} />}

      {batch.status === "STAGED" && (
        <>
          <p className="text-sm text-muted">{im.reviewIntro}</p>
          <ImportReview
            action={commitAction.bind(null, batch.id, batch.rows.map((r) => r.id))}
            categories={categories}
            labels={{ include: im.include, duplicate: im.duplicate, commit: im.commit, uncategorized: t.tx.uncategorized, date: t.tx.date, description: t.tx.description, amount: t.tx.amount, category: t.tx.category }}
            rows={batch.rows.map((r) => ({
              id: r.id,
              date: toDay(r.bookedOn),
              description: r.description,
              payee: r.payee,
              amountText: formatMoney(r.amount, "IDR", intlLocale(locale)),
              sign: r.amount < 0n ? -1 : 1,
              duplicate: r.duplicate,
              categoryId: r.categoryId,
            }))}
          />
        </>
      )}

      {open && (
        <form action={discardAction}>
          <input type="hidden" name="id" value={batch.id} />
          <button className={buttonClass.ghost}>{im.discard}</button>
        </form>
      )}

      {batch.status === "COMMITTED" && (
        <div className="space-y-4">
          <Link href={`/transactions?account=${batch.accountId}&month=all`} className={`${buttonClass.secondary} inline-block`}>
            {im.viewTransactions}
          </Link>
          <details className="rounded-sm border border-danger/30 p-4">
            <summary className="cursor-pointer text-sm font-medium text-danger">{im.revert}</summary>
            <p className="mt-2 text-sm text-muted">{fmt(im.revertConfirm, { n: batch.committedCount })}</p>
            <form action={revertAction} className="mt-3">
              <input type="hidden" name="id" value={batch.id} />
              <button className={buttonClass.danger}>{im.revert}</button>
            </form>
          </details>
        </div>
      )}
    </div>
  );
}
