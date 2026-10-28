import type { Metadata } from "next";
import Link from "next/link";
import { archiveCategoryAction, createCategoryAction, updateCategoryAction } from "@/app/actions/ledger";
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon } from "@/components/category-icons";
import { ActionForm } from "@/components/action-form";
import { Disclosure } from "@/components/disclosure";
import { buttonClass, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { CATEGORY_KINDS, listCategories, type CategoryRow } from "@/server/domain/categories";
import { getDictionary } from "@/i18n/server";
import { fmt, type Dictionary } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Categories" };

function CategoryItem({ c, t, child }: { c: CategoryRow; t: Dictionary; child?: boolean }) {
  const ct = t.categories;
  const swatch = "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border peer-checked:border-accent peer-checked:ring-2 peer-checked:ring-accent/30 peer-focus-visible:ring-2 peer-focus-visible:ring-accent";
  return (
    <li className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${child ? "pl-10" : ""}`}>
      <details className="min-w-0 flex-1">
        <summary className="flex cursor-pointer list-none items-center gap-3">
          <CategoryIcon icon={c.icon} color={c.color} size={32} />
          <span className="min-w-0">
            <span className={`block truncate ${c.archivedAt ? "text-muted line-through" : "font-medium"}`}>{c.name}</span>
            <span className="block text-xs text-muted">
              {[fmt(ct.used, { n: c.transactionCount }), c.necessity ? ct.necessity[c.necessity] : null].filter(Boolean).join(" · ")}
            </span>
          </span>
        </summary>
        <ActionForm action={updateCategoryAction.bind(null, c.id)} submit={t.common.save} success={t.common.saved} className="mt-3 space-y-4">
          <Input name="name" defaultValue={c.name} required maxLength={60} aria-label={ct.name} className="max-w-sm" />
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{ct.icon}</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
                <label key={key}>
                  <input type="radio" name="icon" value={key} defaultChecked={(c.icon ?? "tag") === key} className="peer sr-only" />
                  <span className={swatch} title={key}>
                    <Icon size={17} aria-label={key} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{ct.color}</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CATEGORY_COLORS).map(([key, hex]) => (
                <label key={key}>
                  <input type="radio" name="color" value={key} defaultChecked={(c.color ?? "slate") === key} className="peer sr-only" />
                  <span className={swatch} title={key}>
                    <span className="h-5 w-5 rounded-md" style={{ background: hex }} aria-label={key} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {c.kind === "EXPENSE" && (
            <Field label={ct.necessityLabel} hint={ct.necessityHint} className="max-w-sm">
              <Select name="necessity" defaultValue={c.necessity ?? ""}>
                <option value="">{ct.necessity.NONE}</option>
                <option value="NEED">{ct.necessity.NEED}</option>
                <option value="WANT">{ct.necessity.WANT}</option>
              </Select>
            </Field>
          )}
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
