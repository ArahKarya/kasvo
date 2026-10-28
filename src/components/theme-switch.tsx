"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_COOKIE, type ThemeChoice } from "./amounts-cookie";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const read = (): ThemeChoice => {
  const v = document.documentElement.getAttribute("data-theme");
  return v === "light" || v === "dark" ? v : "system";
};

/** Applies the choice now and remembers it for server-rendered pages. */
function apply(next: ThemeChoice): void {
  if (next === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", next);
  document.cookie = `${THEME_COOKIE}=${next === "system" ? "" : next}; path=/; max-age=${next === "system" ? 0 : 31536000}; samesite=lax`;
}

interface ThemeSwitchProps {
  initial: ThemeChoice;
  labels: { label: string; light: string; dark: string; system: string };
  /** Icons only, for the narrow sidebar. */
  compact?: boolean;
}

/** Light / dark / follow the system, as three small square buttons. */
export function ThemeSwitch({ initial, labels, compact = false }: ThemeSwitchProps) {
  const theme = useSyncExternalStore(subscribe, read, () => initial);
  const options = [
    { value: "light", label: labels.light, Icon: Sun },
    { value: "dark", label: labels.dark, Icon: Moon },
    { value: "system", label: labels.system, Icon: Monitor },
  ] as const;
  return (
    <div role="radiogroup" aria-label={labels.label} className="inline-flex rounded-sm border border-border p-0.5">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => apply(value)}
          className="inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs text-muted hover:text-text aria-checked:bg-accent-soft aria-checked:font-semibold aria-checked:text-accent"
        >
          <Icon size={14} aria-hidden="true" />
          <span className={compact ? "sr-only" : ""}>{label}</span>
        </button>
      ))}
    </div>
  );
}
