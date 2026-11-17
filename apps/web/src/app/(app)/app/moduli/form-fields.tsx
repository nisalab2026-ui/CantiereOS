"use client";

import type {
  ChecklistValue,
  FormDefinition,
  FormField,
  FormValue,
  FormValues,
  SignatureValue,
  YesNoValue,
} from "@cantiereos/core/forms";
import { Eraser, PenLine, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/**
 * Campi di un modulo, compilabili da telefono e da PC. Usato dalla
 * compilazione e dall'anteprima dell'editor. Le scelte sono pulsanti grandi
 * (radio/checkbox veri, quindi accessibili da tastiera e lettori di schermo).
 */
export function FormFields({
  definition,
  values,
  onChange,
  errors = {},
  idPrefix = "f",
}: {
  definition: FormDefinition;
  values: FormValues;
  onChange: (id: string, value: FormValue) => void;
  errors?: Record<string, string>;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-6">
      {definition.sections.map((s, i) => (
        <section
          key={s.id}
          aria-labelledby={`${idPrefix}-sec-${s.id}`}
          className="cos-enter rounded-lg border border-border bg-card/60 p-4 sm:p-5"
          style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
        >
          <header className="mb-4">
            <h2 id={`${idPrefix}-sec-${s.id}`} className="text-base font-semibold">
              <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}.</span>
              {s.title}
            </h2>
            {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
          </header>
          {s.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun campo in questa sezione.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {s.fields.map((f) => (
                <div key={f.id} className={wide(f) ? "sm:col-span-2" : undefined}>
                  <Field
                    field={f}
                    id={`${idPrefix}-${f.id}`}
                    value={values[f.id]}
                    error={errors[f.id]}
                    onChange={(v) => onChange(f.id, v)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

const wide = (f: FormField) =>
  f.type === "textarea" ||
  f.type === "checklist" ||
  f.type === "signature" ||
  (f.type === "choice" && f.options.length > 3) ||
  (f.type === "yes_no" && f.withNote);

function Label({
  field,
  htmlFor,
  as = "label",
}: {
  field: FormField;
  htmlFor?: string;
  as?: "label" | "legend";
}) {
  const Tag = as;
  return (
    <Tag {...(htmlFor ? { htmlFor } : {})} className="mb-1.5 block text-sm font-medium">
      {field.label}
      {field.required && (
        <span className="text-danger" aria-hidden>
          {" "}
          *
        </span>
      )}
    </Tag>
  );
}

function Help({ id, field, error }: { id: string; field: FormField; error?: string | undefined }) {
  return (
    <>
      {field.help && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {field.help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </>
  );
}

const describedBy = (id: string, field: FormField, error?: string) =>
  error ? `${id}-error` : field.help ? `${id}-hint` : undefined;

function Field({
  field,
  id,
  value,
  error,
  onChange,
}: {
  field: FormField;
  id: string;
  value: FormValue | undefined;
  error?: string | undefined;
  onChange: (v: FormValue) => void;
}) {
  const aria = {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy(id, field, error),
  } as const;
  switch (field.type) {
    case "auto":
      return (
        <div>
          <Label field={field} htmlFor={id} />
          <output
            id={id}
            className="flex min-h-9 items-center gap-2 rounded-sm border border-dashed border-border bg-accent/40 px-3 py-1.5 text-sm"
          >
            <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
            {typeof value === "string" && value ? (
              value
            ) : (
              <span className="text-muted-foreground">Si compila da solo al salvataggio</span>
            )}
          </output>
        </div>
      );
    case "text":
    case "date":
    case "number":
      return (
        <div>
          <Label field={field} htmlFor={id} />
          <div className="flex items-center gap-2">
            <Input
              id={id}
              type={field.type === "date" ? "date" : "text"}
              inputMode={field.type === "number" ? "decimal" : undefined}
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.type === "text" ? field.placeholder : undefined}
              autoComplete="off"
              maxLength={field.type === "text" ? 300 : undefined}
              {...aria}
            />
            {field.type === "number" && field.unit && (
              <span className="text-sm text-muted-foreground">{field.unit}</span>
            )}
          </div>
          <Help id={id} field={field} error={error} />
        </div>
      );
    case "textarea":
      return (
        <div>
          <Label field={field} htmlFor={id} />
          <Textarea
            id={id}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            maxLength={4000}
            {...aria}
          />
          <Help id={id} field={field} error={error} />
        </div>
      );
    case "yes_no": {
      const v = (value as YesNoValue | undefined) ?? { value: null };
      return (
        <fieldset {...aria}>
          <Label field={field} as="legend" />
          <div className="flex flex-wrap items-center gap-2">
            <Pills
              name={id}
              options={["Sì", "No"]}
              selected={v.value === "yes" ? ["Sì"] : v.value === "no" ? ["No"] : []}
              onToggle={(o) => {
                const next = o === "Sì" ? "yes" : "no";
                onChange({ ...v, value: v.value === next ? null : next });
              }}
            />
            {field.withNote && (
              <Input
                aria-label={`Nota: ${field.label}`}
                className="min-w-40 flex-1"
                value={v.note ?? ""}
                maxLength={500}
                placeholder="Nota"
                onChange={(e) => onChange({ ...v, note: e.target.value })}
              />
            )}
          </div>
          <Help id={id} field={field} error={error} />
        </fieldset>
      );
    }
    case "choice": {
      const selected = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      return (
        <fieldset {...aria}>
          <Label field={field} as="legend" />
          {field.multiple && (
            <p className="-mt-1 mb-1.5 text-xs text-muted-foreground">
              Puoi sceglierne più di una.
            </p>
          )}
          <Pills
            name={id}
            {...(field.multiple ? {} : { label: field.label })}
            multiple={field.multiple ?? false}
            options={field.options}
            selected={selected}
            onToggle={(o) => {
              if (field.multiple) {
                const next = selected.includes(o)
                  ? selected.filter((x) => x !== o)
                  : [...selected, o];
                onChange(field.options.filter((x) => next.includes(x)));
              } else onChange(selected[0] === o ? null : o);
            }}
          />
          <Help id={id} field={field} error={error} />
        </fieldset>
      );
    }
    case "checklist": {
      const rows = (value as ChecklistValue | undefined)?.rows ?? [];
      const set = (i: number, patch: Partial<ChecklistValue["rows"][number]>) => {
        const next = field.rows.map((_, j) => rows[j] ?? { value: null });
        next[i] = { ...next[i]!, ...patch };
        onChange({ rows: next });
      };
      const done = field.rows.filter((_, i) => rows[i]?.value).length;
      return (
        <fieldset {...aria}>
          <div className="flex items-baseline justify-between gap-2">
            <Label field={field} as="legend" />
            <span className="text-xs text-muted-foreground tabular-nums">
              {done}/{field.rows.length}
            </span>
          </div>
          <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {field.rows.map((row, i) => (
              <li
                key={i}
                className={cn(
                  "flex flex-col gap-2 p-3 transition-colors md:flex-row md:items-center",
                  rows[i]?.value && "bg-accent/30",
                )}
              >
                <span className="flex-1 text-sm">{row}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Pills
                    name={`${id}-${i}`}
                    label={row}
                    options={field.options}
                    selected={rows[i]?.value ? [rows[i]!.value!] : []}
                    onToggle={(o) => set(i, { value: rows[i]?.value === o ? null : o })}
                    compact
                  />
                  {field.withNote && (
                    <Input
                      aria-label={`Nota: ${row}`}
                      className="h-8 w-full md:w-44"
                      value={rows[i]?.note ?? ""}
                      maxLength={500}
                      placeholder="Nota"
                      onChange={(e) => set(i, { note: e.target.value })}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
          <Help id={id} field={field} error={error} />
        </fieldset>
      );
    }
    case "signature":
      return (
        <div>
          <Label field={field} htmlFor={`${id}-name`} />
          <SignaturePad
            id={id}
            value={(value as SignatureValue | undefined) ?? null}
            onChange={onChange}
            invalid={Boolean(error)}
          />
          <Help id={id} field={field} error={error} />
        </div>
      );
  }
}

/** Scelte come pulsanti: radio o checkbox nativi nascosti, etichetta cliccabile grande. */
function Pills({
  name,
  label,
  options,
  selected,
  onToggle,
  multiple = false,
  compact = false,
}: {
  name: string;
  label?: string;
  options: string[];
  selected: string[];
  onToggle: (o: string) => void;
  multiple?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={label}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((o) => {
        const on = selected.includes(o);
        const negative = /^(no|negativo|non idoneo)/i.test(o);
        return (
          <label
            key={o}
            className={cn(
              "cos-pill relative cursor-pointer select-none rounded-full border px-3 text-sm transition-all duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              compact ? "py-1" : "py-1.5",
              on
                ? negative
                  ? "border-danger/60 bg-danger/15 font-medium text-danger"
                  : "border-primary/60 bg-primary/15 font-medium text-primary"
                : "border-border bg-card text-foreground hover:border-primary/40",
            )}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={o}
              checked={on}
              onChange={() => onToggle(o)}
              onClick={(e) => {
                // un radio già scelto si può togliere con un secondo clic
                if (!multiple && on) {
                  e.preventDefault();
                  onToggle(o);
                }
              }}
              className="sr-only"
            />
            {o}
          </label>
        );
      })}
    </div>
  );
}

/** Firma a mano sul dispositivo (dito, penna o mouse), salvata come PNG nel modulo. */
function SignaturePad({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: SignatureValue | null;
  onChange: (v: FormValue) => void;
  invalid: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState(value?.name ?? "");

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * e.currentTarget.width,
      y: ((e.clientY - r.top) / r.height) * e.currentTarget.height,
    };
  };

  if (value?.image && !dirty) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-border bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL della firma */}
          <img
            src={value.image}
            alt={`Firma${value.name ? ` di ${value.name}` : ""}`}
            className="mx-auto h-24 object-contain"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {value.name ? `${value.name} · ` : ""}
            {new Date(value.signedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={() => onChange(null)}>
            <Eraser aria-hidden /> Rifai la firma
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        id={id}
        width={600}
        height={200}
        role="img"
        aria-label="Area per la firma: disegna con il dito, la penna o il mouse"
        className={cn(
          "h-32 w-full touch-none rounded-md border bg-white",
          invalid ? "border-danger" : "border-border",
        )}
        onPointerDown={(e) => {
          const ctx = e.currentTarget.getContext("2d");
          if (!ctx) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d");
          if (!ctx) return;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          setDirty(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${id}-name`}
          className="min-w-40 flex-1"
          placeholder="Nome di chi firma"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            const c = canvas.current;
            c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
            setDirty(false);
          }}
        >
          <Eraser aria-hidden /> Cancella
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!dirty}
          onClick={() => {
            const c = canvas.current;
            if (!c) return;
            onChange({
              image: c.toDataURL("image/png"),
              name: name.trim(),
              signedAt: new Date().toISOString(),
            });
            setDirty(false);
          }}
        >
          <PenLine aria-hidden /> Conferma firma
        </Button>
      </div>
    </div>
  );
}
