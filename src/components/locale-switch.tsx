import { setLocaleAction } from "@/app/actions/auth";
import { LOCALES, type Dictionary, type Locale } from "@/i18n/dictionaries";

interface LocaleSwitchProps {
  locale: Locale;
  t: Dictionary;
}

/** Two plain buttons; works without JavaScript. */
export function LocaleSwitch({ locale, t }: LocaleSwitchProps) {
  return (
    <form action={setLocaleAction} className="flex items-center gap-1 text-xs" aria-label={t.locale.label}>
      {LOCALES.map((l) => (
        <button
          key={l}
          name="locale"
          value={l}
          aria-pressed={l === locale}
          className="rounded-sm border border-border px-2 py-1 text-muted aria-pressed:border-accent aria-pressed:text-text"
        >
          {l.toUpperCase()}
        </button>
      ))}
    </form>
  );
}
