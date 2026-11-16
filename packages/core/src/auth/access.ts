import { AuthError, pgCode } from "./errors.js";
import type { UserTx } from "../db/transaction.js";

export interface CompanyMembership {
  tenantId: string;
  name: string;
  slug: string;
  roleKey: string;
  roleName: string;
  /** Valorizzato solo per il ruolo "Cliente esterno". */
  customerId: string | null;
}

/**
 * Accesso verificato all'azienda attiva. Si costruisce SOLO da dati letti nel
 * database dentro la transazione dell'utente: nessun tenant_id, ruolo o
 * permesso arriva dal browser.
 */
export interface TenantAccess {
  readonly tenantId: string;
  readonly roleKey: string;
  readonly customerId: string | null;
  /** Permessi utilizzabili ora. */
  readonly permissions: ReadonlySet<string>;
  /** Permessi del ruolo che richiedono prima la verifica MFA (sessione aal1). */
  readonly permissionsRequiringMfa: ReadonlySet<string>;
}

/** Aziende in cui l'utente è membro attivo (aziende sospese o chiuse escluse). */
export async function listMyCompanies(tx: UserTx): Promise<CompanyMembership[]> {
  const { rows } = await tx.query<CompanyMembership>(
    `select t.id as "tenantId", t.name, t.slug, r.key as "roleKey", r.name as "roleName",
            m.customer_id as "customerId"
       from public.memberships m
       join public.tenants t on t.id = m.tenant_id and t.status in ('trial', 'active')
       join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid() and m.status = 'active'
      order by t.name, t.id`,
  );
  return rows;
}

async function loadAccess(tx: UserTx, company: CompanyMembership): Promise<TenantAccess> {
  const { rows } = await tx.query<{ permission: string; granted: boolean }>(
    "select permission, granted from app.my_permissions($1)",
    [company.tenantId],
  );
  return Object.freeze({
    tenantId: company.tenantId,
    roleKey: company.roleKey,
    customerId: company.customerId,
    permissions: new Set(rows.filter((r) => r.granted).map((r) => r.permission)),
    permissionsRequiringMfa: new Set(rows.filter((r) => !r.granted).map((r) => r.permission)),
  });
}

/**
 * Azienda attiva: la preferenza salvata nel database (users.last_active_tenant_id),
 * se l'utente ne è ancora membro attivo; altrimenti la prima azienda accessibile.
 */
export async function resolveActiveTenant(tx: UserTx): Promise<TenantAccess> {
  const companies = await listMyCompanies(tx);
  if (companies.length === 0) {
    throw new AuthError("NO_ACTIVE_TENANT", "nessuna azienda attiva per l'utente");
  }
  const { rows } = await tx.query<{ last: string | null }>(
    "select last_active_tenant_id as last from public.users where id = auth.uid()",
  );
  const preferred = rows[0]?.last;
  const company = companies.find((c) => c.tenantId === preferred) ?? companies[0]!;
  return loadAccess(tx, company);
}

/**
 * Cambia azienda attiva. Il valore richiesto dal client è solo una richiesta:
 * il database verifica che l'utente ne sia membro attivo.
 */
export async function switchActiveTenant(tx: UserTx, tenantId: string): Promise<TenantAccess> {
  if (!UUID.test(tenantId)) throw new AuthError("NOT_A_MEMBER", "azienda non valida");
  await tx.query("savepoint switch_tenant");
  try {
    await tx.query("select app.set_active_tenant($1)", [tenantId]);
  } catch (error) {
    await tx.query("rollback to savepoint switch_tenant");
    if (pgCode(error) === "42501") {
      throw new AuthError("NOT_A_MEMBER", "azienda non accessibile", { cause: error });
    }
    throw error;
  }
  const company = (await listMyCompanies(tx)).find((c) => c.tenantId === tenantId);
  if (!company) throw new AuthError("NOT_A_MEMBER", "azienda non accessibile");
  return loadAccess(tx, company);
}

/**
 * Controllo lato server, prima di eseguire un caso d'uso. Il database applica
 * comunque lo stesso controllo con RLS: questo serve a dare un errore chiaro
 * (e a distinguere "permesso mancante" da "serve la MFA").
 */
export function requirePermission(access: TenantAccess, permission: string): void {
  if (access.permissions.has(permission)) return;
  if (access.permissionsRequiringMfa.has(permission)) {
    throw new AuthError("MFA_REQUIRED", `il permesso ${permission} richiede la verifica MFA`);
  }
  throw new AuthError("FORBIDDEN", `permesso mancante: ${permission}`);
}

export function hasPermission(access: TenantAccess, permission: string): boolean {
  return access.permissions.has(permission);
}

/** Super Admin SaaS: vero solo per gli utenti in platform_admins con sessione aal2. */
export async function isPlatformAdmin(tx: UserTx): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>("select app.is_platform_admin() as ok");
  return rows[0]?.ok === true;
}

export async function requirePlatformAdmin(tx: UserTx): Promise<void> {
  if (await isPlatformAdmin(tx)) return;
  const { rowCount } = await tx.query(
    "select 1 from public.platform_admins where user_id = auth.uid()",
  );
  if ((rowCount ?? 0) > 0) {
    throw new AuthError("MFA_REQUIRED", "il pannello SaaS richiede la verifica MFA");
  }
  throw new AuthError("FORBIDDEN", "riservato agli operatori della piattaforma");
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
