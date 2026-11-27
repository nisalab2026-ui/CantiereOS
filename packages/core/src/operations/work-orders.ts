import { z } from "zod";
import { hasPermission, requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { UserTx } from "../db/transaction";
import { optional, parseInput, ValidationError } from "../validation";
import { likePattern } from "../workspace/search";

/**
 * Interventi (ADR-017): uscite pianificate dall'ufficio ed eseguite dalla squadra.
 * Chi pianifica (work_orders.write) crea, sposta, assegna e annulla; chi è in squadra
 * cambia solo stato e note. Orari in ora italiana (Europe/Rome).
 */
export const WORK_ORDER_STATUSES = [
  "scheduled",
  "in_progress",
  "suspended",
  "completed",
  "cancelled",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  scheduled: "Da svolgere",
  in_progress: "In corso",
  suspended: "Sospeso",
  completed: "Completato",
  cancelled: "Annullato",
};
export const WORK_ORDER_KINDS = [
  "maintenance",
  "installation",
  "repair",
  "inspection",
  "emergency",
  "other",
] as const;
export type WorkOrderKind = (typeof WORK_ORDER_KINDS)[number];
export const WORK_ORDER_KIND_LABELS: Record<WorkOrderKind, string> = {
  maintenance: "Manutenzione",
  installation: "Installazione",
  repair: "Riparazione",
  inspection: "Sopralluogo / verifica",
  emergency: "Urgenza",
  other: "Altro",
};
export const WORK_ORDER_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];
export const WORK_ORDER_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  low: "Bassa",
  normal: "Normale",
  high: "Alta",
  urgent: "Urgente",
};

const TZ = "Europe/Rome";
const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface WorkOrderAssignee {
  employeeId: string;
  name: string;
  isLead: boolean;
  isMe: boolean;
}

export interface WorkOrderRow {
  id: string;
  number: string;
  title: string;
  kind: WorkOrderKind;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  /** ora italiana, "AAAA-MM-GGTHH:MM" */
  start: string;
  end: string;
  customerId: string | null;
  customerName: string | null;
  projectId: string | null;
  projectLabel: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  assignees: WorkOrderAssignee[];
  isMine: boolean;
}

export interface WorkOrderEvent {
  at: Date;
  fromStatus: WorkOrderStatus | null;
  toStatus: WorkOrderStatus;
  reason: string | null;
  actorName: string | null;
}

export interface WorkOrderDetail extends WorkOrderRow {
  customerSiteId: string | null;
  projectSiteId: string | null;
  siteName: string | null;
  customerPhone: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  description: string | null;
  fieldNotes: string | null;
  statusReason: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  workReportId: string | null;
  events: WorkOrderEvent[];
  /** l'utente può pianificare (modificare orari, squadra, annullare) */
  canPlan: boolean;
}

const local = (col: string) => `to_char(${col} at time zone '${TZ}', 'YYYY-MM-DD"T"HH24:MI')`;

const SELECT = `
  w.id, w.number, w.title, w.kind, w.priority, w.status,
  ${local("w.scheduled_start")} as start, ${local("w.scheduled_end")} as "end",
  w.customer_id as "customerId", c.display_name as "customerName",
  w.project_id as "projectId",
  case when p.id is null then null else p.code || ' · ' || p.name end as "projectLabel",
  nullif(concat_ws(', ', w.address_line, nullif(concat_ws(' ', w.postal_code, w.city,
    case when w.province is null then null else '(' || w.province || ')' end), '')), '') as address,
  w.latitude::float8 as latitude, w.longitude::float8 as longitude,
  coalesce((select json_agg(json_build_object(
              'employeeId', e.id, 'name', concat_ws(' ', e.first_name, e.last_name),
              'isLead', a.is_lead, 'isMe', coalesce(e.user_id = auth.uid(), false))
              order by a.is_lead desc, lower(e.last_name))
              from public.work_order_assignees a
              join public.employees e on e.tenant_id = a.tenant_id and e.id = a.employee_id
             where a.tenant_id = w.tenant_id and a.work_order_id = w.id), '[]'::json) as assignees,
  app.work_order_is_mine(w.tenant_id, w.id) as "isMine"`;

const FROM = `
  public.work_orders w
  left join public.customers c on c.tenant_id = w.tenant_id and c.id = w.customer_id
  left join public.projects p on p.tenant_id = w.tenant_id and p.id = w.project_id`;

export interface WorkOrderQuery {
  /** giorno iniziale e finale (inclusi), ora italiana */
  from?: string;
  to?: string;
  status?: string;
  /** solo quelli in cui sono in squadra */
  mine?: boolean;
  employeeId?: string;
  q?: string;
}

/** Interventi nel periodo (massimo 62 giorni, 500 righe), in ordine di orario. */
export async function listWorkOrders(
  tx: UserTx,
  access: TenantAccess,
  q: WorkOrderQuery = {},
): Promise<WorkOrderRow[]> {
  requirePermission(access, "work_orders.read");
  const from = q.from && isoDate.test(q.from) ? q.from : null;
  const to = q.to && isoDate.test(q.to) ? q.to : null;
  const params: unknown[] = [access.tenantId];
  const where = ["w.tenant_id = $1", "w.deleted_at is null"];
  if (from) {
    params.push(from);
    where.push(`w.scheduled_end >= ($${params.length}::date)::timestamp at time zone '${TZ}'`);
  }
  if (to) {
    params.push(to);
    where.push(
      `w.scheduled_start < (($${params.length}::date) + 1)::timestamp at time zone '${TZ}'`,
    );
  }
  if (from && to && Date.parse(to) - Date.parse(from) > 62 * 86_400_000) {
    throw new ValidationError({ form: "Scegli un periodo di al massimo due mesi" });
  }
  const status = q.status ?? "all";
  if (status === "open") where.push("w.status in ('scheduled', 'in_progress', 'suspended')");
  else if ((WORK_ORDER_STATUSES as readonly string[]).includes(status)) {
    params.push(status);
    where.push(`w.status = $${params.length}`);
  }
  if (q.mine) where.push("app.work_order_is_mine(w.tenant_id, w.id)");
  if (isUuid(q.employeeId)) {
    params.push(q.employeeId);
    where.push(`exists (select 1 from public.work_order_assignees a
                         where a.tenant_id = w.tenant_id and a.work_order_id = w.id
                           and a.employee_id = $${params.length})`);
  }
  const term = (q.q ?? "").trim().slice(0, 100);
  if (term) {
    params.push(likePattern(term.toLowerCase()));
    where.push(
      `lower(concat_ws(' ', w.number, w.title, c.display_name, p.code, p.name, w.address_line, w.city))
       like $${params.length}`,
    );
  }
  const { rows } = await tx.query<WorkOrderRow>(
    `select ${SELECT} from ${FROM}
      where ${where.join(" and ")}
      order by w.scheduled_start, w.number limit 500`,
    params,
  );
  return rows;
}

export async function getWorkOrder(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<WorkOrderDetail | null> {
  requirePermission(access, "work_orders.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<Omit<WorkOrderDetail, "events" | "canPlan">>(
    `select ${SELECT},
            w.customer_site_id as "customerSiteId", w.project_site_id as "projectSiteId",
            coalesce(ps.name, cs.name) as "siteName", c.phone as "customerPhone",
            w.address_line as "addressLine", w.postal_code as "postalCode", w.city, w.province,
            w.description, w.field_notes as "fieldNotes", w.status_reason as "statusReason",
            w.started_at as "startedAt", w.completed_at as "completedAt",
            w.work_report_id as "workReportId"
       from ${FROM}
       left join public.project_sites ps on ps.tenant_id = w.tenant_id and ps.id = w.project_site_id
       left join public.customer_sites cs on cs.tenant_id = w.tenant_id and cs.id = w.customer_site_id
      where w.tenant_id = $1 and w.id = $2 and w.deleted_at is null`,
    [access.tenantId, id],
  );
  const row = rows[0];
  if (!row) return null;
  const { rows: events } = await tx.query<WorkOrderEvent>(
    `select ev.created_at as at, ev.from_status as "fromStatus", ev.to_status as "toStatus",
            ev.reason, u.full_name as "actorName"
       from public.work_order_events ev
       left join public.users u on u.id = ev.actor_user_id
      where ev.tenant_id = $1 and ev.work_order_id = $2
      order by ev.created_at, ev.id`,
    [access.tenantId, id],
  );
  return { ...row, events, canPlan: hasPermission(access, "work_orders.write") };
}

// --- Scrittura ---------------------------------------------------------------------

const saveInput = z
  .object({
    title: z.string().trim().min(1, "Scrivi cosa c'è da fare").max(200, "Massimo 200 caratteri"),
    kind: z.enum(WORK_ORDER_KINDS).default("other"),
    priority: z.enum(WORK_ORDER_PRIORITIES).default("normal"),
    customerId: optional(z.uuid("Cliente non valido")),
    customerSiteId: optional(z.uuid("Sede non valida")),
    projectId: optional(z.uuid("Commessa non valida")),
    projectSiteId: optional(z.uuid("Cantiere non valido")),
    date: z.string().regex(isoDate, "Data non valida"),
    startTime: z.string().regex(hhmm, "Ora non valida (es. 08:30)"),
    endDate: optional(z.string().regex(isoDate, "Data non valida")),
    endTime: z.string().regex(hhmm, "Ora non valida (es. 12:00)"),
    addressLine: optional(z.string().trim().max(300)),
    postalCode: optional(z.string().trim().max(20)),
    city: optional(z.string().trim().max(120)),
    province: optional(z.string().trim().max(10)),
    description: optional(z.string().trim().max(8000, "Massimo 8000 caratteri")),
    employeeIds: z.array(z.uuid()).max(30, "Al massimo 30 persone").default([]),
    leadEmployeeId: optional(z.uuid()),
    teamId: optional(z.uuid()),
  })
  .refine((d) => `${d.endDate ?? d.date}T${d.endTime}` > `${d.date}T${d.startTime}`, {
    message: "La fine deve essere dopo l'inizio",
    path: ["endTime"],
  });
export type WorkOrderSaveInput = z.input<typeof saveInput>;

function mapWriteError(error: unknown): never {
  if (error instanceof ValidationError) throw error;
  const code = pgCode(error);
  const message = error instanceof Error ? error.message : "";
  if (code === "23514") {
    if (/cantiere/i.test(message)) throw new ValidationError({ projectSiteId: message });
    if (/commessa/i.test(message)) throw new ValidationError({ projectId: message });
    if (/sede/i.test(message)) throw new ValidationError({ customerSiteId: message });
    if (/passaggio/i.test(message)) throw new ValidationError({ form: message });
    if (/schedule_chk/.test(message))
      throw new ValidationError({
        endTime: "La fine deve essere dopo l'inizio (al massimo 31 giorni)",
      });
    if (/reason_chk/.test(message)) throw new ValidationError({ reason: "Scrivi il motivo" });
    throw new ValidationError({ form: "Dati non validi" });
  }
  if (code === "23503") throw new ValidationError({ form: "Elemento collegato non trovato" });
  if (code === "23505") throw new ValidationError({ form: "Persona già in squadra" });
  if (code === "42501") {
    if (/intervent|campo|stato/i.test(message)) throw new ValidationError({ form: message });
    throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
  }
  throw error;
}

async function guarded<T>(tx: UserTx, name: string, fn: () => Promise<T>): Promise<T> {
  await tx.query(`savepoint ${name}`);
  try {
    const r = await fn();
    await tx.query(`release savepoint ${name}`);
    return r;
  } catch (error) {
    await tx.query(`rollback to savepoint ${name}`);
    mapWriteError(error);
  }
}

/** Persone della squadra: scelte una per una, più i membri di una squadra esistente. */
async function resolveCrew(
  tx: UserTx,
  access: TenantAccess,
  d: z.output<typeof saveInput>,
): Promise<{ ids: string[]; lead: string | null }> {
  const ids = new Set(d.employeeIds);
  let lead = d.leadEmployeeId ?? null;
  if (d.teamId) {
    const { rows } = await tx.query<{ employee_id: string; leader: string | null }>(
      `select m.employee_id, t.leader_employee_id as leader
         from public.teams t
         join public.team_members m on m.tenant_id = t.tenant_id and m.team_id = t.id
         join public.employees e on e.tenant_id = m.tenant_id and e.id = m.employee_id
        where t.tenant_id = $1 and t.id = $2 and t.deleted_at is null
          and e.deleted_at is null and e.is_active`,
      [access.tenantId, d.teamId],
    );
    for (const r of rows) ids.add(r.employee_id);
    lead ??= rows[0]?.leader ?? null;
  }
  if (ids.size > 30) throw new ValidationError({ employeeIds: "Al massimo 30 persone" });
  if (lead && !ids.has(lead)) lead = null;
  return { ids: [...ids], lead };
}

async function writeCrew(
  tx: UserTx,
  access: TenantAccess,
  orderId: string,
  crew: { ids: string[]; lead: string | null },
): Promise<void> {
  // toglie chi non c'è più, aggiorna il capo squadra, aggiunge i nuovi (gli avvisi partono solo per loro)
  await tx.query(
    `delete from public.work_order_assignees
      where tenant_id = $1 and work_order_id = $2 and not (employee_id = any($3::uuid[]))`,
    [access.tenantId, orderId, crew.ids],
  );
  await tx.query(
    `update public.work_order_assignees set is_lead = false
      where tenant_id = $1 and work_order_id = $2 and is_lead and employee_id is distinct from $3`,
    [access.tenantId, orderId, crew.lead],
  );
  for (const employeeId of crew.ids) {
    await tx.query(
      `insert into public.work_order_assignees (tenant_id, work_order_id, employee_id, is_lead)
       values ($1, $2, $3, $4)
       on conflict (tenant_id, work_order_id, employee_id) do update set is_lead = excluded.is_lead
       where work_order_assignees.is_lead is distinct from excluded.is_lead`,
      [access.tenantId, orderId, employeeId, employeeId === crew.lead],
    );
  }
}

const startSql = `(($1::date)::text || ' ' || $2)::timestamp at time zone '${TZ}'`;

export async function createWorkOrder(
  tx: UserTx,
  access: TenantAccess,
  input: WorkOrderSaveInput,
): Promise<{ id: string; number: string }> {
  requirePermission(access, "work_orders.write");
  const d = parseInput(saveInput, input);
  return guarded(tx, "create_work_order", async () => {
    const crew = await resolveCrew(tx, access, d);
    const { rows } = await tx.query<{ id: string; number: string }>(
      `insert into public.work_orders (tenant_id, title, kind, priority, customer_id, customer_site_id,
              project_id, project_site_id, scheduled_start, scheduled_end,
              address_line, postal_code, city, province, description)
       values ($3, $4, $5, $6, $7, $8, $9, $10, ${startSql},
               (($11::date)::text || ' ' || $12)::timestamp at time zone '${TZ}',
               $13, $14, $15, $16, $17)
       returning id, number`,
      [
        d.date,
        d.startTime,
        access.tenantId,
        d.title,
        d.kind,
        d.priority,
        d.customerId ?? null,
        d.customerSiteId ?? null,
        d.projectId ?? null,
        d.projectSiteId ?? null,
        d.endDate ?? d.date,
        d.endTime,
        d.addressLine ?? null,
        d.postalCode ?? null,
        d.city ?? null,
        d.province ?? null,
        d.description ?? null,
      ],
    );
    const created = rows[0]!;
    await writeCrew(tx, access, created.id, crew);
    return created;
  });
}

export async function updateWorkOrder(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: WorkOrderSaveInput,
): Promise<void> {
  requirePermission(access, "work_orders.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Intervento non trovato" });
  const d = parseInput(saveInput, input);
  await guarded(tx, "update_work_order", async () => {
    const crew = await resolveCrew(tx, access, d);
    const { rowCount } = await tx.query(
      `update public.work_orders set title = $4, kind = $5, priority = $6, customer_id = $7,
              customer_site_id = $8, project_id = $9, project_site_id = $10,
              scheduled_start = ${startSql},
              scheduled_end = (($11::date)::text || ' ' || $12)::timestamp at time zone '${TZ}',
              address_line = $13, postal_code = $14, city = $15, province = $16, description = $17
        where tenant_id = $3 and id = $18 and deleted_at is null`,
      [
        d.date,
        d.startTime,
        access.tenantId,
        d.title,
        d.kind,
        d.priority,
        d.customerId ?? null,
        d.customerSiteId ?? null,
        d.projectId ?? null,
        d.projectSiteId ?? null,
        d.endDate ?? d.date,
        d.endTime,
        d.addressLine ?? null,
        d.postalCode ?? null,
        d.city ?? null,
        d.province ?? null,
        d.description ?? null,
        id,
      ],
    );
    if (rowCount === 0) throw new ValidationError({ form: "Intervento non trovato" });
    await writeCrew(tx, access, id, crew);
  });
}

export type WorkOrderTransition =
  "start" | "suspend" | "resume" | "complete" | "cancel" | "reopen" | "restore";

const TRANSITIONS: Record<
  WorkOrderTransition,
  { from: WorkOrderStatus[]; to: WorkOrderStatus; plan?: true }
> = {
  start: { from: ["scheduled"], to: "in_progress" },
  suspend: { from: ["scheduled", "in_progress"], to: "suspended" },
  resume: { from: ["suspended"], to: "in_progress" },
  complete: { from: ["in_progress", "suspended"], to: "completed" },
  cancel: { from: ["scheduled", "in_progress", "suspended"], to: "cancelled", plan: true },
  reopen: { from: ["completed"], to: "in_progress", plan: true },
  restore: { from: ["cancelled"], to: "scheduled", plan: true },
};

/** Cambio di stato; il database ricontrolla chi può farlo e su quali interventi. */
export async function changeWorkOrderStatus(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  action: WorkOrderTransition,
  reason?: string,
): Promise<WorkOrderStatus> {
  const t = TRANSITIONS[action];
  if (!t) throw new ValidationError({ form: "Azione non valida" });
  requirePermission(access, t.plan ? "work_orders.write" : "work_orders.read");
  if (!isUuid(id)) throw new ValidationError({ form: "Intervento non trovato" });
  const why = reason?.trim() ?? "";
  if ((t.to === "suspended" || t.to === "cancelled") && !why)
    throw new ValidationError({ reason: "Scrivi il motivo" });
  if (why.length > 1000) throw new ValidationError({ reason: "Massimo 1000 caratteri" });
  await guarded(tx, "work_order_status", async () => {
    const { rowCount } = await tx.query(
      `update public.work_orders set status = $4, status_reason = nullif($5, '')
        where tenant_id = $1 and id = $2 and status = any($3::text[]) and deleted_at is null`,
      [access.tenantId, id, t.from, t.to, why],
    );
    if (rowCount === 0)
      throw new ValidationError({
        form: "Lo stato dell'intervento è cambiato. Ricarica la pagina.",
      });
  });
  return t.to;
}

/** Note dal campo (chi è in squadra o chi pianifica). */
export async function saveWorkOrderNotes(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  notes: string,
): Promise<void> {
  requirePermission(access, "work_orders.read");
  if (!isUuid(id)) throw new ValidationError({ form: "Intervento non trovato" });
  const text = notes.trim();
  if (text.length > 4000) throw new ValidationError({ fieldNotes: "Massimo 4000 caratteri" });
  await guarded(tx, "work_order_notes", async () => {
    const { rowCount } = await tx.query(
      `update public.work_orders set field_notes = nullif($3, '')
        where tenant_id = $1 and id = $2 and deleted_at is null`,
      [access.tenantId, id, text],
    );
    if (rowCount === 0) throw new ValidationError({ form: "Intervento non trovato" });
  });
}

export async function deleteWorkOrder(tx: UserTx, access: TenantAccess, id: string): Promise<void> {
  requirePermission(access, "work_orders.delete");
  if (!isUuid(id)) return;
  await guarded(tx, "delete_work_order", async () => {
    await tx.query(
      `update public.work_orders set deleted_at = now()
        where tenant_id = $1 and id = $2 and deleted_at is null`,
      [access.tenantId, id],
    );
  });
}

// --- Opzioni per il modulo -------------------------------------------------------

export interface WorkOrderOptions {
  customers: { id: string; name: string; sites: { id: string; name: string }[] }[];
  projects: {
    id: string;
    label: string;
    customerId: string;
    sites: { id: string; name: string }[];
  }[];
  employees: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}

export async function loadWorkOrderOptions(
  tx: UserTx,
  access: TenantAccess,
): Promise<WorkOrderOptions> {
  requirePermission(access, "work_orders.write");
  // una query alla volta: la transazione usa una sola connessione
  const customers = await tx.query<WorkOrderOptions["customers"][number]>(
    `select c.id, c.display_name as name,
              coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name) order by s.name)
                          from public.customer_sites s
                         where s.tenant_id = c.tenant_id and s.customer_id = c.id
                           and s.deleted_at is null and s.is_active), '[]'::json) as sites
         from public.customers c
        where c.tenant_id = $1 and c.deleted_at is null and c.is_active
        order by lower(c.display_name) limit 1000`,
    [access.tenantId],
  );
  const projects = await tx.query<WorkOrderOptions["projects"][number]>(
    `select p.id, p.code || ' · ' || p.name as label, p.customer_id as "customerId",
              coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name) order by s.created_at)
                          from public.project_sites s
                         where s.tenant_id = p.tenant_id and s.project_id = p.id and s.deleted_at is null
                           and s.status <> 'closed'), '[]'::json) as sites
         from public.projects p
        where p.tenant_id = $1 and p.deleted_at is null and p.status in ('quote', 'active', 'suspended')
        order by lower(p.code) desc limit 500`,
    [access.tenantId],
  );
  const employees = await tx.query<{ id: string; name: string }>(
    `select id, concat_ws(' ', first_name, last_name) as name
         from public.employees
        where tenant_id = $1 and deleted_at is null and is_active
        order by lower(last_name), lower(first_name) limit 500`,
    [access.tenantId],
  );
  const teams = await tx.query<{ id: string; name: string }>(
    `select id, name from public.teams
        where tenant_id = $1 and deleted_at is null and is_active
        order by lower(name) limit 200`,
    [access.tenantId],
  );
  return {
    customers: customers.rows,
    projects: projects.rows,
    employees: employees.rows,
    teams: teams.rows,
  };
}
