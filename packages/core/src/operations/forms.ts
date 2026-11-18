import { z } from "zod";
import { requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { ListOptions, Page } from "../directory/lists";
import type { UserTx } from "../db/transaction";
import { optional, parseInput, ValidationError } from "../validation";
import { likePattern } from "../workspace/search";
import {
  allFields,
  FORM_CATEGORIES,
  formDefinitionSchema,
  parseFormDefinition,
  subjectCodeField,
  validateFormData,
  type FormAutoSource,
  type FormCategory,
  type FormDefinition,
  type FormValues,
} from "./form-definition";
import { findLibraryEntry } from "./form-library";
import { checkFormPhotos } from "./form-photos";

/**
 * Moduli compilabili (ADR-013): modelli dell'azienda con versioni immutabili e
 * compilazioni. Il database blocca i moduli chiusi; qui si valida tutto il resto.
 */

const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;
const EMPTY: FormDefinition = { sections: [] };

function mapError(error: unknown, fallbackField = "form"): never {
  if (error instanceof ValidationError) throw error;
  const code = pgCode(error);
  if (code === "42501") {
    const msg = (error as { message?: string }).message ?? "";
    if (/chiuso|riaprire|modello di una/i.test(msg)) throw new ValidationError({ form: msg });
    throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
  }
  if (code === "23505")
    throw new ValidationError({ name: "Esiste già un modello con questo nome" });
  if (code === "23503")
    throw new ValidationError({ [fallbackField]: "Elemento collegato non trovato" });
  if (code === "23514") {
    const msg = (error as { message?: string }).message ?? "";
    if (/sede/i.test(msg)) throw new ValidationError({ siteId: "La sede non è di questo cliente" });
    if (/commessa/i.test(msg))
      throw new ValidationError({ projectId: "La commessa non è di questo cliente" });
    throw new ValidationError({ form: "Dati non validi" });
  }
  throw error;
}

// --- Modelli -----------------------------------------------------------------------

export interface FormTemplateRow {
  id: string;
  name: string;
  description: string | null;
  category: FormCategory;
  currentVersion: number | null;
  isArchived: boolean;
  /** la bozza ha modifiche non ancora pubblicate */
  hasDraftChanges: boolean;
  submissionCount: number;
  updatedAt: string;
}

export interface FormTemplateDetail extends FormTemplateRow {
  draftDefinition: FormDefinition;
  libraryKey: string | null;
  createdAt: string;
}

const TEMPLATE_SELECT = `t.id, t.name, t.description, t.category, t.current_version as "currentVersion",
  t.is_archived as "isArchived", t.updated_at as "updatedAt",
  (t.current_version is null or t.draft_definition is distinct from (
     select v.definition from public.form_template_versions v
      where v.template_id = t.id and v.version = t.current_version)) as "hasDraftChanges",
  (select count(*)::int from public.form_submissions s
    where s.template_id = t.id and s.deleted_at is null) as "submissionCount"`;

export async function listFormTemplates(
  tx: UserTx,
  access: TenantAccess,
  q: { includeArchived?: boolean; onlyPublished?: boolean } = {},
): Promise<FormTemplateRow[]> {
  requirePermission(access, "forms.read");
  const where = ["t.tenant_id = $1", "t.deleted_at is null"];
  if (!q.includeArchived) where.push("not t.is_archived");
  if (q.onlyPublished) where.push("t.current_version is not null");
  const { rows } = await tx.query<FormTemplateRow>(
    `select ${TEMPLATE_SELECT} from public.form_templates t
      where ${where.join(" and ")} order by t.is_archived, lower(t.name) limit 500`,
    [access.tenantId],
  );
  return rows;
}

export async function getFormTemplate(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<FormTemplateDetail | null> {
  requirePermission(access, "forms.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<FormTemplateDetail>(
    `select ${TEMPLATE_SELECT}, t.draft_definition as "draftDefinition",
            t.library_key as "libraryKey", t.created_at as "createdAt"
       from public.form_templates t
      where t.tenant_id = $1 and t.id = $2 and t.deleted_at is null`,
    [access.tenantId, id],
  );
  return rows[0] ?? null;
}

const templateMeta = z.object({
  name: z.string().trim().min(1, "Inserisci il nome del modello").max(200, "Massimo 200 caratteri"),
  description: optional(z.string().trim().max(2000, "Massimo 2000 caratteri")),
  category: z.enum(FORM_CATEGORIES, "Scegli una categoria"),
});
export type FormTemplateMetaInput = z.input<typeof templateMeta>;

export async function createFormTemplate(
  tx: UserTx,
  access: TenantAccess,
  input: FormTemplateMetaInput & { libraryKey?: string },
): Promise<{ id: string }> {
  requirePermission(access, "forms.manage");
  const lib = input.libraryKey ? findLibraryEntry(input.libraryKey) : null;
  if (input.libraryKey && !lib) throw new ValidationError({ form: "Modello pronto non trovato" });
  const d = parseInput(templateMeta, input);
  await tx.query("savepoint create_form_template");
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.form_templates (tenant_id, name, description, category, draft_definition, library_key)
       values ($1, $2, $3, $4, $5::jsonb, $6) returning id`,
      [
        access.tenantId,
        d.name,
        d.description ?? null,
        d.category,
        JSON.stringify(lib?.definition ?? EMPTY),
        lib?.key ?? null,
      ],
    );
    return { id: rows[0]!.id };
  } catch (error) {
    await tx.query("rollback to savepoint create_form_template");
    mapError(error);
  }
}

/** Salva la bozza (nome, categoria, definizione). Non cambia le versioni pubblicate. */
export async function updateFormTemplateDraft(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: FormTemplateMetaInput & { definition: unknown },
  expectedUpdatedAt: string,
): Promise<void> {
  requirePermission(access, "forms.manage");
  if (!isUuid(id)) throw new ValidationError({ form: "Modello non trovato" });
  const d = parseInput(templateMeta, input);
  const parsed = parseFormDefinition(input.definition);
  if (!parsed.ok) throw new ValidationError({ definition: parsed.error });
  await tx.query("savepoint update_form_template");
  try {
    const { rowCount } = await tx.query(
      `update public.form_templates
          set name = $3, description = $4, category = $5, draft_definition = $6::jsonb
        where tenant_id = $1 and id = $2 and deleted_at is null
          and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $7::timestamptz)`,
      [
        access.tenantId,
        id,
        d.name,
        d.description ?? null,
        d.category,
        JSON.stringify(parsed.definition),
        expectedUpdatedAt,
      ],
    );
    if (rowCount === 0) {
      throw new ValidationError({
        form: "Il modello è stato modificato da un altro utente o non esiste più. Ricarica la pagina.",
      });
    }
  } catch (error) {
    await tx.query("rollback to savepoint update_form_template");
    mapError(error);
  }
}

/** Pubblica la bozza come nuova versione immutabile. */
export async function publishFormTemplate(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<{ version: number }> {
  requirePermission(access, "forms.manage");
  if (!isUuid(id)) throw new ValidationError({ form: "Modello non trovato" });
  const t = await getFormTemplate(tx, access, id);
  if (!t) throw new ValidationError({ form: "Modello non trovato" });
  const parsed = parseFormDefinition(t.draftDefinition);
  if (!parsed.ok) throw new ValidationError({ form: parsed.error });
  if (allFields(parsed.definition).length === 0) {
    throw new ValidationError({ form: "Aggiungi almeno un campo prima di pubblicare." });
  }
  if (!t.hasDraftChanges) throw new ValidationError({ form: "Nessuna modifica da pubblicare." });
  const version = (t.currentVersion ?? 0) + 1;
  await tx.query("savepoint publish_form_template");
  try {
    await tx.query(
      `insert into public.form_template_versions (tenant_id, template_id, version, name, definition)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [access.tenantId, id, version, t.name, JSON.stringify(parsed.definition)],
    );
    await tx.query(
      "update public.form_templates set current_version = $3 where tenant_id = $1 and id = $2",
      [access.tenantId, id, version],
    );
    return { version };
  } catch (error) {
    await tx.query("rollback to savepoint publish_form_template");
    mapError(error);
  }
}

export async function setFormTemplateArchived(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  archived: boolean,
): Promise<void> {
  requirePermission(access, "forms.manage");
  if (!isUuid(id)) throw new ValidationError({ form: "Modello non trovato" });
  try {
    await tx.query(
      "update public.form_templates set is_archived = $3 where tenant_id = $1 and id = $2 and deleted_at is null",
      [access.tenantId, id, archived],
    );
  } catch (error) {
    mapError(error);
  }
}

/** Eliminazione logica; i moduli già compilati restano leggibili. */
export async function deleteFormTemplate(tx: UserTx, access: TenantAccess, id: string) {
  requirePermission(access, "forms.delete");
  if (!isUuid(id)) return;
  await tx.query(
    "update public.form_templates set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, id],
  );
}

// --- Compilazioni --------------------------------------------------------------------

export const FORM_STATUSES = ["draft", "completed"] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];
export const FORM_STATUS_LABELS: Record<FormStatus, string> = {
  draft: "In compilazione",
  completed: "Chiuso",
};

export interface FormSubmissionRow {
  id: string;
  title: string;
  subjectCode: string | null;
  status: FormStatus;
  templateId: string;
  templateName: string;
  version: number;
  customer: { id: string; name: string } | null;
  site: { id: string; name: string } | null;
  project: { id: string; code: string; name: string } | null;
  completedAt: string | null;
  updatedAt: string;
  createdByName: string | null;
}

export interface FormSubmissionDetail extends FormSubmissionRow {
  definition: FormDefinition;
  data: FormValues;
  completedByName: string | null;
  createdAt: string;
}

const SUB_SELECT = `x.id, x.title, x.subject_code as "subjectCode", x.status, x.template_id as "templateId",
  t.name as "templateName", v.version, x.completed_at as "completedAt", x.updated_at as "updatedAt",
  coalesce(cb.full_name, cb.email) as "createdByName",
  case when c.id is null then null else json_build_object('id', c.id, 'name', c.display_name) end as customer,
  case when st.id is null then null else json_build_object('id', st.id, 'name', st.name) end as site,
  case when pr.id is null then null else json_build_object('id', pr.id, 'code', pr.code, 'name', pr.name) end as project`;
const SUB_FROM = `public.form_submissions x
  join public.form_templates t on t.tenant_id = x.tenant_id and t.id = x.template_id
  join public.form_template_versions v on v.tenant_id = x.tenant_id and v.id = x.template_version_id
  left join public.customers c on c.tenant_id = x.tenant_id and c.id = x.customer_id
  left join public.customer_sites st on st.tenant_id = x.tenant_id and st.id = x.site_id
  left join public.projects pr on pr.tenant_id = x.tenant_id and pr.id = x.project_id
  left join public.users cb on cb.id = x.created_by`;

export interface FormSubmissionQuery {
  q?: string;
  status?: string;
  templateId?: string;
  customerId?: string;
  projectId?: string;
  page?: number;
  pageSize?: number;
}

export async function listFormSubmissions(
  tx: UserTx,
  access: TenantAccess,
  q: FormSubmissionQuery = {},
  opts: ListOptions = {},
): Promise<Page<FormSubmissionRow>> {
  requirePermission(access, "forms.read");
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), opts.maxPageSize ?? 100);
  const page = Math.min(Math.max(q.page ?? 1, 1), 10_000);
  const params: unknown[] = [access.tenantId];
  const where = ["x.tenant_id = $1", "x.deleted_at is null"];
  if (q.status && (FORM_STATUSES as readonly string[]).includes(q.status)) {
    params.push(q.status);
    where.push(`x.status = $${params.length}`);
  }
  for (const [key, col] of [
    ["templateId", "template_id"],
    ["customerId", "customer_id"],
    ["projectId", "project_id"],
  ] as const) {
    if (isUuid(q[key])) {
      params.push(q[key]);
      where.push(`x.${col} = $${params.length}`);
    }
  }
  const term = (q.q ?? "").trim().slice(0, 100);
  if (term) {
    params.push(likePattern(term.toLowerCase()));
    where.push(
      `lower(concat_ws(' ', x.title, x.subject_code, t.name, c.display_name, st.name)) like $${params.length}`,
    );
  }
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await tx.query<FormSubmissionRow & { __total: number }>(
    `select ${SUB_SELECT}, count(*) over ()::int as "__total"
       from ${SUB_FROM}
      where ${where.join(" and ")}
      order by (x.status = 'draft') desc, x.updated_at desc, x.id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    rows: rows.map(({ __total: _t, ...r }) => r as FormSubmissionRow),
    total: rows[0]?.__total ?? 0,
    page,
    pageSize,
  };
}

export async function getFormSubmission(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<FormSubmissionDetail | null> {
  requirePermission(access, "forms.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<FormSubmissionDetail>(
    `select ${SUB_SELECT}, v.definition, x.data, x.created_at as "createdAt",
            coalesce(kb.full_name, kb.email) as "completedByName"
       from ${SUB_FROM}
       left join public.users kb on kb.id = x.completed_by
      where x.tenant_id = $1 and x.id = $2 and x.deleted_at is null`,
    [access.tenantId, id],
  );
  return rows[0] ?? null;
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/** Calcola i campi automatici dai dati in anagrafica (con i permessi dell'utente). */
async function resolveAutoValues(
  tx: UserTx,
  access: TenantAccess,
  def: FormDefinition,
  ctx: {
    templateId: string;
    customerId: string | null;
    siteId: string | null;
    subjectCode: string | null;
    excludeId?: string;
  },
): Promise<FormValues> {
  const auto = allFields(def).filter(
    (f): f is Extract<typeof f, { type: "auto" }> => f.type === "auto",
  );
  if (!auto.length) return {};
  const needs = (prefix: string) => auto.some((f) => f.source.startsWith(prefix));
  const values: Partial<Record<FormAutoSource, string>> = {};

  if (ctx.customerId && needs("customer.")) {
    const { rows } = await tx.query(
      `select display_name, vat_number,
              concat_ws(', ', billing_address_line,
                nullif(concat_ws(' ', billing_postal_code, billing_city,
                  case when billing_province is not null then '(' || billing_province || ')' end), '')) as address
         from public.customers where tenant_id = $1 and id = $2`,
      [access.tenantId, ctx.customerId],
    );
    if (rows[0]) {
      values["customer.name"] = rows[0].display_name;
      values["customer.address"] = rows[0].address || "";
      values["customer.vat"] = rows[0].vat_number ?? "";
    }
  }
  if (ctx.siteId && needs("site.")) {
    const { rows } = await tx.query(
      `select name, concat_ws(', ', address_line,
                concat_ws(' ', postal_code, city, case when province is not null then '(' || province || ')' end)) as address
         from public.customer_sites where tenant_id = $1 and id = $2`,
      [access.tenantId, ctx.siteId],
    );
    if (rows[0]) {
      values["site.name"] = rows[0].name;
      values["site.address"] = rows[0].address;
    }
  }
  if (needs("company.")) {
    const { rows } = await tx.query(
      "select coalesce(legal_name, name) as name, vat_number from public.tenants where id = $1",
      [access.tenantId],
    );
    values["company.name"] = rows[0]?.name ?? "";
    values["company.vat"] = rows[0]?.vat_number ?? "";
  }
  if (needs("user.")) {
    const { rows } = await tx.query(
      "select coalesce(full_name, email) as name from public.users where id = auth.uid()",
    );
    values["user.name"] = rows[0]?.name ?? "";
  }
  if (needs("today")) {
    const { rows } = await tx.query(
      "select to_char((now() at time zone 'Europe/Rome')::date, 'YYYY-MM-DD') as d",
    );
    values.today = rows[0] ? fmtDate(rows[0].d) : "";
  }
  if (needs("previous.") && ctx.subjectCode) {
    const { rows } = await tx.query(
      `select to_char((completed_at at time zone 'Europe/Rome')::date, 'YYYY-MM-DD') as d
         from public.form_submissions
        where tenant_id = $1 and template_id = $2 and lower(subject_code) = lower($3)
          and status = 'completed' and deleted_at is null and id is distinct from $4
        order by completed_at desc limit 1`,
      [access.tenantId, ctx.templateId, ctx.subjectCode, ctx.excludeId ?? null],
    );
    values["previous.completed_on"] = rows[0] ? fmtDate(rows[0].d) : "Nessuna precedente";
  }
  const out: FormValues = {};
  for (const f of auto) out[f.id] = values[f.source] ?? "";
  return out;
}

const submissionMeta = z.object({
  title: z.string().trim().min(1, "Inserisci un titolo").max(200, "Massimo 200 caratteri"),
  customerId: optional(z.uuid("Cliente non valido")),
  siteId: optional(z.uuid("Sede non valida")),
  projectId: optional(z.uuid("Commessa non valida")),
});

export async function createFormSubmission(
  tx: UserTx,
  access: TenantAccess,
  input: {
    templateId: string;
    title?: string;
    customerId?: string;
    siteId?: string;
    projectId?: string;
  },
): Promise<{ id: string }> {
  requirePermission(access, "forms.write");
  if (!isUuid(input.templateId)) throw new ValidationError({ templateId: "Scegli un modello" });
  const { rows: tpl } = await tx.query<{
    name: string;
    versionId: string;
    definition: FormDefinition;
  }>(
    `select t.name, v.id as "versionId", v.definition
       from public.form_templates t
       join public.form_template_versions v on v.template_id = t.id and v.version = t.current_version
      where t.tenant_id = $1 and t.id = $2 and t.deleted_at is null and not t.is_archived`,
    [access.tenantId, input.templateId],
  );
  if (!tpl[0])
    throw new ValidationError({ templateId: "Modello non disponibile o non pubblicato" });
  const d = parseInput(submissionMeta, { ...input, title: input.title?.trim() || tpl[0].name });
  if (d.siteId && !d.customerId) throw new ValidationError({ siteId: "Scegli prima il cliente" });
  if (d.projectId && !d.customerId)
    throw new ValidationError({ projectId: "Scegli prima il cliente" });
  const data = await resolveAutoValues(tx, access, tpl[0].definition, {
    templateId: input.templateId,
    customerId: d.customerId ?? null,
    siteId: d.siteId ?? null,
    subjectCode: null,
  });
  await tx.query("savepoint create_form_submission");
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.form_submissions
         (tenant_id, template_id, template_version_id, title, customer_id, site_id, data, project_id)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) returning id`,
      [
        access.tenantId,
        input.templateId,
        tpl[0].versionId,
        d.title,
        d.customerId ?? null,
        d.siteId ?? null,
        JSON.stringify(data),
        d.projectId ?? null,
      ],
    );
    return { id: rows[0]!.id };
  } catch (error) {
    await tx.query("rollback to savepoint create_form_submission");
    mapError(error, "customerId");
  }
}

/**
 * Salva i valori (bozza) o chiude il modulo. I valori sono validati rispetto
 * alla versione del modello; i campi automatici li ricalcola il server.
 * Restituisce gli errori per campo se la chiusura non è possibile.
 */
export async function saveFormSubmission(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: { title: string; customerId?: string; siteId?: string; projectId?: string; data: unknown },
  expectedUpdatedAt: string,
  complete: boolean,
): Promise<void> {
  requirePermission(access, "forms.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Modulo non trovato" });
  const current = await getFormSubmission(tx, access, id);
  if (!current) throw new ValidationError({ form: "Modulo non trovato" });
  if (current.status === "completed") {
    throw new ValidationError({ form: "Il modulo è chiuso: riaprilo per modificarlo." });
  }
  const d = parseInput(submissionMeta, input);
  if (d.siteId && !d.customerId) throw new ValidationError({ siteId: "Scegli prima il cliente" });
  if (d.projectId && !d.customerId)
    throw new ValidationError({ projectId: "Scegli prima il cliente" });
  const def = formDefinitionSchema.parse(current.definition);
  const { data, errors } = validateFormData(def, input.data, complete ? "complete" : "draft");
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const photoErrors = await checkFormPhotos(
    tx,
    access,
    id,
    Object.fromEntries(
      allFields(def)
        .filter((f) => f.type === "photo" && Array.isArray(data[f.id]))
        .map((f) => [f.id, data[f.id] as string[]]),
    ),
  );
  if (Object.keys(photoErrors).length) throw new ValidationError(photoErrors);
  const subjectField = subjectCodeField(def);
  const subjectCode =
    subjectField && typeof data[subjectField.id] === "string"
      ? (data[subjectField.id] as string).slice(0, 80)
      : null;
  Object.assign(
    data,
    await resolveAutoValues(tx, access, def, {
      templateId: current.templateId,
      customerId: d.customerId ?? null,
      siteId: d.siteId ?? null,
      subjectCode,
      excludeId: id,
    }),
  );
  await tx.query("savepoint save_form_submission");
  try {
    const { rowCount } = await tx.query(
      `update public.form_submissions
          set title = $3, customer_id = $4, site_id = $5, subject_code = $6, data = $7::jsonb,
              status = $8, project_id = $10
        where tenant_id = $1 and id = $2 and deleted_at is null and status = 'draft'
          and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $9::timestamptz)`,
      [
        access.tenantId,
        id,
        d.title,
        d.customerId ?? null,
        d.siteId ?? null,
        subjectCode,
        JSON.stringify(data),
        complete ? "completed" : "draft",
        expectedUpdatedAt,
        d.projectId ?? null,
      ],
    );
    if (rowCount === 0) {
      throw new ValidationError({
        form: "Il modulo è stato modificato da un altro utente o è stato chiuso. Ricarica la pagina.",
      });
    }
  } catch (error) {
    await tx.query("rollback to savepoint save_form_submission");
    mapError(error, "customerId");
  }
}

/** Riapre un modulo chiuso: serve forms.manage (con MFA); resta nel registro attività. */
export async function reopenFormSubmission(tx: UserTx, access: TenantAccess, id: string) {
  requirePermission(access, "forms.manage");
  if (!isUuid(id)) throw new ValidationError({ form: "Modulo non trovato" });
  try {
    const { rowCount } = await tx.query(
      `update public.form_submissions set status = 'draft'
        where tenant_id = $1 and id = $2 and deleted_at is null and status = 'completed'`,
      [access.tenantId, id],
    );
    if (rowCount === 0) throw new ValidationError({ form: "Il modulo non è chiuso." });
  } catch (error) {
    mapError(error);
  }
}

export async function deleteFormSubmission(tx: UserTx, access: TenantAccess, id: string) {
  requirePermission(access, "forms.delete");
  if (!isUuid(id)) return;
  // eliminazione logica: la colonna deleted_at non è tra quelle bloccate dal trigger
  await tx.query(
    "update public.form_submissions set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, id],
  );
}

/** Ultimi moduli di un cliente, per la scheda. */
export async function listCustomerFormSubmissions(
  tx: UserTx,
  access: TenantAccess,
  customerId: string,
  limit = 5,
): Promise<Page<FormSubmissionRow>> {
  return listFormSubmissions(tx, access, { customerId, pageSize: limit });
}

export interface FormCustomerOption {
  id: string;
  name: string;
  sites: { id: string; name: string; address: string }[];
  /** commesse aperte del cliente (vuoto senza projects.read) */
  projects: { id: string; code: string; name: string }[];
}

/** Clienti attivi con le loro sedi, per collegare un modulo (con i permessi dell'utente). */
export async function listFormCustomerOptions(
  tx: UserTx,
  access: TenantAccess,
): Promise<FormCustomerOption[]> {
  requirePermission(access, "forms.write");
  if (!access.permissions.has("customers.read")) return [];
  const { rows } = await tx.query<FormCustomerOption>(
    `select c.id, c.display_name as name,
            coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name,
                        'address', concat_ws(', ', s.address_line, s.city)) order by lower(s.name))
                        from public.customer_sites s
                       where s.tenant_id = c.tenant_id and s.customer_id = c.id
                         and s.deleted_at is null and s.is_active), '[]'::json) as sites,
            case when $2::boolean then coalesce((select json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name)
                        order by lower(p.code) desc)
                        from public.projects p
                       where p.tenant_id = c.tenant_id and p.customer_id = c.id and p.deleted_at is null
                         and p.status in ('quote', 'active', 'suspended')), '[]'::json)
                 else '[]'::json end as projects
       from public.customers c
      where c.tenant_id = $1 and c.deleted_at is null and c.is_active
      order by lower(c.display_name) limit 500`,
    [access.tenantId, access.permissions.has("projects.read")],
  );
  return rows;
}
