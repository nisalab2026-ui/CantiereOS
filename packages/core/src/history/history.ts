import { z } from "zod";
import { requirePermission, type TenantAccess } from "../auth/access";
import type { UserTx } from "../db/transaction";
import {
  fieldLabel,
  formatFieldValue,
  isReferenceField,
  recordTitle,
  TABLE_LABELS,
} from "./labels";

/**
 * Storico leggibile costruito dall'audit log immutabile. Ogni evento dice chi,
 * quando, cosa e, per le modifiche, il valore precedente e quello nuovo.
 */
export type HistoryVerb =
  | "created"
  | "updated"
  | "deleted"
  | "archived"
  | "restored"
  | "completed"
  | "reopened"
  | "cancelled";

export interface FieldChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export interface HistoryEvent {
  id: string;
  at: Date;
  actorId: string | null;
  actorName: string | null;
  verb: HistoryVerb;
  table: string;
  tableLabel: string;
  recordId: string | null;
  recordTitle: string | null;
  /** Pagina dell'elemento, se esiste una scheda. */
  href: string | null;
  changes: FieldChange[];
}

interface AuditRow {
  id: string;
  created_at: Date;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
}

const REF_TARGETS: Record<string, { sql: string }> = {
  customer_id: {
    sql: "select id, display_name as name from public.customers where tenant_id = $1 and id = any($2)",
  },
  supplier_id: {
    sql: "select id, display_name as name from public.suppliers where tenant_id = $1 and id = any($2)",
  },
  employee_id: {
    sql: "select id, concat_ws(' ', first_name, last_name) as name from public.employees where tenant_id = $1 and id = any($2)",
  },
  leader_employee_id: {
    sql: "select id, concat_ws(' ', first_name, last_name) as name from public.employees where tenant_id = $1 and id = any($2)",
  },
  team_id: { sql: "select id, name from public.teams where tenant_id = $1 and id = any($2)" },
  responsible_user_id: {
    sql: "select id, coalesce(full_name, email) as name from public.users where $1::uuid is not null and id = any($2)",
  },
  user_id: {
    sql: "select id, coalesce(full_name, email) as name from public.users where $1::uuid is not null and id = any($2)",
  },
  role_id: { sql: "select id, name from public.roles where $1::uuid is not null and id = any($2)" },
};

const HREF_TABLES = new Set(["customers", "employees", "deadlines"]);

function verbOf(row: AuditRow): HistoryVerb {
  if (row.action === "INSERT") return "created";
  if (row.action === "DELETE") return "deleted";
  const changed = new Set(row.changed_fields ?? []);
  const n = row.new_data ?? {};
  const o = row.old_data ?? {};
  if (changed.has("deleted_at") && n.deleted_at) return "deleted";
  if (changed.has("status") && row.table_name === "deadlines") {
    if (n.status === "done") return "completed";
    if (n.status === "cancelled") return "cancelled";
    if (o.status !== "open" && n.status === "open") return "reopened";
  }
  if (changed.has("is_active") && n.is_active === false) return "archived";
  if (changed.has("is_active") && n.is_active === true) return "restored";
  return "updated";
}

async function buildEvents(
  tx: UserTx,
  tenantId: string,
  rows: AuditRow[],
): Promise<HistoryEvent[]> {
  // raccoglie i riferimenti (id → nome) da risolvere in blocco, con RLS
  const refIds = new Map<string, Set<string>>();
  for (const r of rows) {
    const table = r.table_name ?? "";
    for (const data of [r.old_data, r.new_data]) {
      if (!data) continue;
      for (const [field, value] of Object.entries(data)) {
        if (typeof value === "string" && REF_TARGETS[field] && isReferenceField(table, field)) {
          if (!refIds.has(field)) refIds.set(field, new Set());
          refIds.get(field)!.add(value);
        }
      }
    }
  }
  const names = new Map<string, string>();
  for (const [field, ids] of refIds) {
    const { rows: found } = await tx.query<{ id: string; name: string }>(REF_TARGETS[field]!.sql, [
      tenantId,
      [...ids],
    ]);
    for (const f of found) names.set(`${field}:${f.id}`, f.name);
  }
  const show = (table: string, field: string, value: unknown) => {
    if (value == null || value === "") return null;
    if (isReferenceField(table, field))
      return names.get(`${field}:${String(value)}`) ?? "(non disponibile)";
    return formatFieldValue(table, field, value);
  };

  return rows.map((r) => {
    const table = r.table_name ?? "";
    const verb = verbOf(r);
    const changes: FieldChange[] = [];
    const fields =
      r.action === "UPDATE"
        ? (r.changed_fields ?? [])
        : Object.keys((r.action === "INSERT" ? r.new_data : r.old_data) ?? {});
    for (const field of fields) {
      const label = fieldLabel(table, field);
      if (!label) continue; // campo tecnico
      const before = r.action === "INSERT" ? null : show(table, field, r.old_data?.[field]);
      const after = r.action === "DELETE" ? null : show(table, field, r.new_data?.[field]);
      if (before === null && after === null) continue;
      changes.push({ field, label, before, after });
    }
    const meta = TABLE_LABELS[table];
    return {
      id: String(r.id),
      at: r.created_at,
      actorId: r.actor_user_id,
      actorName: r.actor_name,
      verb,
      table,
      tableLabel: meta?.one ?? table,
      recordId: r.record_id,
      recordTitle: recordTitle(table, r.new_data ?? r.old_data),
      href:
        meta?.href && r.record_id && HREF_TABLES.has(table) && verb !== "deleted"
          ? `${meta.href}/${r.record_id}`
          : (meta?.href ?? null),
      changes,
    };
  });
}

export const HISTORY_TABLES = [
  "customers",
  "suppliers",
  "employees",
  "teams",
  "deadlines",
] as const;
export type HistoryTable = (typeof HISTORY_TABLES)[number];

/**
 * Cronologia di un elemento (e delle scadenze collegate). Basta poter leggere
 * l'elemento: il controllo lo fa il database in app.record_history.
 */
export async function getRecordHistory(
  tx: UserTx,
  access: TenantAccess,
  table: HistoryTable,
  recordId: string,
  limit = 200,
): Promise<HistoryEvent[]> {
  if (!z.uuid().safeParse(recordId).success) return [];
  const { rows } = await tx.query<AuditRow>("select * from app.record_history($1, $2, $3)", [
    table,
    recordId,
    limit,
  ]);
  return buildEvents(tx, access.tenantId, rows);
}

export interface ActivityFilter {
  table?: string;
  actorId?: string;
  verb?: "created" | "updated" | "deleted";
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  q?: string;
  before?: string; // cursore: id dell'ultimo evento della pagina precedente
  limit?: number;
}

export interface ActivityPage {
  events: HistoryEvent[];
  nextCursor: string | null;
}

const ACTIVITY_HIDDEN_TABLES = ["notifications"];
const ACTION_BY_VERB = { created: "INSERT", updated: "UPDATE", deleted: "DELETE" } as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Registro attività completo dell'azienda (permesso audit.read, con MFA).
 * Paginazione per cursore: stabile anche mentre arrivano nuovi eventi.
 */
export async function listActivity(
  tx: UserTx,
  access: TenantAccess,
  f: ActivityFilter,
): Promise<ActivityPage> {
  requirePermission(access, "audit.read");
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const params: unknown[] = [access.tenantId, ACTIVITY_HIDDEN_TABLES];
  const where = ["a.tenant_id = $1", "not (a.table_name = any($2))"];
  if (f.table && TABLE_LABELS[f.table]) {
    params.push(f.table);
    where.push(`a.table_name = $${params.length}`);
  }
  if (f.actorId && z.uuid().safeParse(f.actorId).success) {
    params.push(f.actorId);
    where.push(`a.actor_user_id = $${params.length}`);
  }
  if (f.verb && ACTION_BY_VERB[f.verb]) {
    params.push(ACTION_BY_VERB[f.verb]);
    where.push(`a.action = $${params.length}`);
  }
  if (f.from && isoDate.safeParse(f.from).success) {
    params.push(f.from);
    where.push(`a.created_at >= ($${params.length}::date at time zone 'Europe/Rome')`);
  }
  if (f.to && isoDate.safeParse(f.to).success) {
    params.push(f.to);
    where.push(`a.created_at < (($${params.length}::date + 1) at time zone 'Europe/Rome')`);
  }
  const term = (f.q ?? "").trim().slice(0, 100);
  if (term) {
    params.push(`%${term.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`lower(coalesce(a.new_data, a.old_data)::text) like $${params.length}`);
  }
  if (f.before && /^\d{1,19}$/.test(f.before)) {
    params.push(f.before);
    where.push(`a.id < $${params.length}::bigint`);
  }
  params.push(limit + 1);
  const { rows } = await tx.query<AuditRow>(
    `select a.id, a.created_at, a.actor_user_id, coalesce(u.full_name, u.email) as actor_name,
            a.action, a.table_name, a.record_id, a.old_data, a.new_data, a.changed_fields
       from public.audit_log a
       left join public.users u on u.id = a.actor_user_id
      where ${where.join(" and ")}
      order by a.id desc
      limit $${params.length}`,
    params,
  );
  const page = rows.slice(0, limit);
  return {
    events: await buildEvents(tx, access.tenantId, page),
    nextCursor: rows.length > limit ? String(page[page.length - 1]!.id) : null,
  };
}

/** Utenti dell'azienda che compaiono come autori (per il filtro del registro). */
export async function listActivityActors(
  tx: UserTx,
  access: TenantAccess,
): Promise<{ id: string; name: string }[]> {
  requirePermission(access, "audit.read");
  const { rows } = await tx.query<{ id: string; name: string }>(
    `select u.id, coalesce(u.full_name, u.email) as name
       from public.memberships m join public.users u on u.id = m.user_id
      where m.tenant_id = $1
      order by lower(coalesce(u.full_name, u.email))`,
    [access.tenantId],
  );
  return rows;
}
