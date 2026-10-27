"use client";

import { useState } from "react";
import type { FormState } from "@/app/actions/ledger";
import type { Dictionary } from "@/i18n/dictionaries";
import { ActionForm } from "./action-form";
import { Field, Input, Select } from "./ui";

type Kind = "EXPENSE" | "INCOME" | "TRANSFER";

export interface Option {
  id: string;
  name: string;
}

export interface CategoryOption extends Option {
  kind: "INCOME" | "EXPENSE";
}

export interface TransactionDefaults {
  kind: Kind;
  accountId: string;
  amount: string;
  bookedOn: string;
  description: string;
  payee: string;
  note: string;
  categoryId: string;
}

interface TransactionFormProps {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  labels: Pick<Dictionary, "tx" | "common">;
  accounts: Option[];
  categories: CategoryOption[];
  defaults: TransactionDefaults;
  /** Create mode offers Transfer and clears after saving; edit mode keeps values. */
  mode: "create" | "edit";
  /** Editing a transfer leg: only date, description, and note. */
  transferLeg?: boolean;
}

export function TransactionForm({ action, labels, accounts, categories, defaults, mode, transferLeg = false }: TransactionFormProps) {
  const { tx, common } = labels;
  const [kind, setKind] = useState<Kind>(defaults.kind);
  const kinds: Kind[] = mode === "create" ? ["EXPENSE", "INCOME", "TRANSFER"] : ["EXPENSE", "INCOME"];
  const kindLabel: Record<Kind, string> = { EXPENSE: tx.expense, INCOME: tx.income, TRANSFER: tx.transfer };
  const isTransfer = kind === "TRANSFER";
  const feeCategory = categories.find((c) => c.kind === "EXPENSE" && /admin|fee/i.test(c.name));

  return (
    <ActionForm
      action={action}
      submit={mode === "create" ? tx.record : common.save}
      success={mode === "create" ? tx.recorded : common.saved}
      resetOnSuccess={mode === "create"}
    >
      {transferLeg ? (
        <p className="mb-4 rounded-sm border border-border bg-bg px-3 py-2 text-sm text-muted">{tx.transferLocked}</p>
      ) : (
        <div role="tablist" aria-label={tx.kind} className="mb-4 inline-flex rounded-sm border border-border p-0.5">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className="rounded-sm px-3 py-1.5 text-sm text-muted aria-selected:bg-accent aria-selected:font-semibold aria-selected:text-accent-text"
            >
              {kindLabel[k]}
            </button>
          ))}
        </div>
      )}
      <input type="hidden" name="kind" value={kind} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!transferLeg && (
          <>
            <Field label={tx.amount} hint={tx.amountHint}>
              <Input name="amount" required inputMode="decimal" autoComplete="off" placeholder="25rb" defaultValue={defaults.amount} />
            </Field>
            <Field label={isTransfer ? tx.from : tx.account}>
              <Select name="accountId" required defaultValue={defaults.accountId}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        {isTransfer ? (
          <>
            <Field label={tx.to}>
              <Select name="toAccountId" required defaultValue={accounts.find((a) => a.id !== defaults.accountId)?.id}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`${tx.fee} (${common.optional})`}>
              <Input name="fee" inputMode="decimal" autoComplete="off" placeholder="2.500" />
              {feeCategory && <input type="hidden" name="feeCategoryId" value={feeCategory.id} />}
            </Field>
          </>
        ) : (
          !transferLeg && (
            <Field label={`${tx.category} (${common.optional})`}>
              <Select name="categoryId" key={kind} defaultValue={kind === defaults.kind ? defaults.categoryId : ""}>
                <option value="">{tx.uncategorized}</option>
                {categories
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )
        )}
        <Field label={tx.date}>
          <Input name="bookedOn" type="date" required defaultValue={defaults.bookedOn} />
        </Field>
        <Field label={isTransfer ? `${tx.description} (${common.optional})` : tx.description} className="sm:col-span-2">
          <Input
            name="description"
            required={!isTransfer}
            maxLength={200}
            placeholder={tx.descriptionPlaceholder}
            defaultValue={defaults.description}
          />
        </Field>
        {!isTransfer && !transferLeg && (
          <Field label={`${tx.payee} (${common.optional})`}>
            <Input name="payee" maxLength={120} defaultValue={defaults.payee} />
          </Field>
        )}
        <Field label={`${tx.note} (${common.optional})`} className={isTransfer || transferLeg ? "sm:col-span-2" : ""}>
          <Input name="note" maxLength={500} defaultValue={defaults.note} />
        </Field>
      </div>
    </ActionForm>
  );
}
