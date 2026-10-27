/**
 * UI strings, one module per area under ./messages. Each module exports `en` and an `id`
 * typed against it, so a missing translation fails the type check in that file.
 */

import * as core from "./messages/core";
import * as ledger from "./messages/ledger";

const en = { ...core.en, ...ledger.en };
const id: typeof en = { ...core.id, ...ledger.id };

export type Dictionary = typeof en;

export const dictionaries = { id, en } as const;
export type Locale = keyof typeof dictionaries;
export const LOCALES: readonly Locale[] = ["id", "en"];
export const isLocale = (v: unknown): v is Locale => v === "id" || v === "en";

/** "{name}" style interpolation. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}

/** Intl locale for numbers and dates. Rupiah formatting stays Indonesian-style in English too. */
export const intlLocale = (locale: Locale): string => (locale === "id" ? "id-ID" : "en-ID");
