"use client";

import {
  DEFAULT_APPEARANCE,
  FORM_DENSITIES,
  FORM_DENSITY_LABELS,
  FORM_FONT_LABELS,
  FORM_FONTS,
  FORM_HEADER_STYLE_LABELS,
  FORM_HEADER_STYLES,
  isValidLogo,
  MAX_LOGO_CHARS,
  type FormAppearance,
  type FormFont,
} from "@cantiereos/core/forms";
import { AlignCenter, AlignLeft, AlignRight, Check, ImageUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField as Labeled, Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { ACCENT_PRESETS, FONT_STACKS, withDefaults } from "../../document-style";

/**
 * Aspetto del documento: logo, colore, caratteri, intestazione, densità,
 * codice e revisione, piè di pagina. Tutto finisce nella definizione del
 * modello e quindi nelle versioni pubblicate.
 */
export function AppearancePanel({
  value,
  onChange,
}: {
  value: FormAppearance;
  onChange: (v: FormAppearance) => void;
}) {
  const a = withDefaults(value);
  const set = <K extends keyof FormAppearance>(k: K, v: FormAppearance[K] | undefined) => {
    const next = { ...value } as Record<string, unknown>;
    if (v === undefined || v === "") delete next[k];
    else next[k] = v;
    onChange(next as FormAppearance);
  };
  const file = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const loadLogo = async (f: File) => {
    setLogoError(null);
    try {
      const url = await shrinkLogo(f);
      if (!isValidLogo(url)) throw new Error("big");
      set("logo", url);
    } catch {
      setLogoError("Logo non utilizzabile: usa un'immagine PNG, JPEG o WebP più piccola.");
    }
  };

  return (
    <div
      className="space-y-5 rounded-xl border border-border bg-card p-4"
      data-testid="appearance-panel"
    >
      <Group title="Logo">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-16 w-32 place-items-center overflow-hidden rounded-md border border-dashed border-border bg-white">
            {a.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- anteprima del logo (data URL)
              <img src={a.logo} alt="Logo attuale" className="max-h-14 max-w-28 object-contain" />
            ) : (
              <span className="text-[11px] text-neutral-500">Nessun logo</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => file.current?.click()}
            >
              <ImageUp aria-hidden /> {a.logo ? "Cambia" : "Carica logo"}
            </Button>
            {a.logo && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => set("logo", undefined)}
              >
                <Trash2 aria-hidden /> Togli
              </Button>
            )}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-label="File del logo"
            data-testid="logo-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void loadLogo(f);
            }}
          />
        </div>
        {logoError && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {logoError}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Segmented
            label="Posizione del logo"
            value={a.logoPosition}
            options={[
              ["left", "A sinistra", AlignLeft],
              ["center", "Al centro", AlignCenter],
              ["right", "A destra", AlignRight],
            ]}
            onChange={(v) => set("logoPosition", v === "left" ? undefined : v)}
            iconOnly
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={a.showCompany}
              onChange={(e) => set("showCompany", e.target.checked ? undefined : false)}
            />
            Nome dell&apos;azienda nell&apos;intestazione
          </label>
        </div>
      </Group>

      <Group title="Colore">
        <div
          className="flex flex-wrap items-center gap-2"
          role="radiogroup"
          aria-label="Colore principale"
        >
          {ACCENT_PRESETS.map((c) => {
            const on = a.accent.toLowerCase() === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={c.label}
                title={c.label}
                onClick={() =>
                  set("accent", c.value === DEFAULT_APPEARANCE.accent ? undefined : c.value)
                }
                className={cn(
                  "grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110",
                  on && "ring-2 ring-foreground",
                )}
                style={{ background: c.value }}
              >
                {on && <Check className="size-4 text-white" aria-hidden />}
              </button>
            );
          })}
          <label
            className="relative flex h-8 cursor-pointer items-center gap-2 rounded-full border border-border px-2.5 text-xs"
            title="Colore personalizzato"
          >
            <span
              className="size-4 rounded-full ring-1 ring-black/10"
              style={{ background: a.accent }}
            />
            Altro
            <input
              type="color"
              value={a.accent}
              onChange={(e) => set("accent", e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Colore personalizzato"
            />
          </label>
          <code className="text-xs text-muted-foreground">{a.accent}</code>
        </div>
      </Group>

      <Group title="Caratteri">
        <FontPicker
          label="Testo"
          value={a.font}
          onChange={(v) => set("font", v === "system" ? undefined : v)}
        />
        <FontPicker
          label="Titoli"
          value={a.headingFont ?? a.font}
          onChange={(v) => set("headingFont", v === a.font ? undefined : v)}
        />
      </Group>

      <Group title="Impaginazione">
        <div className="space-y-3">
          <Segmented
            label="Intestazioni"
            value={a.header}
            options={FORM_HEADER_STYLES.map((h) => [h, FORM_HEADER_STYLE_LABELS[h]] as const)}
            onChange={(v) => set("header", v === DEFAULT_APPEARANCE.header ? undefined : v)}
          />
          <Segmented
            label="Densità"
            value={a.density}
            options={FORM_DENSITIES.map((d) => [d, FORM_DENSITY_LABELS[d]] as const)}
            onChange={(v) => set("density", v === "normal" ? undefined : v)}
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={a.numbered}
              onChange={(e) => set("numbered", e.target.checked ? undefined : false)}
            />
            Numera le sezioni
          </label>
        </div>
      </Group>

      <Group title="Dati del documento">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled id="ap-code" label="Codice del modulo">
            <Input
              id="ap-code"
              value={value.code ?? ""}
              maxLength={40}
              placeholder="es. MOD-07"
              onChange={(e) => set("code", e.target.value)}
            />
          </Labeled>
          <Labeled id="ap-rev" label="Revisione">
            <Input
              id="ap-rev"
              value={value.revision ?? ""}
              maxLength={20}
              placeholder="es. 02 del 17/11/2026"
              onChange={(e) => set("revision", e.target.value)}
            />
          </Labeled>
          <div className="sm:col-span-2">
            <Labeled id="ap-footer" label="Piè di pagina">
              <Textarea
                id="ap-footer"
                className="min-h-16"
                value={value.footer ?? ""}
                maxLength={300}
                placeholder="es. ragione sociale, sede, P. IVA, contatti"
                onChange={(e) => set("footer", e.target.value)}
              />
            </Labeled>
          </div>
        </div>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  iconOnly = false,
}: {
  label: string;
  value: T;
  options: readonly (
    readonly [T, string] | readonly [T, string, React.ComponentType<{ className?: string }>]
  )[];
  onChange: (v: T) => void;
  iconOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">{label}</span>
      <div
        className="flex gap-0.5 rounded-lg border border-border p-0.5"
        role="radiogroup"
        aria-label={label}
      >
        {options.map(([v, l, Icon]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={iconOnly ? l : undefined}
            title={l}
            onClick={() => onChange(v)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
              value === v ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {!iconOnly && l}
          </button>
        ))}
      </div>
    </div>
  );
}

function FontPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FormFont;
  onChange: (v: FormFont) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm">{label}</p>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        role="radiogroup"
        aria-label={`Carattere: ${label}`}
      >
        {FORM_FONTS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={value === f}
            onClick={() => onChange(f)}
            className={cn(
              "cos-lift rounded-lg border px-2.5 py-2 text-left transition-colors",
              value === f ? "border-primary bg-primary/8" : "border-border",
            )}
          >
            <span className="block text-lg leading-tight" style={{ fontFamily: FONT_STACKS[f] }}>
              Aa Àè 123
            </span>
            <span className="block text-[11px] text-muted-foreground">{FORM_FONT_LABELS[f]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Riduce il logo (lato lungo 480 px). PNG se resta piccolo (trasparenza), altrimenti JPEG su bianco. */
async function shrinkLogo(f: File): Promise<string> {
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const png = c.toDataURL("image/png");
  if (png.length <= MAX_LOGO_CHARS) return png;
  const flat = document.createElement("canvas");
  flat.width = w;
  flat.height = h;
  const fctx = flat.getContext("2d")!;
  fctx.fillStyle = "#ffffff";
  fctx.fillRect(0, 0, w, h);
  fctx.drawImage(c, 0, 0);
  for (const q of [0.9, 0.8, 0.65]) {
    const jpg = flat.toDataURL("image/jpeg", q);
    if (jpg.length <= MAX_LOGO_CHARS) return jpg;
  }
  throw new Error("big");
}
