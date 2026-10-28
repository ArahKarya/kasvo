/** Cookie set by the hide-amounts eye; the root layout reads it so pages render already hidden. */
export const HIDE_AMOUNTS_COOKIE = "kasvo_hide_amounts";

/** "light" | "dark"; absent means follow the system. Read by the root layout into data-theme. */
export const THEME_COOKIE = "kasvo_theme";
export type ThemeChoice = "light" | "dark" | "system";
