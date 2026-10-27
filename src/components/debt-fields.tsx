import type { Dictionary } from "@/i18n/dictionaries";
import type { DebtView } from "@/server/domain/debts";
import { Field, Input, Select } from "./ui";

interface DebtFieldsProps {
  t: Dictionary;
  /** Loan and credit card accounts only. */
  loanAccounts: { id: string; name: string }[];
  today: string;
  debt?: DebtView;
}

export function DebtFields({ t, loanAccounts, today, debt }: DebtFieldsProps) {
  const d = t.debts;
  const optional = (label: string) => `${label} (${t.common.optional})`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={d.name}>
        <Input name="name" required maxLength={60} defaultValue={debt?.name} placeholder="Kredit motor" />
      </Field>
      <Field label={d.direction}>
        <Select name="direction" defaultValue={debt?.direction ?? "BORROWED"}>
          {(["BORROWED", "LENT"] as const).map((k) => (
            <option key={k} value={k}>
              {d.directionOption[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={optional(d.counterparty)}>
        <Input name="counterparty" maxLength={80} defaultValue={debt?.counterparty ?? ""} />
      </Field>
      <Field label={d.principal} hint={t.tx.amountHint}>
        <Input name="principal" required inputMode="decimal" defaultValue={debt?.principal.toString()} placeholder="12jt" />
      </Field>
      <Field label={d.instalmentCount} hint={d.instalmentCountHint}>
        <Input name="instalmentCount" type="number" min={1} max={600} required defaultValue={debt?.instalmentCount ?? 1} />
      </Field>
      <Field label={optional(d.instalmentAmount)} hint={d.instalmentAmountHint}>
        <Input name="instalmentAmount" inputMode="decimal" defaultValue={debt?.instalmentAmount.toString() ?? ""} />
      </Field>
      <Field label={d.firstDueOn}>
        <Input name="firstDueOn" type="date" required defaultValue={debt?.firstDueOn ?? today} />
      </Field>
      <Field label={optional(d.annualRate)} hint={d.annualRateHint}>
        <Input name="annualRate" inputMode="decimal" defaultValue={debt?.annualRate?.toString() ?? ""} placeholder="9,5" />
      </Field>
      <Field label={optional(d.account)} hint={d.accountHint} className="sm:col-span-2">
        <Select name="accountId" defaultValue={debt?.accountId ?? ""}>
          <option value="">{t.common.none}</option>
          {loanAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={optional(t.goals.note)} className="sm:col-span-2">
        <Input name="note" maxLength={500} defaultValue={debt?.note ?? ""} />
      </Field>
    </div>
  );
}
