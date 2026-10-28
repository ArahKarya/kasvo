import type { ComponentProps, ReactNode } from "react";

/** Shared form styling. Controls keep a small radius (no pills); cards use rounded-xl. */
export const inputClass =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

export const buttonClass = {
  primary: "rounded-sm bg-accent px-3 py-2 text-sm font-semibold text-accent-text disabled:opacity-60",
  secondary: "rounded-sm border border-border bg-surface px-3 py-2 text-sm hover:bg-border/40 disabled:opacity-60",
  danger: "rounded-sm border border-danger/40 px-3 py-2 text-sm text-danger hover:bg-danger/5",
  ghost: "rounded-sm px-2 py-1 text-sm text-muted hover:bg-border/40 hover:text-text",
} as const;

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, children, className = "" }: FieldProps) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-border bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {actions}
    </div>
  );
}

interface AmountProps {
  value: string;
  /** Sign of the underlying amount; decides the colour. */
  sign: number;
  muted?: boolean;
}

export function Amount({ value, sign, muted }: AmountProps) {
  const color = muted ? "text-muted" : sign > 0 ? "text-income" : sign < 0 ? "text-expense" : "";
  return <span className={`num whitespace-nowrap font-medium ${color}`}>{value}</span>;
}
