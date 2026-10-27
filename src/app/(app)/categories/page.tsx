import type { Metadata } from "next";
import Link from "next/link";
import { archiveCategoryAction, createCategoryAction, renameCategoryAction } from "@/app/actions/ledger";
import { ActionForm } from "@/components/action-form";
import { Disclosure } from "@/components/disclosure";
import { buttonClass, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { CATEGORY_KINDS, listCategories, type CategoryRow } from "@/server/domain/categories";
import { getDictionary } from "@/i18n/server";
import { fmt, type Dictionary } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Categories" };

function CategoryItem({ c, t, child }: { c: CategoryRow; t: Dictionary; child?: boolean }) {
  return (
    <li className={`flex flex-wrap items-center gap-2 px-4 py-2 ${child ? "pl-9" : ""}`}>
      <details className="min-w-0 flex-1">
        <summary className="cursor-pointer list-none">
          <span className={c.archivedAt ? "text-muted line-through" : "font-medium"}>{c.name}</span>
          <span className="ml-2 text-xs text-muted">{fmt(t.categories.used, { n: c.transactionCount })}</span>
        </summary>
        <ActionForm action={renameCategoryAction.bind(null, c.id)} submit={t.categories.rename} className="mt-2 max-w-sm">
          <Input name="name" defaultValue={c.name} required maxLength={60} aria-label={t.categories.name} />
        </ActionForm>
      </details>
      <form action={archiveCategoryAction}>
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="archived" value={c.archivedAt ? "0" : "1"} />
        <button className={buttonClass.ghost}>{c.archivedAt ? t.common.unarchive : t.common.archive}</button>
      </form>
    </li>
  );
}

export default async function CategoriesPage({ searchParams }: PageProps<"/categories">) {
  const user = await requireUser();
  const { t } = await getDictionary();
  const showArchived = (await searchParams).archived === "1";
  const categories = await listCategories(user.id, { includeArchived: showArchived });
  const parents = categories.filter((c) => !c.parentId && !c.archivedAt);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageTitle
        actions={
          <Link href={showArchived ? "/categories" : "/categories?archived=1"} className="text-sm text-muted hover:text-text">
            {showArchived ? t.categories.title : t.common.showArchived}
          </Link>
        }
      >
        {t.categories.title}
      </PageTitle>

      <Card>
        <Disclosure summary={t.categories.add}>
          <ActionForm action={createCategoryAction} submit={t.common.save} success={t.common.saved} resetOnSuccess className="mt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.categories.name}>
                <Input name="name" required maxLength={60} />
              </Field>
              <Field label={t.categories.kind}>
                <Select name="kind" defaultValue="EXPENSE">
                  {CATEGORY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t.categories[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`${t.categories.parent} (${t.common.optional})`}>
                <Select name="parentId" defaultValue="">
                  <option value="">{t.categories.noParent}</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {t.categories[p.kind]} · {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </ActionForm>
        </Disclosure>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {CATEGORY_KINDS.map((kind) => (
          <Card key={kind} className="p-0">
            <h2 className="border-b border-border px-4 py-2.5 text-xs font-semibold text-muted">{t.categories[kind]}</h2>
            <ul className="divide-y divide-border">
              {categories
                .filter((c) => c.kind === kind && !c.parentId)
                .flatMap((c) => [
                  <CategoryItem key={c.id} c={c} t={t} />,
                  ...categories.filter((s) => s.parentId === c.id).map((s) => <CategoryItem key={s.id} c={s} t={t} child />),
                ])}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
