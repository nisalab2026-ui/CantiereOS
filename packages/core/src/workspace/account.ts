import { z } from "zod";
import { requirePermission, type TenantAccess } from "../auth/access";
import type { UserTx } from "../db/transaction";
import { optional, parseInput, ValidationError } from "../validation";

/**
 * Profilo personale e dati dell'azienda (blocco 5). Le colonne modificabili
 * sono quelle già concesse dal database (grant per colonna): nome e telefono
 * della persona; nome, ragione sociale, P.IVA e codice fiscale dell'azienda,
 * solo con `tenant.manage` (RLS + MFA). Lo storico lo scrive il database.
 */
const upper = (re: RegExp, msg: string) => z.string().trim().toUpperCase().regex(re, msg);
const SAME_VERSION =
  "date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)";
const STALE = "Questi dati sono stati modificati nel frattempo. Ricarica la pagina.";

export interface MyProfile {
  email: string | null;
  fullName: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getMyProfile(tx: UserTx): Promise<MyProfile | null> {
  const { rows } = await tx.query<MyProfile>(
    `select email, full_name as "fullName", phone, created_at as "createdAt", updated_at as "updatedAt"
       from public.users where id = auth.uid()`,
  );
  return rows[0] ?? null;
}

export const profileInput = z.object({
  fullName: z.string().trim().min(2, "Inserisci nome e cognome").max(200),
  phone: optional(
    z
      .string()
      .trim()
      .max(40)
      .regex(/^[+0-9 ()./-]{5,40}$/, "Telefono non valido"),
  ),
});
export type ProfileInput = z.input<typeof profileInput>;

export async function updateMyProfile(
  tx: UserTx,
  input: ProfileInput,
  expectedUpdatedAt: string,
): Promise<void> {
  const d = parseInput(profileInput, input);
  const { rowCount } = await tx.query(
    `update public.users set full_name = $2, phone = $3
      where id = auth.uid()
        and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $1::timestamptz)`,
    [expectedUpdatedAt, d.fullName, d.phone ?? null],
  );
  if (rowCount === 0) throw new ValidationError({ form: STALE });
}

export interface CompanyProfile {
  id: string;
  name: string;
  legalName: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  status: string;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
  members: number;
}

export async function getCompanyProfile(
  tx: UserTx,
  access: TenantAccess,
): Promise<CompanyProfile | null> {
  const { rows } = await tx.query<CompanyProfile>(
    `select t.id, t.name, t.legal_name as "legalName", t.vat_number as "vatNumber", t.tax_code as "taxCode",
            t.status::text as status, t.is_demo as "isDemo", t.created_at as "createdAt", t.updated_at as "updatedAt",
            (select count(*)::int from public.memberships m
              where m.tenant_id = t.id and m.status = 'active') as members
       from public.tenants t where t.id = $1`,
    [access.tenantId],
  );
  return rows[0] ?? null;
}

export const companyInput = z.object({
  name: z.string().trim().min(2, "Almeno 2 caratteri").max(200),
  legalName: optional(z.string().trim().max(300)),
  vatNumber: optional(upper(/^[A-Z0-9]{5,20}$/, "Partita IVA non valida")),
  taxCode: optional(upper(/^[A-Z0-9]{11,16}$/, "Codice fiscale non valido")),
});
export type CompanyInput = z.input<typeof companyInput>;

export async function updateCompanyProfile(
  tx: UserTx,
  access: TenantAccess,
  input: CompanyInput,
  expectedUpdatedAt: string,
): Promise<void> {
  requirePermission(access, "tenant.manage");
  const d = parseInput(companyInput, input);
  const { rowCount } = await tx.query(
    `update public.tenants set name = $3, legal_name = $4, vat_number = $5, tax_code = $6
      where id = $1 and ${SAME_VERSION}`,
    [
      access.tenantId,
      expectedUpdatedAt,
      d.name,
      d.legalName ?? null,
      d.vatNumber ?? null,
      d.taxCode ?? null,
    ],
  );
  if (rowCount === 0) throw new ValidationError({ form: STALE });
}
