export const THEME_COOKIE = "cos_theme";
export type ThemePreference = "light" | "dark" | "system";

export function parseTheme(value: string | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/** Classe per <html>: nessuna classe = segue il sistema operativo. */
export function themeClass(theme: ThemePreference): string | undefined {
  return theme === "system" ? undefined : theme;
}
