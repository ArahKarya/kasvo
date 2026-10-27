import { ACCOUNT_TYPES, type AccountWithBalance } from "@/server/domain/accounts";
import { toDay } from "@/server/domain/dates";
import type { Dictionary } from "@/i18n/dictionaries";
import { Field, Input, Select } from "./ui";

interface AccountFieldsProps {
  t: Dictionary;
  today: string;
  account?: AccountWithBalance;
}

/** Inputs shared by the add and edit account forms. */
export function AccountFields({ t, today, account }: AccountFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.accounts.name}>
        <Input name="name" required maxLength={60} placeholder={t.accounts.namePlaceholder} defaultValue={account?.name} />
      </Field>
      <Field label={t.accounts.type}>
        <Select name="type" defaultValue={account?.type ?? "BANK"}>
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t.accountType[type]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={`${t.accounts.institution} (${t.common.optional})`}>
        <Input name="institution" maxLength={60} placeholder={t.accounts.institutionPlaceholder} defaultValue={account?.institution ?? ""} />
      </Field>
      <Field label={t.accounts.openingDate}>
        <Input name="openingDate" type="date" required defaultValue={account ? toDay(account.openingDate) : today} />
      </Field>
      <Field label={t.accounts.openingBalance} hint={t.accounts.openingBalanceHint} className="sm:col-span-2">
        <Input name="openingBalance" inputMode="decimal" placeholder="0" defaultValue={account ? account.openingBalance.toString() : ""} />
      </Field>
    </div>
  );
}
