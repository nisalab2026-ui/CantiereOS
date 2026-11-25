"use client";

import {
  FORM_AUTO_SOURCE_LABELS,
  FORM_AUTO_SOURCES,
  FORM_CATEGORIES,
  FORM_CATEGORY_LABELS,
  FORM_FIELD_TYPE_LABELS,
  FORM_FIELD_TYPES,
  MAX_PHOTOS,
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
  AlignLeft,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Camera,
  ChevronDown,
  ClipboardList,
  Copy,
  CopyPlus,
  Eye,
  FileText,
  GripVertical,
  Hash,
  LayoutList,
  ListChecks,
  type LucideIcon,
  Pencil,
  Palette,
  PenLine,
  Redo2,
  Rocket,
  Save,
  Sparkles,
  ToggleLeft,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField as Labeled, Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { publishTemplateAction, saveTemplateDraftAction } from "../../actions";
import { FormDocument } from "../../form-document";
import { FormFields } from "../../form-fields";
import { AppearancePanel } from "./appearance-panel";

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
    ...def,
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

const TYPE_ICONS: Record<FormFieldType, LucideIcon> = {
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  date: CalendarDays,
  yes_no: ToggleLeft,
  choice: ListChecks,
  checklist: ClipboardList,
  signature: PenLine,
  auto: Sparkles,
  photo: Camera,
};

const TYPE_HINTS: Record<FormFieldType, string> = {
  text: "Una riga: nome, codice, matricola",
  textarea: "Più righe: note, descrizioni",
  number: "Valori con unità, minimo e massimo",
  date: "Giorno dal calendario",
  yes_no: "Risposta secca, con nota",
  choice: "Una o più opzioni da un elenco",
  checklist: "Righe da verificare con esito e nota",
  signature: "Firma con il dito o il mouse",
  auto: "Cliente, sede, azienda, data…",
  photo: "Scatta o carica foto dal telefono",
};

type Drag =
  | { kind: "field"; si: number; fi: number }
  | { kind: "section"; si: number }
  | { kind: "new"; type: FormFieldType };
type Drop = { si: number; fi: number } | { section: number } | null;

const HISTORY = 50;

export function TemplateEditor({
  id,
  version,
  initial,
  published,
  companyName,
}: {
  id: string;
  version: string;
  initial: { name: string; description: string; category: string; definition: FormDefinition };
  published: boolean;
  companyName: string;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState({
    name: initial.name,
    description: initial.description,
    category: initial.category,
  });
  const [def, setDef] = useState<FormDefinition>(initial.definition);
  const [past, setPast] = useState<FormDefinition[]>([]);
  const [future, setFuture] = useState<FormDefinition[]>([]);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState(Math.max(0, initial.definition.sections.length - 1));
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [paper, setPaper] = useState<"sheet" | "style" | "try">("sheet");
  const [preview, setPreview] = useState<FormValues>({});
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const drag = useRef<Drag | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const check = useMemo(() => parseFormDefinition(clean(def)), [def]);
  const cleaned = useMemo(() => clean(def), [def]);
  const fieldCount = def.sections.reduce((n, s) => n + s.fields.length, 0);

  // le modifiche toccano solo ciò che cambia: sezioni o aspetto restano come sono
  const change = (patch: Partial<FormDefinition>) => {
    const next = { ...def, ...patch };
    setPast((p) => [...p.slice(-HISTORY + 1), def]);
    setFuture([]);
    setDef(next);
    setDirty(true);
    setMsg({});
  };
  const undo = () => {
    const prev = past.at(-1);
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([def, ...future]);
    setDef(prev);
    setDirty(true);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, def]);
    setDef(next);
    setDirty(true);
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
  const highlight = (fid: string) => {
    setFlash(fid);
    setTimeout(() => setFlash((f) => (f === fid ? null : f)), 900);
  };

  /** Aggiunge un campo nella sezione attiva (o ne crea una se non ce ne sono). */
  const addField = (type: FormFieldType, at?: { si: number; fi: number }) => {
    const f = blankField(type);
    if (!def.sections.length) {
      change({ sections: [{ id: newId("s"), title: "Sezione 1", fields: [f] }] });
      setActive(0);
    } else {
      const si = at?.si ?? Math.min(active, def.sections.length - 1);
      const fields = [...def.sections[si]!.fields];
      fields.splice(at?.fi ?? fields.length, 0, f);
      updateSection(si, { fields });
      setActive(si);
    }
    setOpen(f.id);
    highlight(f.id);
  };
  const addSection = () => {
    const sec = { id: newId("s"), title: `Sezione ${def.sections.length + 1}`, fields: [] };
    change({ sections: [...def.sections, sec] });
    setActive(def.sections.length);
  };
  const duplicateSection = (si: number) => {
    const src = def.sections[si]!;
    const copy: FormSection = {
      ...structuredClone(src),
      id: newId("s"),
      title: `${src.title} (copia)`,
      fields: src.fields.map((f) => ({
        ...structuredClone(f),
        id: newId("c"),
        ...(f.type === "text" ? { isSubjectCode: undefined } : {}),
      })) as FormField[],
    };
    change({ sections: [...def.sections.slice(0, si + 1), copy, ...def.sections.slice(si + 1)] });
    setActive(si + 1);
  };

  /** Rilascio di un trascinamento: sposta un campo, una sezione, o crea un campo nuovo. */
  const onDrop = (target: Drop) => {
    const d = drag.current;
    drag.current = null;
    setDrop(null);
    if (!d || !target) return;
    if (d.kind === "section") {
      const to = "section" in target ? target.section : target.si;
      if (to === d.si) return;
      const sections = [...def.sections];
      const [moved] = sections.splice(d.si, 1);
      sections.splice(to, 0, moved!);
      change({ sections });
      setActive(to);
      return;
    }
    const si = "section" in target ? target.section : target.si;
    const fi = "section" in target ? def.sections[si]!.fields.length : target.fi;
    if (d.kind === "new") {
      addField(d.type, { si, fi });
      return;
    }
    const sections = def.sections.map((s) => ({ ...s, fields: [...s.fields] }));
    const [moved] = sections[d.si]!.fields.splice(d.fi, 1);
    const adj = d.si === si && d.fi < fi ? fi - 1 : fi;
    sections[si]!.fields.splice(adj, 0, moved!);
    change({ sections });
    setActive(si);
    highlight(moved!.id);
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

  // Ctrl/⌘ S salva; Ctrl/⌘ Z e Maiusc+Ctrl/⌘ Z annullano e ripristinano fuori dai campi di testo
  const keys = useRef({ save, undo, redo });
  keys.current = { save, undo, redo };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        keys.current.save(false);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) keys.current.redo();
        else keys.current.undo();
      } else if (k === "y") {
        e.preventDefault();
        keys.current.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setMetaField = (patch: Partial<typeof meta>) => {
    setMeta({ ...meta, ...patch });
    setDirty(true);
  };

  return (
    <div className="space-y-4 pb-24">
      <section className="grid gap-4 rounded-xl border border-border bg-card/60 p-4 sm:grid-cols-[2fr_1fr] sm:p-5">
        <Labeled id="te-name" label="Nome del modello" required>
          <Input
            id="te-name"
            value={meta.name}
            maxLength={200}
            onChange={(e) => setMetaField({ name: e.target.value })}
          />
        </Labeled>
        <Labeled id="te-category" label="Categoria" required>
          <Select
            id="te-category"
            value={meta.category}
            onChange={(e) => setMetaField({ category: e.target.value })}
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
              onChange={(e) => setMetaField({ description: e.target.value })}
            />
          </Labeled>
        </div>
      </section>

      {/* su telefono e tablet: struttura o anteprima; su schermi larghi affiancate */}
      <div className="flex gap-1 rounded-lg border border-border p-0.5 xl:hidden" role="tablist">
        {(
          [
            ["edit", "Struttura", Pencil],
            ["preview", "Anteprima", Eye],
          ] as const
        ).map(([v, l, Icon]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm transition-colors",
              view === v ? "bg-accent font-medium" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden /> {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[12rem_minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Componenti: clic per aggiungere alla sezione attiva, oppure trascina nel punto voluto */}
        <aside
          className={cn(
            "min-w-0 lg:sticky lg:top-20 lg:self-start",
            view === "preview" && "hidden xl:block",
          )}
          aria-label="Componenti"
        >
          <p className="mb-2 hidden text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase lg:block">
            Componenti
          </p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:overflow-visible lg:px-0">
            {FORM_FIELD_TYPES.map((t) => {
              const Icon = TYPE_ICONS[t];
              return (
                <button
                  key={t}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    drag.current = { kind: "new", type: t };
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => setDrop(null)}
                  onClick={() => addField(t)}
                  title={`${FORM_FIELD_TYPE_LABELS[t]}: ${TYPE_HINTS[t]}`}
                  data-testid="palette-item"
                  className="cos-lift group flex shrink-0 cursor-grab items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left active:cursor-grabbing"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/12 text-primary transition-transform group-hover:scale-110">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium whitespace-nowrap">
                      {FORM_FIELD_TYPE_LABELS[t]}
                    </span>
                    <span className="hidden text-[11px] leading-tight text-muted-foreground lg:block">
                      {TYPE_HINTS[t]}
                    </span>
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={addSection}
              className="cos-lift flex shrink-0 items-center gap-2.5 rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm font-medium"
            >
              <span className="grid size-7 place-items-center rounded-md bg-accent">
                <LayoutList className="size-4" aria-hidden />
              </span>
              Nuova sezione
            </button>
          </div>
          {def.sections.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Si aggiunge in{" "}
              <span className="font-medium text-foreground">
                {def.sections[Math.min(active, def.sections.length - 1)]?.title || "sezione"}
              </span>
              . Puoi anche trascinarlo dove vuoi.
            </p>
          )}
        </aside>

        {/* Struttura del documento */}
        <div
          className={cn("min-w-0 space-y-3", view === "preview" && "hidden xl:block")}
          data-testid="editor"
        >
          <div className="flex items-center gap-1">
            <p className="flex-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Struttura
            </p>
            <IconButton label="Annulla (Ctrl Z)" onClick={undo} disabled={!past.length}>
              <Undo2 />
            </IconButton>
            <IconButton label="Ripristina (Ctrl Maiusc Z)" onClick={redo} disabled={!future.length}>
              <Redo2 />
            </IconButton>
          </div>

          {def.sections.length === 0 && (
            <button
              type="button"
              onClick={addSection}
              className="grid w-full place-items-center gap-2 rounded-xl border border-dashed border-border p-10 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <FileText className="size-8 text-primary" aria-hidden />
              Il documento è vuoto: aggiungi la prima sezione, poi i campi dai componenti.
            </button>
          )}

          {def.sections.map((s, si) => (
            <section
              key={s.id}
              onFocusCapture={() => setActive(si)}
              onClick={() => setActive(si)}
              onDragOver={(e) => {
                if (!drag.current) return;
                e.preventDefault();
                if (drag.current.kind === "section" || !s.fields.length) setDrop({ section: si });
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(drop ?? { section: si });
              }}
              className={cn(
                "cos-enter rounded-xl border bg-card/60 transition-[border-color,box-shadow]",
                active === si
                  ? "border-primary/45 shadow-[0_0_0_3px_rgb(34_197_94/0.12)]"
                  : "border-border",
                drop && "section" in drop && drop.section === si && "border-primary border-dashed",
              )}
              data-testid="section-editor"
            >
              <header className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2.5">
                <span
                  draggable
                  onDragStart={(e) => {
                    drag.current = { kind: "section", si };
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDrop(null)}
                  className="hidden cursor-grab touch-none text-muted-foreground hover:text-foreground sm:block"
                  title="Trascina per spostare la sezione"
                  aria-hidden
                >
                  <GripVertical className="size-4" />
                </span>
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
                <IconButton label="Duplica sezione" onClick={() => duplicateSection(si)}>
                  <CopyPlus />
                </IconButton>
                <IconButton
                  label="Elimina sezione"
                  danger
                  onClick={() => change({ sections: def.sections.filter((_, i) => i !== si) })}
                >
                  <Trash2 />
                </IconButton>
              </header>
              <div className="space-y-1.5 p-3">
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
                  <div
                    key={f.id}
                    onDragOver={(e) => {
                      const d = drag.current;
                      if (!d || d.kind === "section") return;
                      e.preventDefault();
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setDrop({ si, fi: e.clientY > r.top + r.height / 2 ? fi + 1 : fi });
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDrop(drop);
                    }}
                    className="relative"
                  >
                    {drop && "fi" in drop && drop.si === si && drop.fi === fi && <DropLine top />}
                    <FieldEditor
                      field={f}
                      open={open === f.id}
                      flash={flash === f.id}
                      onToggle={() => setOpen(open === f.id ? null : f.id)}
                      onChange={(nf) => updateField(si, fi, nf)}
                      onMove={(d) => updateSection(si, { fields: move(s.fields, fi, d) })}
                      onDragStart={() => {
                        drag.current = { kind: "field", si, fi };
                        setOpen(null);
                      }}
                      onDragEnd={() => setDrop(null)}
                      onDuplicate={() => {
                        const copy = {
                          ...structuredClone(f),
                          id: newId("c"),
                          label: `${f.label} (copia)`,
                          ...(f.type === "text" ? { isSubjectCode: undefined } : {}),
                        } as FormField;
                        updateSection(si, {
                          fields: [...s.fields.slice(0, fi + 1), copy, ...s.fields.slice(fi + 1)],
                        });
                        setOpen(copy.id);
                        highlight(copy.id);
                      }}
                      onRemove={() =>
                        updateSection(si, { fields: s.fields.filter((_, i) => i !== fi) })
                      }
                      first={fi === 0}
                      last={fi === s.fields.length - 1}
                    />
                    {drop &&
                      "fi" in drop &&
                      drop.si === si &&
                      drop.fi === fi + 1 &&
                      fi === s.fields.length - 1 && <DropLine />}
                  </div>
                ))}
                {s.fields.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Sezione vuota: tocca un componente o trascinalo qui.
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>

        {/* Anteprima: il foglio A4 come verrà stampato, oppure una prova di compilazione */}
        <div
          className={cn(
            "min-w-0 lg:col-span-2 xl:sticky xl:top-20 xl:col-span-1 xl:self-start",
            view === "edit" && "hidden xl:block",
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <div
              className="grid flex-1 grid-cols-3 gap-0.5 rounded-lg border border-border bg-card/60 p-0.5"
              role="tablist"
            >
              {(
                [
                  ["sheet", "Foglio A4", FileText],
                  ["style", "Aspetto", Palette],
                  ["try", "Prova", Pencil],
                ] as const
              ).map(([v, l, Icon]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={paper === v}
                  onClick={() => setPaper(v)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs whitespace-nowrap transition-colors",
                    paper === v
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden /> {l}
                </button>
              ))}
            </div>
            {paper === "try" && (
              <span className="text-xs whitespace-nowrap text-muted-foreground">non si salva</span>
            )}
          </div>
          <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-xl xl:pr-1">
            {paper === "style" && (
              <div className="mb-4">
                <AppearancePanel
                  value={def.appearance ?? {}}
                  onChange={(appearance) => change({ appearance })}
                />
              </div>
            )}
            {def.sections.length === 0 && paper !== "style" ? (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Aggiungi una sezione per vedere l&apos;anteprima.
              </p>
            ) : paper !== "try" ? (
              <div className="light rounded-sm bg-white p-6 text-foreground shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)] ring-1 ring-black/5 sm:p-8">
                <FormDocument
                  definition={cleaned}
                  values={preview}
                  blank
                  heading={{
                    kicker:
                      FORM_CATEGORY_LABELS[meta.category as keyof typeof FORM_CATEGORY_LABELS] ??
                      "",
                    title: meta.name || "Senza nome",
                    description: meta.description || undefined,
                    company: companyName,
                  }}
                />
              </div>
            ) : (
              <FormFields
                definition={cleaned}
                values={preview}
                onChange={(fid: string, v: FormValue) => setPreview((p) => ({ ...p, [fid]: v }))}
                idPrefix="pv"
              />
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
        <span className="hidden text-[11px] text-muted-foreground lg:inline">
          Ctrl S per salvare
        </span>
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

function DropLine({ top }: { top?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute right-0 left-0 z-10 h-0.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]",
        top ? "-top-1" : "-bottom-1",
      )}
    />
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

function FieldEditor({
  field: f,
  open,
  flash,
  onDragStart,
  onDragEnd,
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
  flash: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
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
  const Icon = TYPE_ICONS[f.type];
  return (
    <div
      className={cn(
        "group/field rounded-lg border bg-card/40 transition-[border-color,background-color,box-shadow] duration-300",
        open ? "border-primary/50 bg-accent/30" : "border-border hover:border-primary/30",
        flash && "border-primary shadow-[0_0_0_3px_rgb(34_197_94/0.25)]",
      )}
      data-testid="field-editor"
    >
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          className="hidden cursor-grab touch-none px-0.5 text-muted-foreground/60 hover:text-foreground sm:block"
          title="Trascina per spostare il campo"
          aria-hidden
        >
          <GripVertical className="size-4" />
        </span>
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-3.5" aria-hidden />
        </span>
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
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 leading-snug font-medium break-words">
              {f.label || "Senza etichetta"}
              {f.required && (
                <span className="ml-0.5 text-danger" aria-label="obbligatorio">
                  *
                </span>
              )}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {FORM_FIELD_TYPE_LABELS[f.type]}
            </span>
          </span>
        </button>
        <span
          className={cn(
            "flex shrink-0 items-center transition-opacity duration-150",
            !open &&
              "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/field:opacity-100 [@media(hover:hover)]:group-hover/field:opacity-100",
          )}
        >
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
        </span>
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
          {f.type === "photo" && (
            <Labeled id={`${p}-max`} label="Numero massimo di foto">
              <Input
                id={`${p}-max`}
                type="number"
                min={1}
                max={MAX_PHOTOS}
                value={f.maxPhotos ?? ""}
                placeholder={String(MAX_PHOTOS)}
                onChange={(e) => {
                  const n = Math.trunc(Number(e.target.value));
                  onChange({
                    ...f,
                    maxPhotos:
                      e.target.value === "" || !Number.isFinite(n)
                        ? undefined
                        : Math.min(MAX_PHOTOS, Math.max(1, n)),
                  });
                }}
              />
            </Labeled>
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
