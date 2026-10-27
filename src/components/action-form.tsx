"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { FormState } from "@/app/actions/ledger";
import { buttonClass } from "./ui";

interface ActionFormProps {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submit: string;
  /** Shown after a successful submit. */
  success?: string;
  /** Clear the inputs after success; off for edit forms. */
  resetOnSuccess?: boolean;
  className?: string;
  children: ReactNode;
}

/** A form bound to a server action, with an error line and an optional success note. */
export function ActionForm({ action, submit, success, resetOnSuccess = false, className = "", children }: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state.version, state.ok, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
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
        {state.ok && success && !pending && (
          <p role="status" className="text-sm text-income">
            {success}
          </p>
        )}
      </div>
    </form>
  );
}
