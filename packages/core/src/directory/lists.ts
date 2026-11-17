import { z } from "zod";
import { requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { UserTx } from "../db/transaction";
import { likePattern } from "../workspace/search";
import { optional, parseInput, ValidationError } from "../validation";

/**
 * Liste delle anagrafiche (clienti, fornitori, personale, squadre) con
 * ricerca, filtri, ordinamento e paginazione. Ordinamenti e filtri sono
 * whitelist: dall'esterno arrivano solo chiavi, mai frammenti SQL.
 */
export interface ListQuery {
  q?: string;
  id?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  status?: "active" | "inactive";
  type?: string;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface ListSpec {
  from: string;
  select: string;
  searchExpr: string;
  sorts: Record<string, string>;
  defaultSort: string;
  extraWhere?: (q: ListQuery, params: unknown[]) => string[];
}

async function runList<T>(
  tx: UserTx,
  access: TenantAccess,
  spec: ListSpec,
  q: ListQuery,
): Promise<Page<T>> {
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), 100);
  const page = Math.min(Math.max(q.page ?? 1, 1), 10_000);
  const params: unknown[] = [access.tenantId];
  const where = ["x.tenant_id = $1", "x.deleted_at is null"];
  if (q.id && z.uuid().safeParse(q.id).success) {
    params.push(q.id);
    where.push(`x.id = $${params.length}`);
  }
  const term = (q.q ?? "").trim().slice(0, 100);
  if (term.length > 0) {
    params.push(likePattern(term.toLowerCase()));
    where.push(`${spec.searchExpr} like $${params.length}`);
  }
  if (q.status === "active") where.push("x.is_active");
  if (q.status === "inactive") where.push("not x.is_active");
  where.push(...(spec.extraWhere?.(q, params) ?? []));
  const sortCol = spec.sorts[q.sort ?? ""] ?? spec.sorts[spec.defaultSort]!;
  const dir = q.dir === "desc" ? "desc" : "asc";
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await tx.query<T & { __total: number }>(
    `select ${spec.select}, count(*) over ()::int as "__total"
       from ${spec.from}
      where ${where.join(" and ")}
      order by ${sortCol} ${dir} nulls last, x.id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  const total = rows[0]?.__total ?? 0;
  return { rows: rows.map(({ __total: _, ...r }) => r as T), total, page, pageSize };
}

export interface CustomerRow {
  id: string;
  code: string | null;
  displayName: string;
  partyType: "company" | "individual" | "public_entity";
  vatNumber: string | null;
  city: string | null;
  province: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  sites: number;
}

export const CUSTOMER_SORTS = ["name", "code", "city", "created"] as const;

export function listCustomers(
  tx: UserTx,
  access: TenantAccess,
  q: ListQuery,
): Promise<Page<CustomerRow>> {
  requirePermission(access, "customers.read");
  return runList<CustomerRow>(
    tx,
    access,
    {
      from: "public.customers x",
      select: `x.id, x.code, x.display_name as "displayName", x.party_type as "partyType", x.vat_number as "vatNumber",
             x.billing_city as city, x.billing_province as province, x.email, x.phone, x.is_active as "isActive",
             (select count(*)::int from public.customer_sites s where s.tenant_id = x.tenant_id and s.customer_id = x.id and s.deleted_at is null) as sites`,
      searchExpr: "lower(concat_ws(' ', x.display_name, x.code, x.vat_number, x.billing_city))",
      sorts: {
        name: "lower(x.display_name)",
        code: "x.code",
        city: "lower(x.billing_city)",
        created: "x.created_at",
      },
      defaultSort: "name",
      extraWhere: (query, params) => {
        if (query.type && ["company", "individual", "public_entity"].includes(query.type)) {
          params.push(query.type);
          return [`x.party_type = $${params.length}::public.party_type`];
        }
        return [];
      },
    },
    q,
  );
}

export interface SupplierRow {
  id: string;
  code: string | null;
  displayName: string;
  category: string | null;
  city: string | null;
  province: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
}

export const SUPPLIER_SORTS = ["name", "code", "category", "city"] as const;

export function listSuppliers(
  tx: UserTx,
  access: TenantAccess,
  q: ListQuery,
): Promise<Page<SupplierRow>> {
  requirePermission(access, "suppliers.read");
  return runList<SupplierRow>(
    tx,
    access,
    {
      from: "public.suppliers x",
      select: `x.id, x.code, x.display_name as "displayName", x.category, x.city, x.province, x.email, x.phone,
             x.is_active as "isActive"`,
      searchExpr: "lower(concat_ws(' ', x.display_name, x.code, x.vat_number, x.category, x.city))",
      sorts: {
        name: "lower(x.display_name)",
        code: "x.code",
        category: "lower(x.category)",
        city: "lower(x.city)",
      },
      defaultSort: "name",
    },
    q,
  );
}

export interface EmployeeRow {
  id: string;
  code: string | null;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  employmentType: "employee" | "contractor" | "temporary" | "intern";
  hasAccount: boolean;
  teams: string[];
  isActive: boolean;
}

export const EMPLOYEE_SORTS = ["name", "code", "job"] as const;

export function listEmployees(
  tx: UserTx,
  access: TenantAccess,
  q: ListQuery,
): Promise<Page<EmployeeRow>> {
  requirePermission(access, "employees.read");
  return runList<EmployeeRow>(
    tx,
    access,
    {
      from: "public.employees x",
      select: `x.id, x.employee_code as code, x.first_name as "firstName", x.last_name as "lastName",
             x.job_title as "jobTitle", x.employment_type as "employmentType", x.user_id is not null as "hasAccount",
             coalesce((select array_agg(t.name order by t.name) from public.team_members tm
                         join public.teams t on t.tenant_id = tm.tenant_id and t.id = tm.team_id and t.deleted_at is null
                        where tm.tenant_id = x.tenant_id and tm.employee_id = x.id), '{}') as teams,
             x.is_active as "isActive"`,
      searchExpr: "lower(concat_ws(' ', x.first_name, x.last_name, x.employee_code, x.job_title))",
      sorts: {
        name: "lower(x.last_name || ' ' || x.first_name)",
        code: "x.employee_code",
        job: "lower(x.job_title)",
      },
      defaultSort: "name",
      extraWhere: (query, params) => {
        if (query.type && ["employee", "contractor", "temporary", "intern"].includes(query.type)) {
          params.push(query.type);
          return [`x.employment_type = $${params.length}::public.employment_type`];
        }
        return [];
      },
    },
    q,
  );
}

export interface TeamRow {
  id: string;
  name: string;
  color: string | null;
  leader: string | null;
  members: number;
  isActive: boolean;
}

export const TEAM_SORTS = ["name", "members"] as const;

export function listTeams(tx: UserTx, access: TenantAccess, q: ListQuery): Promise<Page<TeamRow>> {
  requirePermission(access, "teams.read");
  return runList<TeamRow>(
    tx,
    access,
    {
      from: "public.teams x left join public.employees l on l.tenant_id = x.tenant_id and l.id = x.leader_employee_id",
      select: `x.id, x.name, x.color, nullif(concat_ws(' ', l.first_name, l.last_name), '') as leader,
             (select count(*)::int from public.team_members tm where tm.tenant_id = x.tenant_id and tm.team_id = x.id) as members,
             x.is_active as "isActive"`,
      searchExpr: "lower(x.name)",
      sorts: { name: "lower(x.name)", members: "members" },
      defaultSort: "name",
    },
    q,
  );
}

// --- Creazione cliente ---------------------------------------------------------

export const createCustomerInput = z.object({
  displayName: z.string().trim().min(1, "Inserisci il nome").max(300),
  partyType: z.enum(["company", "individual", "public_entity"]),
  code: optional(
    z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._/-]{1,30}$/, "Codice: lettere, numeri e . _ / -"),
  ),
  vatNumber: optional(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{5,20}$/, "Partita IVA non valida"),
  ),
  email: optional(z.email("Email non valida").max(320)),
  phone: optional(z.string().trim().max(40)),
  city: optional(z.string().trim().max(120)),
  province: optional(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Provincia: 2 lettere"),
  ),
});

export type CreateCustomerInput = z.input<typeof createCustomerInput>;

/** Crea un cliente nell'azienda attiva (tenant dal server, mai dal modulo). */
export async function createCustomer(
  tx: UserTx,
  access: TenantAccess,
  input: CreateCustomerInput,
): Promise<{ id: string }> {
  requirePermission(access, "customers.write");
  const d = parseInput(createCustomerInput, input);
  await tx.query("savepoint create_customer");
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.customers
         (tenant_id, display_name, party_type, code, vat_number, email, phone, billing_city, billing_province)
       values ($1, $2, $3::public.party_type, $4, $5, $6, $7, $8, $9) returning id`,
      [
        access.tenantId,
        d.displayName,
        d.partyType,
        d.code ?? null,
        d.vatNumber ?? null,
        d.email ?? null,
        d.phone ?? null,
        d.city ?? null,
        d.province ?? null,
      ],
    );
    return { id: rows[0]!.id };
  } catch (error) {
    await tx.query("rollback to savepoint create_customer");
    if (pgCode(error) === "23505") {
      const detail = String((error as { constraint?: string }).constraint ?? "");
      throw new ValidationError(
        detail.includes("vat")
          ? { vatNumber: "Esiste già un cliente con questa partita IVA" }
          : { code: "Codice già usato" },
      );
    }
    if (pgCode(error) === "42501")
      throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
    throw error;
  }
}
