export const THEME_COOKIE = "cos_theme";
export type ThemePreference = "light" | "dark" | "system";

/** Tema predefinito: chiaro (bianco e verde). Scuro e Sistema restano scelte dell'utente. */
export const DEFAULT_THEME: ThemePreference = "light";

export function parseTheme(value: string | undefined): ThemePreference {
  return value === "light" || value === "system" || value === "dark" ? value : DEFAULT_THEME;
}

/** Classe per <html>: "dark", "light" o "system" (segue il sistema operativo). */
export function themeClass(theme: ThemePreference): string {
  return theme;
}
