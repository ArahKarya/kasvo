"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "@/app/actions/auth";

interface Field {
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
  minLength?: number;
}

interface AuthFormProps {
  action: (state: AuthFormState, form: FormData) => Promise<AuthFormState>;
  fields: Field[];
  submit: string;
  switchText: string;
  switchLabel: string;
  switchHref: string;
}

export function AuthForm({ action, fields, submit, switchText, switchLabel, switchHref }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {fields.map((f) => (
        <label key={f.name} className="block space-y-1.5">
          <span className="text-sm font-medium">{f.label}</span>
          <input
            name={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            minLength={f.minLength}
            required
            className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {f.hint && <span className="block text-xs text-muted">{f.hint}</span>}
        </label>
      ))}
      {state.error && (
        <p role="alert" className="rounded-sm border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-sm bg-accent px-3 py-2 text-sm font-semibold text-accent-text disabled:opacity-60"
      >
        {submit}
      </button>
      <p className="text-center text-sm text-muted">
        {switchText}{" "}
        <Link href={switchHref} className="font-medium text-accent underline-offset-2 hover:underline">
          {switchLabel}
        </Link>
      </p>
    </form>
  );
}
