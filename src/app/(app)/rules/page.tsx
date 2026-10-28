import type { Metadata } from "next";
import { applyRulesAction, createRuleAction, deleteRuleAction, toggleRuleAction } from "@/app/actions/imports";
import { ActionForm } from "@/components/action-form";
import { Disclosure } from "@/components/disclosure";
import { buttonClass, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { formatMoney } from "@/server/domain/money";
import { pickerOptions } from "@/server/domain/options";
import { listRules } from "@/server/domain/rules";
import { getDictionary } from "@/i18n/server";
import { fmt, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Rules" };

export default async function RulesPage() {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const [rules, { accounts, categories }] = await Promise.all([listRules(user.id), pickerOptions(user.id)]);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, intlLocale(locale));
  const r = t.rules;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageTitle>{r.title}</PageTitle>
      <p className="-mt-3 text-sm text-muted">{r.intro}</p>

      <Card>
        <Disclosure summary={r.add} defaultOpen={rules.length === 0}>
          <ActionForm action={createRuleAction} submit={t.common.save} resetOnSuccess className="mt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={r.contains}>
                <Input name="contains" required minLength={2} maxLength={100} placeholder={r.containsPlaceholder} />
              </Field>
              <Field label={r.category}>
                <Select name="categoryId" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {(["EXPENSE", "INCOME"] as const).map((kind) => (
                    <optgroup key={kind} label={t.categories[kind]}>
                      {categories
                        .filter((c) => c.kind === kind)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label={`${r.account} (${t.common.optional})`}>
                <Select name="accountId" defaultValue="">
                  <option value="">{r.anyAccount}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`${r.setPayee} (${t.common.optional})`}>
                <Input name="setPayee" maxLength={120} />
              </Field>
              <Field label={`${r.minAmount} (${t.common.optional})`}>
                <Input name="minAmount" inputMode="decimal" placeholder="50rb" />
              </Field>
              <Field label={`${r.maxAmount} (${t.common.optional})`}>
                <Input name="maxAmount" inputMode="decimal" placeholder="1jt" />
              </Field>
              <Field label={r.priority} hint={r.priorityHint}>
                <Input name="priority" type="number" min={0} max={10000} defaultValue={100} />
              </Field>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" name="apply" defaultChecked className="accent-[var(--accent)]" />
              {r.applyNow}
            </label>
          </ActionForm>
        </Disclosure>
      </Card>

      {rules.length === 0 ? (
        <p className="text-sm text-muted">{r.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rules.map((rule) => (
            <li key={rule.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${rule.enabled ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1 text-sm">
                <p>
                  <span className="text-muted">{fmt(r.when, { text: rule.contains })}</span> → <span className="font-medium">{rule.categoryName}</span>
                </p>
                <p className="text-xs text-muted">
                  {[
                    t.categories[rule.kind ?? "EXPENSE"],
                    rule.accountName,
                    rule.minAmount !== null ? `≥ ${money(rule.minAmount)}` : null,
                    rule.maxAmount !== null ? `≤ ${money(rule.maxAmount)}` : null,
                    rule.setPayee ? `${r.setPayee}: ${rule.setPayee}` : null,
                    `${r.priority} ${rule.priority}`,
                    rule.enabled ? null : r.disabled,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <form action={toggleRuleAction}>
                <input type="hidden" name="id" value={rule.id} />
                <input type="hidden" name="enabled" value={rule.enabled ? "0" : "1"} />
                <button className={buttonClass.ghost}>{rule.enabled ? r.disable : r.enable}</button>
              </form>
              <form action={deleteRuleAction}>
                <input type="hidden" name="id" value={rule.id} />
                <button className={buttonClass.ghost}>{t.common.delete}</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {rules.length > 0 && (
        <ActionForm action={applyRulesAction} submit={r.applyAll}>
          <></>
        </ActionForm>
      )}
    </div>
  );
}
