import type { Dictionary } from "@/i18n/dictionaries";
import { ASSET_KINDS, type AssetView } from "@/server/domain/assets";
import { Field, Input, Select } from "./ui";

interface AssetFieldsProps {
  t: Dictionary;
  asset?: AssetView;
  /** Only when creating: today's value as the first valuation. */
  withCurrentValue?: boolean;
}

export function AssetFields({ t, asset, withCurrentValue = false }: AssetFieldsProps) {
  const a = t.assets;
  const optional = (label: string) => `${label} (${t.common.optional})`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={a.name}>
        <Input name="name" required maxLength={60} defaultValue={asset?.name} placeholder="Emas Antam" />
      </Field>
      <Field label={a.kind}>
        <Select name="kind" defaultValue={asset?.kind ?? "GOLD"}>
          {ASSET_KINDS.map((k) => (
            <option key={k} value={k}>
              {a.kinds[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={optional(a.purchaseValue)} hint={t.tx.amountHint}>
        <Input name="purchaseValue" inputMode="decimal" defaultValue={asset?.purchaseValue?.toString() ?? ""} placeholder="15jt" />
      </Field>
      <Field label={optional(a.purchasedOn)}>
        <Input name="purchasedOn" type="date" defaultValue={asset?.purchasedOn ?? ""} />
      </Field>
      <Field label={optional(a.units)} hint={a.unitsHint}>
        <Input name="units" inputMode="decimal" defaultValue={asset?.units ?? ""} placeholder="10,5" />
      </Field>
      {withCurrentValue && (
        <Field label={optional(a.currentValue)} hint={a.currentValueHint}>
          <Input name="currentValue" inputMode="decimal" />
        </Field>
      )}
      <Field label={optional(a.note)} className="sm:col-span-2">
        <Input name="note" maxLength={500} defaultValue={asset?.note ?? ""} />
      </Field>
    </div>
  );
}
