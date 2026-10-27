"use client";

import { useActionState } from "react";
import { createTokenAction } from "@/app/actions/settings";
import type { Dictionary } from "@/i18n/dictionaries";
import { buttonClass, Field, Input, Select } from "./ui";

export function TokenForm({ t }: { t: Dictionary["settings"] }) {
  const [state, action, pending] = useActionState(createTokenAction, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.tokenName}>
          <Input name="name" required maxLength={60} placeholder={t.tokenNamePlaceholder} />
        </Field>
        <Field label={t.expiry}>
          <Select name="expiry" defaultValue="90">
            <option value="30">{t.expiry30}</option>
            <option value="90">{t.expiry90}</option>
            <option value="365">{t.expiry365}</option>
            <option value="never">{t.expiryNever}</option>
          </Select>
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">{t.access}</legend>
        {(
          [
            ["read", t.accessRead],
            ["write", t.accessWrite],
            ["destructive", t.accessDestructive],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input type="radio" name="access" value={value} defaultChecked={value === "write"} className="accent-[var(--accent)]" />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={buttonClass.primary}>
          {t.create}
        </button>
        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </div>
      {state.token && (
        <div role="status" className="space-y-2 rounded-sm border border-accent/50 bg-accent/5 p-3">
          <p className="text-sm font-medium">{t.created}</p>
          <code className="block select-all break-all rounded-sm bg-bg px-2 py-1.5 font-mono text-sm">{state.token}</code>
        </div>
      )}
    </form>
  );
}
