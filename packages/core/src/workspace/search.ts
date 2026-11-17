import { hasPermission, type TenantAccess } from "../auth/access";
import type { UserTx } from "../db/transaction";

export type SearchKind =
  "customer" | "supplier" | "employee" | "team" | "deadline" | "document" | "task";

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
}

/** Escape dei caratteri speciali di LIKE: la ricerca è sempre letterale. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Ricerca globale nell'azienda attiva. Ogni sorgente è interrogata solo se
 * l'utente ha il permesso di lettura; le RLS applicano comunque gli stessi limiti.
 */
export async function globalSearch(
  tx: UserTx,
  access: TenantAccess,
  rawTerm: string,
  perKind = 5,
): Promise<SearchResult[]> {
  const term = rawTerm.trim().slice(0, 100);
  if (term.length < 2) return [];
  const pattern = likePattern(term.toLowerCase());
  const limit = Math.min(Math.max(perKind, 1), 20);
  const t = access.tenantId;
  const results: SearchResult[] = [];

  if (hasPermission(access, "customers.read")) {
    const { rows } = await tx.query<SearchResult>(
      `select 'customer' as kind, id, display_name as title,
              nullif(concat_ws(' · ', code, billing_city), '') as subtitle
         from public.customers
        where tenant_id = $1 and deleted_at is null
          and (lower(display_name) like $2 or lower(coalesce(code, '')) like $2
               or lower(coalesce(vat_number, '')) like $2)
        order by lower(display_name) limit $3`,
      [t, pattern, limit],
    );
    results.push(...rows);
  }
  if (hasPermission(access, "suppliers.read")) {
    const { rows } = await tx.query<SearchResult>(
      `select 'supplier' as kind, id, display_name as title,
              nullif(concat_ws(' · ', code, category), '') as subtitle
         from public.suppliers
        where tenant_id = $1 and deleted_at is null
          and (lower(display_name) like $2 or lower(coalesce(code, '')) like $2
               or lower(coalesce(vat_number, '')) like $2)
        order by lower(display_name) limit $3`,
      [t, pattern, limit],
    );
    results.push(...rows);
  }
  if (hasPermission(access, "employees.read")) {
    const { rows } = await tx.query<SearchResult>(
      `select 'employee' as kind, id, concat_ws(' ', first_name, last_name) as title, job_title as subtitle
         from public.employees
        where tenant_id = $1 and deleted_at is null
          and lower(concat_ws(' ', first_name, last_name, employee_code)) like $2
        order by lower(last_name), lower(first_name) limit $3`,
      [t, pattern, limit],
    );
    results.push(...rows);
  }
  if (hasPermission(access, "teams.read")) {
    const { rows } = await tx.query<SearchResult>(
      `select 'team' as kind, id, name as title, null as subtitle
         from public.teams
        where tenant_id = $1 and deleted_at is null and lower(name) like $2
        order by lower(name) limit $3`,
      [t, pattern, limit],
    );
    results.push(...rows);
  }
  if (hasPermission(access, "deadlines.read")) {
    const { rows } = await tx.query<SearchResult>(
      `select 'deadline' as kind, id, title,
              concat_ws(' · ', to_char(due_date, 'DD/MM/YYYY'), reference_code) as subtitle
         from public.deadlines
        where tenant_id = $1 and deleted_at is null
          and lower(concat_ws(' ', title, reference_code)) like $2
        order by (status = 'open') desc, due_date limit $3`,
      [t, pattern, limit],
    );
    results.push(...rows);
  }
  if (hasPermission(access, "tasks.read")) {
    const { rows } = await tx.query<SearchResult>(
      `select 'task' as kind, id, title,
              concat_ws(' · ', case status when 'todo' then 'Da fare' when 'in_progress' then 'In corso'
                                          when 'done' then 'Completata' else 'Annullata' end,
                        'entro il ' || to_char(due_date, 'DD/MM/YYYY')) as subtitle
         from public.tasks
        where tenant_id = $1 and deleted_at is null
          and lower(title) like $2
        order by (status in ('todo','in_progress')) desc, due_date nulls last limit $3`,
      [t, pattern, limit],
    );
    results.push(...rows);
  }
  if (hasPermission(access, "documents.read")) {
    // RLS nasconde i riservati a chi non ha il permesso dedicato
    const { rows } = await tx.query<SearchResult>(
      `select 'document' as kind, d.id, d.title, v.original_name as subtitle
         from public.documents d
         left join public.document_versions v on v.tenant_id = d.tenant_id and v.id = d.current_version_id
        where d.tenant_id = $1 and d.deleted_at is null
          and (lower(d.title) like $2 or lower(coalesce(v.original_name, '')) like $2)
        order by d.updated_at desc limit $3`,
      [t, pattern, limit],
    );
    results.push(...rows);
  }
  return results;
}
