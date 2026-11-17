"use client";

import {
  FORM_AUTO_SOURCE_LABELS,
  FORM_AUTO_SOURCES,
  FORM_CATEGORIES,
  FORM_CATEGORY_LABELS,
  FORM_FIELD_TYPE_LABELS,
  FORM_FIELD_TYPES,
  parseFormDefinition,
  type FormAutoSource,
  type FormDefinition,
  type FormField,
  type FormFieldType,
  type FormSection,
  type FormValue,
  type FormValues,
} from "@cantiereos/core/forms";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Eye,
  Pencil,
  Plus,
  Rocket,
  Save,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField as Labeled, Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { publishTemplateAction, saveTemplateDraftAction } from "../../actions";
import { FormFields } from "../../form-fields";

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

function blankField(type: FormFieldType, label = "Nuovo campo"): FormField {
  const id = newId("c");
  switch (type) {
    case "choice":
      return { id, type, label, options: ["Opzione 1", "Opzione 2"] };
    case "checklist":
      return {
        id,
        type,
        label,
        rows: ["Primo controllo"],
        options: ["Positivo", "Negativo"],
        withNote: true,
      };
    case "auto":
      return { id, type, label: "Cliente", source: "customer.name" };
    default:
      return { id, type, label } as FormField;
  }
}

/** Cambio di tipo: conserva etichetta, aiuto e obbligatorietà. */
function retype(f: FormField, type: FormFieldType): FormField {
  const next = blankField(type, f.label);
  return {
    ...next,
    id: f.id,
    ...(f.help ? { help: f.help } : {}),
    ...(f.required ? { required: true } : {}),
  };
}

/** Prima di salvare: righe e opzioni vuote (lasciate mentre si scrive) spariscono. */
function clean(def: FormDefinition): FormDefinition {
  return {
    sections: def.sections.map((s) => ({
      ...s,
      fields: s.fields.map((f) =>
        f.type === "choice"
          ? { ...f, options: f.options.map((o) => o.trim()).filter(Boolean) }
          : f.type === "checklist"
            ? {
                ...f,
                options: f.options.map((o) => o.trim()).filter(Boolean),
                rows: f.rows.map((r) => r.trim()).filter(Boolean),
              }
            : f,
      ),
    })),
  };
}

export function TemplateEditor({
  id,
  version,
  initial,
  published,
}: {
  id: string;
  version: string;
  initial: { name: string; description: string; category: string; definition: FormDefinition };
  published: boolean;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState({
    name: initial.name,
    description: initial.description,
    category: initial.category,
  });
  const [def, setDef] = useState<FormDefinition>(initial.definition);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [preview, setPreview] = useState<FormValues>({});
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();

  const check = useMemo(() => parseFormDefinition(clean(def)), [def]);
  const fieldCount = def.sections.reduce((n, s) => n + s.fields.length, 0);

  const change = (next: FormDefinition) => {
    setDef(next);
    setDirty(true);
    setMsg({});
  };
  const updateSection = (si: number, patch: Partial<FormSection>) =>
    change({ sections: def.sections.map((s, i) => (i === si ? { ...s, ...patch } : s)) });
  const updateField = (si: number, fi: number, f: FormField) =>
    updateSection(si, { fields: def.sections[si]!.fields.map((x, i) => (i === fi ? f : x)) });
  const move = <T,>(arr: T[], i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  };

  const save = (thenPublish: boolean) =>
    start(async () => {
      setMsg({});
      if (!check.ok) {
        setMsg({ error: check.error });
        return;
      }
      if (dirty) {
        const r = await saveTemplateDraftAction(id, version, { ...meta, definition: clean(def) });
        if (r.error) {
          setMsg({ error: r.fieldErrors?.name ?? r.error });
          return;
        }
        setDirty(false);
      }
      if (thenPublish) {
        const p = await publishTemplateAction(id);
        if (p.error) {
          setMsg({ error: p.error });
          router.refresh();
          return;
        }
        setMsg({ ok: p.message ?? "Pubblicato." });
      } else setMsg({ ok: "Bozza salvata." });
      router.refresh();
    });

  return (
    <div className="space-y-4 pb-24">
      <section className="grid gap-4 rounded-lg border border-border bg-card/60 p-4 sm:grid-cols-[2fr_1fr] sm:p-5">
        <Labeled id="te-name" label="Nome del modello" required>
          <Input
            id="te-name"
            value={meta.name}
            maxLength={200}
            onChange={(e) => {
              setMeta({ ...meta, name: e.target.value });
              setDirty(true);
            }}
          />
        </Labeled>
        <Labeled id="te-category" label="Categoria" required>
          <Select
            id="te-category"
            value={meta.category}
            onChange={(e) => {
              setMeta({ ...meta, category: e.target.value });
              setDirty(true);
            }}
          >
            {FORM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {FORM_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Labeled>
        <div className="sm:col-span-2">
          <Labeled id="te-description" label="Descrizione">
            <Textarea
              id="te-description"
              className="min-h-16"
              value={meta.description}
              maxLength={2000}
              onChange={(e) => {
                setMeta({ ...meta, description: e.target.value });
                setDirty(true);
              }}
            />
          </Labeled>
        </div>
      </section>

      {/* su telefono: modifica o anteprima; su schermi larghi affiancate */}
      <div className="flex gap-1 rounded-md border border-border p-0.5 xl:hidden" role="tablist">
        {(
          [
            ["edit", "Modifica", Pencil],
            ["preview", "Anteprima", Eye],
          ] as const
        ).map(([v, l, Icon]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-sm py-1.5 text-sm transition-colors",
              view === v ? "bg-accent font-medium" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden /> {l}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div
          className={cn("space-y-4", view === "preview" && "hidden xl:block")}
          data-testid="editor"
        >
          {def.sections.map((s, si) => (
            <section key={s.id} className="cos-enter rounded-lg border border-border bg-card/60">
              <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <span className="text-sm text-muted-foreground tabular-nums">{si + 1}.</span>
                <Input
                  aria-label={`Titolo della sezione ${si + 1}`}
                  className="h-8 min-w-40 flex-1 font-medium"
                  value={s.title}
                  maxLength={200}
                  onChange={(e) => updateSection(si, { title: e.target.value })}
                />
                <IconButton
                  label="Sposta su"
                  onClick={() => change({ sections: move(def.sections, si, -1) })}
                  disabled={si === 0}
                >
                  <ArrowUp />
                </IconButton>
                <IconButton
                  label="Sposta giù"
                  onClick={() => change({ sections: move(def.sections, si, 1) })}
                  disabled={si === def.sections.length - 1}
                >
                  <ArrowDown />
                </IconButton>
                <IconButton
                  label="Elimina sezione"
                  danger
                  onClick={() => change({ sections: def.sections.filter((_, i) => i !== si) })}
                >
                  <Trash2 />
                </IconButton>
              </header>
              <div className="space-y-2 p-3">
                <Input
                  aria-label={`Descrizione della sezione ${si + 1}`}
                  className="h-8 text-xs"
                  placeholder="Descrizione o istruzioni (facoltative)"
                  value={s.description ?? ""}
                  maxLength={1000}
                  onChange={(e) =>
                    updateSection(si, {
                      ...(e.target.value
                        ? { description: e.target.value }
                        : { description: undefined }),
                    })
                  }
                />
                {s.fields.map((f, fi) => (
                  <FieldEditor
                    key={f.id}
                    field={f}
                    open={open === f.id}
                    onToggle={() => setOpen(open === f.id ? null : f.id)}
                    onChange={(nf) => updateField(si, fi, nf)}
                    onMove={(d) => updateSection(si, { fields: move(s.fields, fi, d) })}
                    onDuplicate={() => {
                      const copy = {
                        ...structuredClone(f),
                        id: newId("c"),
                        label: `${f.label} (copia)`,
                      };
                      updateSection(si, {
                        fields: [...s.fields.slice(0, fi + 1), copy, ...s.fields.slice(fi + 1)],
                      });
                      setOpen(copy.id);
                    }}
                    onRemove={() =>
                      updateSection(si, { fields: s.fields.filter((_, i) => i !== fi) })
                    }
                    first={fi === 0}
                    last={fi === s.fields.length - 1}
                  />
                ))}
                <AddField
                  onAdd={(type) => {
                    const f = blankField(type);
                    updateSection(si, { fields: [...s.fields, f] });
                    setOpen(f.id);
                  }}
                />
              </div>
            </section>
          ))}
          <Button
            variant="secondary"
            className="w-full border-dashed"
            onClick={() =>
              change({
                sections: [
                  ...def.sections,
                  { id: newId("s"), title: `Sezione ${def.sections.length + 1}`, fields: [] },
                ],
              })
            }
          >
            <Plus aria-hidden /> Aggiungi sezione
          </Button>
        </div>

        <div
          className={cn("xl:sticky xl:top-20 xl:self-start", view === "edit" && "hidden xl:block")}
        >
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Eye className="size-4" aria-hidden /> Anteprima: prova a compilarla, non viene salvata.
          </div>
          <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-lg xl:pr-1">
            {def.sections.length ? (
              <FormFields
                definition={clean(def)}
                values={preview}
                onChange={(fid: string, v: FormValue) => setPreview((p) => ({ ...p, [fid]: v }))}
                idPrefix="pv"
              />
            ) : (
              <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Aggiungi una sezione per vedere l&apos;anteprima.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="cos-glass sticky bottom-3 z-20 flex items-center gap-2 rounded-xl border border-border px-3 py-2 shadow-lg sm:gap-3 sm:px-4 sm:py-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground" aria-live="polite">
          {def.sections.length} sezioni · {fieldCount} campi
          {dirty ? " · non salvato" : msg.ok ? ` · ${msg.ok}` : ""}
          {!check.ok && <span className="block text-danger">{check.error}</span>}
        </p>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => save(false)}>
          <Save aria-hidden /> Salva<span className="hidden sm:inline"> bozza</span>
        </Button>
        <Button size="sm" disabled={pending || !check.ok} onClick={() => save(true)}>
          <Rocket aria-hidden /> Pubblica
          {published && <span className="hidden sm:inline"> nuova versione</span>}
        </Button>
      </div>
      <FormAlert error={msg.error} />
    </div>
  );
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-8 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30 [&_svg]:size-4",
        danger && "hover:bg-danger/10 hover:text-danger",
      )}
    >
      {children}
    </button>
  );
}

function AddField({ onAdd }: { onAdd: (t: FormFieldType) => void }) {
  const [type, setType] = useState<FormFieldType>("text");
  return (
    <div className="flex gap-2 pt-1">
      <Select
        aria-label="Tipo del nuovo campo"
        className="h-8 flex-1 text-xs"
        value={type}
        onChange={(e) => setType(e.target.value as FormFieldType)}
      >
        {FORM_FIELD_TYPES.map((t) => (
          <option key={t} value={t}>
            {FORM_FIELD_TYPE_LABELS[t]}
          </option>
        ))}
      </Select>
      <Button size="sm" variant="secondary" onClick={() => onAdd(type)}>
        <Plus aria-hidden /> Aggiungi campo
      </Button>
    </div>
  );
}

function FieldEditor({
  field: f,
  open,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
  first,
  last,
}: {
  field: FormField;
  open: boolean;
  onToggle: () => void;
  onChange: (f: FormField) => void;
  onMove: (d: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  first: boolean;
  last: boolean;
}) {
  const p = `fe-${f.id}`;
  const lines = (v: string) => v.split("\n").slice(0, 60);
  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        open ? "border-primary/50 bg-accent/30" : "border-border",
      )}
      data-testid="field-editor"
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-1 text-left text-sm hover:bg-accent/50"
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
          <span className="truncate font-medium">{f.label || "Senza etichetta"}</span>
          {f.required && (
            <span className="text-danger" aria-label="obbligatorio">
              *
            </span>
          )}
          <span className="ml-auto shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
            {FORM_FIELD_TYPE_LABELS[f.type]}
          </span>
        </button>
        <IconButton label="Sposta su" onClick={() => onMove(-1)} disabled={first}>
          <ArrowUp />
        </IconButton>
        <IconButton label="Sposta giù" onClick={() => onMove(1)} disabled={last}>
          <ArrowDown />
        </IconButton>
        <IconButton label="Duplica campo" onClick={onDuplicate}>
          <Copy />
        </IconButton>
        <IconButton label="Elimina campo" danger onClick={onRemove}>
          <Trash2 />
        </IconButton>
      </div>
      {open && (
        <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
          <Labeled id={`${p}-label`} label="Etichetta">
            <Input
              id={`${p}-label`}
              value={f.label}
              maxLength={200}
              onChange={(e) => onChange({ ...f, label: e.target.value })}
            />
          </Labeled>
          <Labeled id={`${p}-type`} label="Tipo">
            <Select
              id={`${p}-type`}
              value={f.type}
              onChange={(e) => onChange(retype(f, e.target.value as FormFieldType))}
            >
              {FORM_FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FORM_FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Labeled>
          <div className="sm:col-span-2">
            <Labeled id={`${p}-help`} label="Aiuto per chi compila">
              <Input
                id={`${p}-help`}
                value={f.help ?? ""}
                maxLength={500}
                onChange={(e) => {
                  const { help: _, ...rest } = f;
                  onChange(
                    (e.target.value ? { ...rest, help: e.target.value } : rest) as FormField,
                  );
                }}
              />
            </Labeled>
          </div>

          {f.type === "auto" && (
            <Labeled id={`${p}-source`} label="Dato da inserire">
              <Select
                id={`${p}-source`}
                value={f.source}
                onChange={(e) => onChange({ ...f, source: e.target.value as FormAutoSource })}
              >
                {FORM_AUTO_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {FORM_AUTO_SOURCE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Labeled>
          )}
          {f.type === "number" && (
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <Labeled id={`${p}-unit`} label="Unità">
                <Input
                  id={`${p}-unit`}
                  value={f.unit ?? ""}
                  maxLength={20}
                  placeholder="es. kN"
                  onChange={(e) =>
                    onChange({
                      ...f,
                      ...(e.target.value ? { unit: e.target.value } : { unit: undefined }),
                    })
                  }
                />
              </Labeled>
              {(["min", "max"] as const).map((k) => (
                <Labeled key={k} id={`${p}-${k}`} label={k === "min" ? "Minimo" : "Massimo"}>
                  <Input
                    id={`${p}-${k}`}
                    inputMode="decimal"
                    value={f[k] ?? ""}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(",", "."));
                      onChange({
                        ...f,
                        [k]: e.target.value === "" || !Number.isFinite(n) ? undefined : n,
                      });
                    }}
                  />
                </Labeled>
              ))}
            </div>
          )}
          {f.type === "choice" && (
            <div className="sm:col-span-2">
              <Labeled id={`${p}-options`} label="Opzioni (una per riga)">
                <Textarea
                  id={`${p}-options`}
                  className="min-h-20"
                  value={f.options.join("\n")}
                  onChange={(e) => onChange({ ...f, options: lines(e.target.value).slice(0, 20) })}
                />
              </Labeled>
            </div>
          )}
          {f.type === "checklist" && (
            <>
              <div className="sm:col-span-2">
                <Labeled id={`${p}-rows`} label="Righe da controllare (una per riga)">
                  <Textarea
                    id={`${p}-rows`}
                    className="min-h-28"
                    value={f.rows.join("\n")}
                    onChange={(e) => onChange({ ...f, rows: lines(e.target.value) })}
                  />
                </Labeled>
              </div>
              <div className="sm:col-span-2">
                <Labeled id={`${p}-options`} label="Esiti possibili (uno per riga)">
                  <Textarea
                    id={`${p}-options`}
                    className="min-h-16"
                    value={f.options.join("\n")}
                    onChange={(e) => onChange({ ...f, options: lines(e.target.value).slice(0, 6) })}
                  />
                </Labeled>
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-2 sm:col-span-2">
            {f.type !== "auto" && (
              <Check
                id={`${p}-required`}
                label="Obbligatorio per chiudere il modulo"
                checked={Boolean(f.required)}
                onChange={(v) => onChange({ ...f, required: v || undefined } as FormField)}
              />
            )}
            {f.type === "choice" && (
              <Check
                id={`${p}-multiple`}
                label="Più scelte possibili"
                checked={Boolean(f.multiple)}
                onChange={(v) => onChange({ ...f, multiple: v || undefined })}
              />
            )}
            {(f.type === "checklist" || f.type === "yes_no") && (
              <Check
                id={`${p}-note`}
                label="Nota per ogni risposta"
                checked={Boolean(f.withNote)}
                onChange={(v) => onChange({ ...f, withNote: v || undefined })}
              />
            )}
            {f.type === "text" && (
              <Check
                id={`${p}-subject`}
                label="Identifica l'impianto (per trovare l'ispezione precedente)"
                checked={Boolean(f.isSubjectCode)}
                onChange={(v) => onChange({ ...f, isSubjectCode: v || undefined })}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Check({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        className="size-4 accent-[var(--color-primary)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
