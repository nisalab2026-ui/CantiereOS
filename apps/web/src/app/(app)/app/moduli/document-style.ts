import "@fontsource-variable/inter/index.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource-variable/roboto-condensed/index.css";
import "@fontsource-variable/source-serif-4/index.css";
import "@fontsource-variable/lora/index.css";
import {
  DEFAULT_APPEARANCE,
  type FormAppearance,
  type FormDefinition,
  type FormFont,
} from "@cantiereos/core/forms";

/**
 * Aspetto dei documenti (moduli): caratteri inclusi nell'app (nessuna
 * richiesta a servizi esterni di font), colore principale e densità.
 */
export const FONT_STACKS: Record<FormFont, string> = {
  system: "var(--font-sans)",
  inter: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
  plex: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
  condensed: "'Roboto Condensed Variable', 'Arial Narrow', sans-serif",
  serif: "'Source Serif 4 Variable', Georgia, 'Times New Roman', serif",
  lora: "'Lora Variable', Georgia, serif",
};

/** Colori di partenza: sobri e leggibili in stampa. */
export const ACCENT_PRESETS = [
  { value: "#1d4ed8", label: "Blu" },
  { value: "#0f766e", label: "Verde petrolio" },
  { value: "#15803d", label: "Verde" },
  { value: "#b45309", label: "Ambra" },
  { value: "#c2410c", label: "Arancio cantiere" },
  { value: "#b91c1c", label: "Rosso" },
  { value: "#6d28d9", label: "Viola" },
  { value: "#0f172a", label: "Antracite" },
] as const;

export type ResolvedAppearance = typeof DEFAULT_APPEARANCE &
  Omit<FormAppearance, keyof typeof DEFAULT_APPEARANCE>;

export function resolveAppearance(def: FormDefinition): ResolvedAppearance {
  return withDefaults(def.appearance ?? {});
}

/** Valori impostati sopra i predefiniti (le chiavi vuote non contano). */
export function withDefaults(a: FormAppearance): ResolvedAppearance {
  const out: Record<string, unknown> = { ...DEFAULT_APPEARANCE };
  for (const [k, v] of Object.entries(a)) if (v !== undefined && v !== "") out[k] = v;
  return out as unknown as ResolvedAppearance;
}

/** Testo bianco o scuro sopra il colore scelto, per restare leggibile. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  return l > 0.4 ? "#0f172a" : "#ffffff";
}
