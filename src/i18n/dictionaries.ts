/**
 * UI strings, one module per area under ./messages. Each module exports `en` and an `id`
 * typed against it, so a missing translation fails the type check in that file.
 */

import * as core from "./messages/core";
import * as ledger from "./messages/ledger";
import * as settings from "./messages/settings";
import * as imports from "./messages/imports";
import * as insights from "./messages/insights";
import * as plans from "./messages/plans";

const en = { ...core.en, ...ledger.en, ...settings.en, ...imports.en, ...insights.en, ...plans.en };
const id: typeof en = { ...core.id, ...ledger.id, ...settings.id, ...imports.id, ...insights.id, ...plans.id };

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

/** "2026-10-27" → "27 Okt 2026" in the given Intl locale. */
export const formatDay = (day: string, il: string): string =>
  new Intl.DateTimeFormat(il, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
