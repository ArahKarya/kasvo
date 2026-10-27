import type { Dictionary } from "@/i18n/dictionaries";
import { Field, Input, Select } from "./ui";

interface GoalFieldsProps {
  t: Dictionary;
  accounts: { id: string; name: string }[];
  goal?: { name: string; targetAmount: bigint; targetDate: string | null; accountId: string | null; note: string | null };
}

export function GoalFields({ t, accounts, goal }: GoalFieldsProps) {
  const g = t.goals;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={g.name}>
        <Input name="name" required maxLength={60} defaultValue={goal?.name} placeholder="Dana darurat" />
      </Field>
      <Field label={g.target} hint={t.tx.amountHint}>
        <Input name="targetAmount" required inputMode="decimal" defaultValue={goal?.targetAmount.toString()} placeholder="25jt" />
      </Field>
      <Field label={`${g.targetDate} (${t.common.optional})`}>
        <Input name="targetDate" type="date" defaultValue={goal?.targetDate ?? ""} />
      </Field>
      <Field label={g.account} hint={g.accountHint}>
        <Select name="accountId" defaultValue={goal?.accountId ?? ""}>
          <option value="">{g.manual}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={`${g.note} (${t.common.optional})`} className="sm:col-span-2">
        <Input name="note" maxLength={500} defaultValue={goal?.note ?? ""} />
      </Field>
    </div>
  );
}
