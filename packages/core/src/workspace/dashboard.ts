import { hasPermission, type TenantAccess } from "../auth/access";
import type { UserTx } from "../db/transaction";

/** Quale dashboard mostrare, dal ruolo verificato nell'azienda attiva. */
export type DashboardKind = "admin" | "manager" | "technician" | "portal";

export function dashboardKindFor(roleKey: string): DashboardKind {
  if (roleKey === "external_client") return "portal";
  if (roleKey === "operations_manager" || roleKey === "site_manager") return "manager";
  if (roleKey === "technician") return "technician";
  // owner, admin, back_office e ruoli personalizzati
  return "admin";
}

export interface AuditEntry {
  id: string;
  action: string;
  tableName: string | null;
  actor: string | null;
  createdAt: Date;
}

export interface AdminDashboard {
  kind: "admin";
  activeMembers: number | null;
  seats: number | null;
  trialEndsAt: Date | null;
  pendingInvitations: number | null;
  customers: number | null;
  suppliers: number | null;
  employees: number | null;
  recentActivity: AuditEntry[] | null;
}

export interface TeamSummary {
  id: string;
  name: string;
  color: string | null;
  leader: string | null;
  members: number;
}

export interface ManagerDashboard {
  kind: "manager";
  teams: TeamSummary[] | null;
  employees: number | null;
  customers: number | null;
  sites: number | null;
}

export interface TechnicianDashboard {
  kind: "technician";
  employee: { firstName: string; lastName: string | null; jobTitle: string | null } | null;
  teams: TeamSummary[] | null;
}

export interface PortalDashboard {
  kind: "portal";
  customer: { name: string } | null;
}

export type DashboardData =
  AdminDashboard | ManagerDashboard | TechnicianDashboard | PortalDashboard;

async function count(tx: UserTx, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await tx.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

const TEAMS_SQL = `
  select t.id, t.name, t.color,
         nullif(concat_ws(' ', l.first_name, l.last_name), '') as leader,
         (select count(*)::int from public.team_members tm where tm.tenant_id = t.tenant_id and tm.team_id = t.id) as members
    from public.teams t
    left join public.employees l on l.tenant_id = t.tenant_id and l.id = t.leader_employee_id
   where t.tenant_id = $1 and t.deleted_at is null`;

/**
 * Dati della dashboard: SOLO numeri reali dell'azienda attiva, letti con RLS.
 * Una sezione senza permesso vale null (e non viene mostrata).
 */
export async function getDashboard(tx: UserTx, access: TenantAccess): Promise<DashboardData> {
  const t = access.tenantId;
  const can = (p: string) => hasPermission(access, p);
  const kind = dashboardKindFor(access.roleKey);

  if (kind === "portal") {
    const { rows } = await tx.query<{ name: string }>(
      "select display_name as name from public.customers where tenant_id = $1 and id = $2",
      [t, access.customerId],
    );
    return { kind, customer: rows[0] ?? null };
  }

  if (kind === "technician") {
    const emp = await tx.query<{
      firstName: string;
      lastName: string | null;
      jobTitle: string | null;
    }>(
      `select first_name as "firstName", last_name as "lastName", job_title as "jobTitle"
         from public.employees where tenant_id = $1 and user_id = auth.uid() and deleted_at is null limit 1`,
      [t],
    );
    const teams = can("teams.read")
      ? (
          await tx.query<TeamSummary>(
            `${TEAMS_SQL} and exists (
               select 1 from public.team_members tm join public.employees e
                 on e.tenant_id = tm.tenant_id and e.id = tm.employee_id
                where tm.tenant_id = t.tenant_id and tm.team_id = t.id and e.user_id = auth.uid())
             order by lower(t.name)`,
            [t],
          )
        ).rows
      : null;
    return { kind, employee: emp.rows[0] ?? null, teams };
  }

  if (kind === "manager") {
    return {
      kind,
      teams: can("teams.read")
        ? (await tx.query<TeamSummary>(`${TEAMS_SQL} order by lower(t.name) limit 12`, [t])).rows
        : null,
      employees: can("employees.read")
        ? await count(
            tx,
            "select count(*)::int as n from public.employees where tenant_id = $1 and deleted_at is null and is_active",
            [t],
          )
        : null,
      customers: can("customers.read")
        ? await count(
            tx,
            "select count(*)::int as n from public.customers where tenant_id = $1 and deleted_at is null and is_active",
            [t],
          )
        : null,
      sites: can("customers.read")
        ? await count(
            tx,
            "select count(*)::int as n from public.customer_sites where tenant_id = $1 and deleted_at is null",
            [t],
          )
        : null,
    };
  }

  const subscription = can("billing.read")
    ? (
        await tx.query<{ seats: number; trialEndsAt: Date | null }>(
          `select seats, trial_ends_at as "trialEndsAt" from public.subscriptions
            where tenant_id = $1 and status <> 'canceled' limit 1`,
          [t],
        )
      ).rows[0]
    : undefined;
  return {
    kind: "admin",
    activeMembers: can("members.read")
      ? await count(
          tx,
          `select count(*)::int as n from public.memberships m join public.roles r on r.id = m.role_id
            where m.tenant_id = $1 and m.status = 'active' and not (r.tenant_id is null and r.key = 'external_client')`,
          [t],
        )
      : null,
    seats: subscription?.seats ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    pendingInvitations: can("members.manage")
      ? await count(
          tx,
          `select count(*)::int as n from public.invitations
            where tenant_id = $1 and accepted_at is null and revoked_at is null and expires_at > now()`,
          [t],
        )
      : null,
    customers: can("customers.read")
      ? await count(
          tx,
          "select count(*)::int as n from public.customers where tenant_id = $1 and deleted_at is null and is_active",
          [t],
        )
      : null,
    suppliers: can("suppliers.read")
      ? await count(
          tx,
          "select count(*)::int as n from public.suppliers where tenant_id = $1 and deleted_at is null and is_active",
          [t],
        )
      : null,
    employees: can("employees.read")
      ? await count(
          tx,
          "select count(*)::int as n from public.employees where tenant_id = $1 and deleted_at is null and is_active",
          [t],
        )
      : null,
    recentActivity: can("audit.read")
      ? (
          await tx.query<AuditEntry>(
            `select a.id::text as id, a.action, a.table_name as "tableName",
                    coalesce(u.full_name, u.email) as actor, a.created_at as "createdAt"
               from public.audit_log a
               left join public.users u on u.id = a.actor_user_id
              where a.tenant_id = $1
              order by a.created_at desc limit 8`,
            [t],
          )
        ).rows
      : null,
  };
}
