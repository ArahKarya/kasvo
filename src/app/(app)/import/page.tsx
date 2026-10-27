import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { uploadAction } from "@/app/actions/imports";
import { ActionForm } from "@/components/action-form";
import { buttonClass, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { listAccounts } from "@/server/domain/accounts";
import { listImports } from "@/server/domain/import/queries";
import { getDictionary } from "@/i18n/server";
import { fmt, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage({ searchParams }: PageProps<"/import">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const preselect = (await searchParams).account;
  const [accounts, history] = await Promise.all([listAccounts(user.id), listImports(user.id)]);
  const when = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" });
  const im = t.imports;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageTitle actions={<Link href="/rules" className={buttonClass.ghost}>{t.rules.title}</Link>}>{im.title}</PageTitle>

      <Card className="space-y-4">
        <p className="text-sm">{im.intro}</p>
        {accounts.length === 0 ? (
          <Link href="/accounts" className={buttonClass.primary}>
            {t.accounts.add}
          </Link>
        ) : (
          <ActionForm action={uploadAction} submit={im.upload}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={im.account}>
                <Select name="accountId" defaultValue={typeof preselect === "string" ? preselect : accounts[0].id}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={im.file}>
                <Input name="file" type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" required className="py-1.5" />
              </Field>
              <Field label={`${im.password} (${t.common.optional})`} hint={im.passwordHint} className="sm:col-span-2">
                <Input name="password" type="password" autoComplete="off" maxLength={200} className="sm:max-w-xs" />
              </Field>
            </div>
          </ActionForm>
        )}
        <p className="text-xs text-muted">{im.supported}</p>
      </Card>

      <section className="space-y-2">
        <h2 className="font-semibold">{im.history}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">{im.noHistory}</p>
        ) : (
          <ul className="divide-y divide-border rounded-sm border border-border bg-surface">
            {history.map((b) => (
              <li key={b.id}>
                <Link href={`/import/${b.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-border/30">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.fileName ?? b.format}</p>
                    <p className="text-xs text-muted">
                      {[b.accountName, im.status[b.status], b.status === "COMMITTED" ? fmt(im.committedCount, { n: b.committedCount }) : fmt(im.counts, { rows: b.rowCount, dups: b.duplicateCount }), when.format(b.createdAt), b.createdBy]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
