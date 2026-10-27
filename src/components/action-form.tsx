"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { FormState } from "@/app/actions/ledger";
import { buttonClass } from "./ui";

interface ActionFormProps {
  action: (state: FormState & { message?: string }, form: FormData) => Promise<FormState & { message?: string }>;
  submit: string;
  /** Shown after a successful submit. */
  success?: string;
  /** Clear the inputs after success; off for edit forms. */
  resetOnSuccess?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A form bound to a server action, with an error line and an optional success note.
 * Submitting goes through onSubmit so React does not clear the inputs (a chosen file, a
 * half-filled form) when the action returns an error; `resetOnSuccess` clears them on success.
 * Without JavaScript the plain form action still works.
 */
export function ActionForm({ action, submit, success, resetOnSuccess = false, className = "", children }: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state.version, state.ok, resetOnSuccess]);

  const submitKeepingInputs = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };

  return (
    <form ref={ref} action={formAction} onSubmit={submitKeepingInputs} className={className}>
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={pending} className={buttonClass.primary}>
          {submit}
        </button>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.ok && (state.message ?? success) && !pending && (
          <p role="status" className="text-sm text-income">
            {state.message ?? success}
          </p>
        )}
      </div>
    </form>
  );
}
