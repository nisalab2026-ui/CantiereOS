import { z } from "zod";

/**
 * Definizione di un modello di modulo (ADR-013) e validazione dei valori.
 * Pura: nessun accesso al database, usata dal server (sempre) e dal browser
 * (anteprima e controlli immediati). La verità è sempre la validazione del server.
 */

export const FORM_CATEGORIES = [
  "inspection",
  "checklist",
  "report",
  "safety",
  "delivery",
  "other",
] as const;
export type FormCategory = (typeof FORM_CATEGORIES)[number];
export const FORM_CATEGORY_LABELS: Record<FormCategory, string> = {
  inspection: "Ispezione",
  checklist: "Checklist",
  report: "Verbale / rapporto",
  safety: "Sicurezza",
  delivery: "Consegna",
  other: "Altro",
};

export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "yes_no",
  "choice",
  "checklist",
  "signature",
  "auto",
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];
export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Testo breve",
  textarea: "Testo lungo",
  number: "Numero",
  date: "Data",
  yes_no: "Sì / No",
  choice: "Scelta",
  checklist: "Tabella di controlli",
  signature: "Firma",
  auto: "Dato automatico",
};

/** Dati che il server inserisce da solo: non si riscrivono a mano. */
export const FORM_AUTO_SOURCES = [
  "customer.name",
  "customer.address",
  "customer.vat",
  "site.name",
  "site.address",
  "company.name",
  "company.vat",
  "user.name",
  "today",
  "previous.completed_on",
] as const;
export type FormAutoSource = (typeof FORM_AUTO_SOURCES)[number];
export const FORM_AUTO_SOURCE_LABELS: Record<FormAutoSource, string> = {
  "customer.name": "Cliente (committente)",
  "customer.address": "Indirizzo del cliente",
  "customer.vat": "Partita IVA del cliente",
  "site.name": "Nome della sede",
  "site.address": "Indirizzo della sede (sito)",
  "company.name": "La tua azienda",
  "company.vat": "Partita IVA della tua azienda",
  "user.name": "Chi compila",
  today: "Data di oggi",
  "previous.completed_on": "Data dell'ultima compilazione dello stesso impianto",
};

const ID = /^[a-z][a-z0-9_]{0,39}$/;
const label = z.string().trim().min(1, "Inserisci un'etichetta").max(200, "Massimo 200 caratteri");
const help = z.string().trim().max(500, "Massimo 500 caratteri").optional();
const option = z.string().trim().min(1, "Opzione vuota").max(120, "Opzione troppo lunga");

const base = {
  id: z.string().regex(ID, "Identificativo non valido"),
  label,
  help,
  required: z.boolean().optional(),
};

export const formFieldSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("text"),
    placeholder: z.string().max(120).optional(),
    /** identifica l'oggetto controllato (es. n. impianto): al massimo uno per modello */
    isSubjectCode: z.boolean().optional(),
  }),
  z.object({ ...base, type: z.literal("textarea"), placeholder: z.string().max(200).optional() }),
  z.object({
    ...base,
    type: z.literal("number"),
    unit: z.string().trim().max(20).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  }),
  z.object({ ...base, type: z.literal("date") }),
  z.object({ ...base, type: z.literal("yes_no"), withNote: z.boolean().optional() }),
  z.object({
    ...base,
    type: z.literal("choice"),
    options: z.array(option).min(2, "Servono almeno due opzioni").max(20, "Massimo 20 opzioni"),
    multiple: z.boolean().optional(),
  }),
  z.object({
    ...base,
    type: z.literal("checklist"),
    rows: z
      .array(z.string().trim().min(1, "Riga vuota").max(300, "Riga troppo lunga"))
      .min(1, "Aggiungi almeno una riga")
      .max(60, "Massimo 60 righe"),
    options: z.array(option).min(2, "Servono almeno due esiti").max(6, "Massimo 6 esiti"),
    withNote: z.boolean().optional(),
  }),
  z.object({ ...base, type: z.literal("signature") }),
  z.object({ ...base, type: z.literal("auto"), source: z.enum(FORM_AUTO_SOURCES) }),
]);
export type FormField = z.infer<typeof formFieldSchema>;

export const formSectionSchema = z.object({
  id: z.string().regex(ID, "Identificativo non valido"),
  title: label,
  description: z.string().trim().max(1000).optional(),
  fields: z.array(formFieldSchema).max(80, "Massimo 80 campi per sezione"),
});
export type FormSection = z.infer<typeof formSectionSchema>;

export const formDefinitionSchema = z
  .object({ sections: z.array(formSectionSchema).max(30, "Massimo 30 sezioni") })
  .superRefine((def, ctx) => {
    const ids = new Set<string>();
    const sectionIds = new Set<string>();
    let total = 0;
    let subject = 0;
    def.sections.forEach((s, si) => {
      if (sectionIds.has(s.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", si, "id"],
          message: "Sezione duplicata",
        });
      }
      sectionIds.add(s.id);
      s.fields.forEach((f, fi) => {
        total += 1;
        if (ids.has(f.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", si, "fields", fi, "id"],
            message: `Campo duplicato: ${f.id}`,
          });
        }
        ids.add(f.id);
        if (f.type === "text" && f.isSubjectCode) subject += 1;
        if (f.type === "number" && f.min !== undefined && f.max !== undefined && f.min > f.max) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", si, "fields", fi, "min"],
            message: "Il minimo supera il massimo",
          });
        }
        if (f.type === "choice" || f.type === "checklist") {
          if (new Set(f.options).size !== f.options.length) {
            ctx.addIssue({
              code: "custom",
              path: ["sections", si, "fields", fi, "options"],
              message: "Opzioni ripetute",
            });
          }
        }
      });
    });
    if (total > 200)
      ctx.addIssue({ code: "custom", path: ["sections"], message: "Massimo 200 campi" });
    if (subject > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["sections"],
        message: "Un solo campo può identificare l'impianto",
      });
    }
  });
export type FormDefinition = z.infer<typeof formDefinitionSchema>;

/** Prima versione leggibile dell'errore di definizione, per l'editor. */
export function parseFormDefinition(
  input: unknown,
): { ok: true; definition: FormDefinition } | { ok: false; error: string } {
  const r = formDefinitionSchema.safeParse(input);
  if (r.success) return { ok: true, definition: r.data };
  const issue = r.error.issues[0]!;
  const where = describePath(input, issue.path);
  return { ok: false, error: where ? `${where}: ${issue.message}` : issue.message };
}

function describePath(input: unknown, path: PropertyKey[]): string {
  const def = input as { sections?: { title?: string; fields?: { label?: string }[] }[] };
  if (path[0] !== "sections" || typeof path[1] !== "number") return "";
  const s = def.sections?.[path[1]];
  const sTitle = s?.title ? `«${s.title}»` : `sezione ${path[1] + 1}`;
  if (path[2] === "fields" && typeof path[3] === "number") {
    const f = s?.fields?.[path[3]];
    return `${sTitle}, ${f?.label ? `«${f.label}»` : `campo ${path[3] + 1}`}`;
  }
  return sTitle;
}

export const allFields = (def: FormDefinition): FormField[] =>
  def.sections.flatMap((s) => s.fields);

export const subjectCodeField = (def: FormDefinition) =>
  allFields(def).find((f) => f.type === "text" && f.isSubjectCode);

// --- Valori ----------------------------------------------------------------------

export interface YesNoValue {
  value: "yes" | "no" | null;
  note?: string;
}
export interface ChecklistValue {
  rows: { value: string | null; note?: string }[];
}
export interface SignatureValue {
  /** PNG come data URL, disegnata sul dispositivo */
  image: string;
  name: string;
  signedAt: string;
}
export type FormValue =
  string | number | string[] | YesNoValue | ChecklistValue | SignatureValue | null;
export type FormValues = Record<string, FormValue>;

const MAX_TEXT = 4000;
const MAX_NOTE = 500;
const MAX_SIGNATURE = 200_000; // caratteri del data URL (~150 KB)
const SIGNATURE_PREFIX = "data:image/png;base64,";

/**
 * Normalizza e valida i valori rispetto alla definizione.
 * - draft: controlla solo tipo e formato (si può salvare a metà);
 * - complete: in più, i campi obbligatori devono essere compilati.
 * I campi automatici sono ignorati: li scrive il server.
 * Restituisce i valori puliti (solo campi noti) e gli errori per id di campo.
 */
export function validateFormData(
  def: FormDefinition,
  input: unknown,
  mode: "draft" | "complete",
): { data: FormValues; errors: Record<string, string> } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const data: FormValues = {};
  const errors: Record<string, string> = {};
  for (const f of allFields(def)) {
    if (f.type === "auto") continue;
    const v = raw[f.id];
    const err = (m: string) => {
      errors[f.id] ??= m;
    };
    switch (f.type) {
      case "text":
      case "textarea": {
        if (v === undefined || v === null) break;
        if (typeof v !== "string") {
          err("Valore non valido");
          break;
        }
        const t = v.trim();
        const max = f.type === "text" ? 300 : MAX_TEXT;
        if (t.length > max) err(`Massimo ${max} caratteri`);
        else if (t) data[f.id] = t;
        break;
      }
      case "number": {
        if (v === undefined || v === null || v === "") break;
        const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
        if (!Number.isFinite(n)) err("Inserisci un numero");
        else if (f.min !== undefined && n < f.min) err(`Minimo ${f.min}`);
        else if (f.max !== undefined && n > f.max) err(`Massimo ${f.max}`);
        else data[f.id] = n;
        break;
      }
      case "date": {
        if (v === undefined || v === null || v === "") break;
        if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))
          err("Data non valida");
        else data[f.id] = v;
        break;
      }
      case "yes_no": {
        if (v === undefined || v === null) break;
        const o = v as Partial<YesNoValue>;
        const value = o.value === "yes" || o.value === "no" ? o.value : null;
        const note = typeof o.note === "string" ? o.note.trim() : "";
        if (o.value !== undefined && o.value !== null && value === null) err("Valore non valido");
        else if (note.length > MAX_NOTE) err(`Nota: massimo ${MAX_NOTE} caratteri`);
        else if (value || note) data[f.id] = { value, ...(note ? { note } : {}) };
        break;
      }
      case "choice": {
        if (v === undefined || v === null || v === "") break;
        if (f.multiple) {
          const arr = Array.isArray(v) ? v : [v];
          if (!arr.every((x) => typeof x === "string" && f.options.includes(x))) {
            err("Scelta non valida");
            break;
          }
          const picked = f.options.filter((o) => arr.includes(o));
          if (picked.length) data[f.id] = picked;
        } else if (typeof v !== "string" || !f.options.includes(v)) err("Scelta non valida");
        else data[f.id] = v;
        break;
      }
      case "checklist": {
        if (v === undefined || v === null) break;
        const rows = (v as Partial<ChecklistValue>).rows;
        if (!Array.isArray(rows) || rows.length > f.rows.length) {
          err("Tabella non valida");
          break;
        }
        const out: ChecklistValue["rows"] = [];
        let bad = false;
        let any = false;
        for (let i = 0; i < f.rows.length; i++) {
          const r = (rows[i] ?? {}) as { value?: unknown; note?: unknown };
          const value = typeof r.value === "string" && f.options.includes(r.value) ? r.value : null;
          if (r.value !== undefined && r.value !== null && r.value !== "" && value === null)
            bad = true;
          const note = f.withNote && typeof r.note === "string" ? r.note.trim() : "";
          if (note.length > MAX_NOTE) bad = true;
          if (value || note) any = true;
          out.push({ value, ...(note ? { note } : {}) });
        }
        if (bad) err("Valori non validi nella tabella");
        else if (any) data[f.id] = { rows: out };
        break;
      }
      case "signature": {
        if (v === undefined || v === null) break;
        const o = v as Partial<SignatureValue>;
        if (
          typeof o.image !== "string" ||
          !o.image.startsWith(SIGNATURE_PREFIX) ||
          o.image.length > MAX_SIGNATURE ||
          !/^[A-Za-z0-9+/=]+$/.test(o.image.slice(SIGNATURE_PREFIX.length))
        ) {
          err("Firma non valida");
          break;
        }
        const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
        const signedAt =
          typeof o.signedAt === "string" && !Number.isNaN(Date.parse(o.signedAt))
            ? new Date(o.signedAt).toISOString()
            : new Date().toISOString();
        data[f.id] = { image: o.image, name, signedAt };
        break;
      }
    }
    if (mode === "complete" && f.required && !errors[f.id] && !isFilled(f, data[f.id])) {
      err(f.type === "checklist" ? "Completa tutte le righe" : "Campo obbligatorio");
    }
  }
  return { data, errors };
}

function isFilled(f: FormField, v: FormValue | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (f.type === "yes_no") return (v as YesNoValue).value !== null;
  if (f.type === "checklist") {
    const rows = (v as ChecklistValue).rows;
    return rows.length === f.rows.length && rows.every((r) => r.value !== null);
  }
  if (Array.isArray(v)) return v.length > 0;
  return v !== "";
}

/** Quanti campi da compilare sono compilati (per la barra di avanzamento). */
export function formProgress(
  def: FormDefinition,
  data: FormValues,
): { done: number; total: number } {
  const fields = allFields(def).filter((f) => f.type !== "auto");
  return {
    total: fields.length,
    done: fields.filter((f) => isFilled(f, data[f.id])).length,
  };
}

/** Testo semplice di un valore, per elenchi, ricerca ed esportazioni. */
export function formValueText(f: FormField, v: FormValue | undefined): string {
  if (v === undefined || v === null) return "";
  switch (f.type) {
    case "yes_no": {
      const o = v as YesNoValue;
      const t = o.value === "yes" ? "Sì" : o.value === "no" ? "No" : "";
      return [t, o.note].filter(Boolean).join(" — ");
    }
    case "checklist":
      return (v as ChecklistValue).rows
        .map((r, i) => `${f.rows[i]}: ${r.value ?? "—"}${r.note ? ` (${r.note})` : ""}`)
        .join("; ");
    case "signature": {
      const s = v as SignatureValue;
      return `Firmato${s.name ? ` da ${s.name}` : ""}`;
    }
    case "choice":
      return Array.isArray(v) ? v.join(", ") : String(v);
    default:
      return String(v);
  }
}
