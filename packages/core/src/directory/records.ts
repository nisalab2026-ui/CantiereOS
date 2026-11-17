import { z } from "zod";
import { requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { UserTx } from "../db/transaction";
import { optional, parseInput, ValidationError } from "../validation";

/**
 * Schede di dettaglio e modifica di clienti e personale. Ogni modifica passa
 * dal controllo di concorrenza su updated_at: se qualcun altro ha salvato nel
 * frattempo la modifica è rifiutata, mai sovrascritta in silenzio. Lo storico
 * lo scrive il database (trigger di audit), non l'applicazione.
 */
const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;
const upper = (re: RegExp, msg: string) => z.string().trim().toUpperCase().regex(re, msg);

const SAME_VERSION =
  "date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $3::timestamptz)";
const STALE = "Questi dati sono stati modificati da un altro utente. Ricarica la pagina.";

function mapError(
  error: unknown,
  uniqueField: (constraint: string) => Record<string, string>,
): never {
  const code = pgCode(error);
  if (code === "23505") {
    throw new ValidationError(
      uniqueField(String((error as { constraint?: string }).constraint ?? "")),
    );
  }
  if (code === "23514")
    throw new ValidationError({ form: "Alcuni dati non sono validi. Controlla i campi." });
  if (code === "42501") throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
  throw error;
}

// --- Clienti ---------------------------------------------------------------------

export interface CustomerDetail {
  id: string;
  code: string | null;
  partyType: "company" | "individual" | "public_entity";
  displayName: string;
  legalName: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  sdiCode: string | null;
  pecEmail: string | null;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  paymentTermsDays: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  sites: { id: string; name: string; address: string; city: string }[];
  contacts: {
    id: string;
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
  }[];
}

export async function getCustomer(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<CustomerDetail | null> {
  requirePermission(access, "customers.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<Omit<CustomerDetail, "sites" | "contacts">>(
    `select id, code, party_type as "partyType", display_name as "displayName", legal_name as "legalName",
            vat_number as "vatNumber", tax_code as "taxCode", sdi_code as "sdiCode", pec_email as "pecEmail",
            email, phone, billing_address_line as "addressLine", billing_postal_code as "postalCode",
            billing_city as city, billing_province as province, payment_terms_days as "paymentTermsDays",
            notes, is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
       from public.customers where tenant_id = $1 and id = $2 and deleted_at is null`,
    [access.tenantId, id],
  );
  if (!rows[0]) return null;
  const sites = await tx.query<CustomerDetail["sites"][number]>(
    `select id, name, address_line as address, city from public.customer_sites
      where tenant_id = $1 and customer_id = $2 and deleted_at is null order by lower(name)`,
    [access.tenantId, id],
  );
  const contacts = await tx.query<CustomerDetail["contacts"][number]>(
    `select id, nullif(concat_ws(' ', first_name, last_name), '') as name, role_title as role, email,
            coalesce(mobile, phone) as phone
       from public.contacts where tenant_id = $1 and customer_id = $2 and deleted_at is null
      order by is_primary desc, lower(last_name), lower(first_name)`,
    [access.tenantId, id],
  );
  return { ...rows[0], sites: sites.rows, contacts: contacts.rows };
}

export const customerInput = z.object({
  displayName: z.string().trim().min(1, "Inserisci il nome").max(300),
  partyType: z.enum(["company", "individual", "public_entity"], "Scegli il tipo"),
  legalName: optional(z.string().trim().max(300)),
  code: optional(
    z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._/-]{1,30}$/, "Codice: lettere, numeri e . _ / -"),
  ),
  vatNumber: optional(upper(/^[A-Z0-9]{5,20}$/, "Partita IVA non valida")),
  taxCode: optional(upper(/^[A-Z0-9]{11,16}$/, "Codice fiscale non valido")),
  sdiCode: optional(upper(/^[A-Z0-9]{6,7}$/, "Codice SDI: 6 o 7 caratteri")),
  pecEmail: optional(z.email("PEC non valida").max(320)),
  email: optional(z.email("Email non valida").max(320)),
  phone: optional(z.string().trim().max(40)),
  addressLine: optional(z.string().trim().max(300)),
  postalCode: optional(
    z
      .string()
      .trim()
      .regex(/^[0-9]{5}$/, "CAP: 5 cifre"),
  ),
  city: optional(z.string().trim().max(120)),
  province: optional(upper(/^[A-Z]{2}$/, "Provincia: 2 lettere")),
  paymentTermsDays: optional(
    z.coerce.number().int("Numero intero").min(0).max(365, "Massimo 365 giorni"),
  ),
  notes: optional(z.string().trim().max(10_000)),
});
export type CustomerInput = z.input<typeof customerInput>;

export async function updateCustomer(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: CustomerInput,
  expectedUpdatedAt: string,
): Promise<void> {
  requirePermission(access, "customers.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Cliente non trovato" });
  const d = parseInput(customerInput, input);
  await tx.query("savepoint update_customer");
  try {
    const { rowCount } = await tx.query(
      `update public.customers set
         display_name = $4, party_type = $5::public.party_type, legal_name = $6, code = $7,
         vat_number = $8, tax_code = $9, sdi_code = $10, pec_email = $11, email = $12, phone = $13,
         billing_address_line = $14, billing_postal_code = $15, billing_city = $16,
         billing_province = $17, payment_terms_days = $18, notes = $19
       where tenant_id = $1 and id = $2 and deleted_at is null and ${SAME_VERSION}`,
      [
        access.tenantId,
        id,
        expectedUpdatedAt,
        d.displayName,
        d.partyType,
        d.legalName ?? null,
        d.code ?? null,
        d.vatNumber ?? null,
        d.taxCode ?? null,
        d.sdiCode ?? null,
        d.pecEmail ?? null,
        d.email ?? null,
        d.phone ?? null,
        d.addressLine ?? null,
        d.postalCode ?? null,
        d.city ?? null,
        d.province ?? null,
        d.paymentTermsDays ?? null,
        d.notes ?? null,
      ],
    );
    if (rowCount === 0) throw new ValidationError({ form: STALE });
  } catch (error) {
    await tx.query("rollback to savepoint update_customer");
    if (error instanceof ValidationError) throw error;
    mapError(error, (c) =>
      c.includes("vat")
        ? { vatNumber: "Esiste già un cliente con questa partita IVA" }
        : { code: "Codice già usato" },
    );
  }
}

/** Archivia o riattiva (reversibile; l'eliminazione definitiva non è esposta). */
export async function setCustomerActive(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  active: boolean,
): Promise<void> {
  requirePermission(access, "customers.write");
  if (!isUuid(id)) return;
  await tx.query(
    "update public.customers set is_active = $3 where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, id, active],
  );
}

// --- Personale ---------------------------------------------------------------------

export interface EmployeeDetail {
  id: string;
  code: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  employmentType: "employee" | "contractor" | "temporary" | "intern";
  hireDate: string | null;
  terminationDate: string | null;
  notes: string | null;
  isActive: boolean;
  hasAccount: boolean;
  createdAt: Date;
  updatedAt: Date;
  teams: { id: string; name: string; color: string | null }[];
}

export async function getEmployee(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<EmployeeDetail | null> {
  requirePermission(access, "employees.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<Omit<EmployeeDetail, "teams">>(
    `select id, employee_code as code, first_name as "firstName", last_name as "lastName", email, phone,
            job_title as "jobTitle", employment_type as "employmentType",
            to_char(hire_date, 'YYYY-MM-DD') as "hireDate", to_char(termination_date, 'YYYY-MM-DD') as "terminationDate",
            notes, is_active as "isActive", user_id is not null as "hasAccount",
            created_at as "createdAt", updated_at as "updatedAt"
       from public.employees where tenant_id = $1 and id = $2 and deleted_at is null`,
    [access.tenantId, id],
  );
  if (!rows[0]) return null;
  const teams = await tx.query<EmployeeDetail["teams"][number]>(
    `select t.id, t.name, t.color from public.team_members tm
       join public.teams t on t.tenant_id = tm.tenant_id and t.id = tm.team_id and t.deleted_at is null
      where tm.tenant_id = $1 and tm.employee_id = $2 order by lower(t.name)`,
    [access.tenantId, id],
  );
  return { ...rows[0], teams: teams.rows };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida");

export const employeeInput = z
  .object({
    firstName: z.string().trim().min(1, "Inserisci il nome").max(100),
    lastName: z.string().trim().min(1, "Inserisci il cognome").max(100),
    code: optional(
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9._/-]{1,30}$/, "Matricola: lettere, numeri e . _ / -"),
    ),
    email: optional(z.email("Email non valida").max(320)),
    phone: optional(z.string().trim().max(40)),
    jobTitle: optional(z.string().trim().max(100)),
    employmentType: z.enum(
      ["employee", "contractor", "temporary", "intern"],
      "Scegli il tipo di rapporto",
    ),
    hireDate: optional(isoDate),
    terminationDate: optional(isoDate),
    notes: optional(z.string().trim().max(2000)),
  })
  .refine((d) => !d.hireDate || !d.terminationDate || d.terminationDate >= d.hireDate, {
    path: ["terminationDate"],
    message: "La cessazione non può precedere l'assunzione",
  });
export type EmployeeInput = z.input<typeof employeeInput>;

const employeeUnique = (c: string) =>
  c.includes("code")
    ? { code: "Matricola già usata" }
    : { email: "Email già usata da un altro dipendente" };

export async function createEmployee(
  tx: UserTx,
  access: TenantAccess,
  input: EmployeeInput,
): Promise<{ id: string }> {
  requirePermission(access, "employees.write");
  const d = parseInput(employeeInput, input);
  await tx.query("savepoint create_employee");
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.employees
         (tenant_id, first_name, last_name, employee_code, email, phone, job_title, employment_type,
          hire_date, termination_date, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8::public.employment_type, $9::date, $10::date, $11) returning id`,
      [
        access.tenantId,
        d.firstName,
        d.lastName,
        d.code ?? null,
        d.email ?? null,
        d.phone ?? null,
        d.jobTitle ?? null,
        d.employmentType,
        d.hireDate ?? null,
        d.terminationDate ?? null,
        d.notes ?? null,
      ],
    );
    return { id: rows[0]!.id };
  } catch (error) {
    await tx.query("rollback to savepoint create_employee");
    mapError(error, employeeUnique);
  }
}

export async function updateEmployee(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: EmployeeInput,
  expectedUpdatedAt: string,
): Promise<void> {
  requirePermission(access, "employees.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Dipendente non trovato" });
  const d = parseInput(employeeInput, input);
  await tx.query("savepoint update_employee");
  try {
    const { rowCount } = await tx.query(
      `update public.employees set
         first_name = $4, last_name = $5, employee_code = $6, email = $7, phone = $8, job_title = $9,
         employment_type = $10::public.employment_type, hire_date = $11::date, termination_date = $12::date,
         notes = $13
       where tenant_id = $1 and id = $2 and deleted_at is null and ${SAME_VERSION}`,
      [
        access.tenantId,
        id,
        expectedUpdatedAt,
        d.firstName,
        d.lastName,
        d.code ?? null,
        d.email ?? null,
        d.phone ?? null,
        d.jobTitle ?? null,
        d.employmentType,
        d.hireDate ?? null,
        d.terminationDate ?? null,
        d.notes ?? null,
      ],
    );
    if (rowCount === 0) throw new ValidationError({ form: STALE });
  } catch (error) {
    await tx.query("rollback to savepoint update_employee");
    if (error instanceof ValidationError) throw error;
    mapError(error, employeeUnique);
  }
}

export async function setEmployeeActive(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  active: boolean,
): Promise<void> {
  requirePermission(access, "employees.write");
  if (!isUuid(id)) return;
  await tx.query(
    "update public.employees set is_active = $3 where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, id, active],
  );
}
