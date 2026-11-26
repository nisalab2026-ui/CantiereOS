import { z } from "zod";
import { hasPermission, type TenantAccess } from "../auth/access";
import type { UserTx } from "../db/transaction";
import { listWorkOrders, type WorkOrderRow } from "../operations/work-orders";

/**
 * Panoramica "centro di controllo": solo numeri reali dell'azienda attiva,
 * letti con RLS. Ogni sezione senza permesso vale null e non viene mostrata.
 * Gli importi sono in centesimi; "incassato" = pagamenti in entrata segnati come
 * pagati con data d'incasso nel periodo (il fatturato arriverà con le fatture).
 */

const TZ = "Europe/Rome";

// ---------------------------------------------------------------------------
// Periodo
// ---------------------------------------------------------------------------

export const DASHBOARD_PERIODS = ["month", "last-month", "quarter"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
  month: "Questo mese",
  "last-month": "Mese scorso",
  quarter: "Trimestre",
};

/** Intervallo [from, to) e intervallo di confronto della stessa durata, prima. */
export interface PeriodRange {
  period: DashboardPeriod;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);

/** Sposta di n mesi tenendo il giorno (o l'ultimo del mese, se più corto). */
export function shiftMonths(date: string, n: number): string {
  const d = utc(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return iso(target);
}

function addDays(date: string, n: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/**
 * Periodo in corso fino a oggi, confrontato con lo stesso tratto del periodo
 * precedente (es. 1–26 novembre contro 1–26 ottobre). "Mese scorso" è intero.
 */
export function periodRange(period: DashboardPeriod, today: string): PeriodRange {
  const monthStart = `${today.slice(0, 7)}-01`;
  const tomorrow = addDays(today, 1);
  if (period === "last-month") {
    const from = shiftMonths(monthStart, -1);
    return {
      period,
      from,
      to: monthStart,
      prevFrom: shiftMonths(from, -1),
      prevTo: from,
    };
  }
  if (period === "quarter") {
    const m = Number(today.slice(5, 7));
    const qStart = `${today.slice(0, 4)}-${String(m - ((m - 1) % 3)).padStart(2, "0")}-01`;
    return {
      period,
      from: qStart,
      to: tomorrow,
      prevFrom: shiftMonths(qStart, -3),
      prevTo: shiftMonths(tomorrow, -3),
    };
  }
  return {
    period,
    from: monthStart,
    to: tomorrow,
    prevFrom: shiftMonths(monthStart, -1),
    prevTo: shiftMonths(tomorrow, -1),
  };
}

// ---------------------------------------------------------------------------
// Widget e disposizione personale
// ---------------------------------------------------------------------------

export const DASHBOARD_WIDGETS = [
  "kpis",
  "cash",
  "priority",
  "work_orders",
  "tasks",
  "queues",
  "map",
  "activity",
  "organization",
] as const;
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];
export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidget, string> = {
  kpis: "Indicatori principali",
  cash: "Incassi e pagamenti",
  priority: "Scadenze che richiedono attenzione",
  work_orders: "Interventi di oggi e della settimana",
  tasks: "Le tue attività",
  queues: "Da chiudere",
  map: "Mappa",
  activity: "Ultime modifiche",
  organization: "Azienda e squadre",
};

export const DASHBOARD_LAYOUT_KEY = "dashboard.layout";

const widgetSchema = z.enum(DASHBOARD_WIDGETS);
export const dashboardLayoutSchema = z.object({
  order: z.array(widgetSchema).max(DASHBOARD_WIDGETS.length),
  hidden: z.array(widgetSchema).max(DASHBOARD_WIDGETS.length),
});
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;

/** Ordine effettivo: quello salvato, poi i widget nuovi nell'ordine predefinito. */
export function resolveDashboardLayout(
  saved: DashboardLayout | null,
  available: readonly DashboardWidget[],
): { visible: DashboardWidget[]; hidden: DashboardWidget[] } {
  const avail = new Set(available);
  const order = [
    ...new Set([...(saved?.order ?? []), ...DASHBOARD_WIDGETS].filter((w) => avail.has(w))),
  ];
  const hidden = new Set(saved?.hidden ?? []);
  return {
    visible: order.filter((w) => !hidden.has(w)),
    hidden: order.filter((w) => hidden.has(w)),
  };
}

// ---------------------------------------------------------------------------
// Dati
// ---------------------------------------------------------------------------

export interface CashSummary {
  collectedCents: number;
  prevCollectedCents: number;
  /** incassato per mese, ultimi 6 mesi (YYYY-MM), il mese in corso compreso */
  byMonth: { month: string; cents: number }[];
}

export interface WorkOrdersSummary {
  today: WorkOrderRow[];
  todayCompleted: number;
  todayInProgress: number;
  weekScheduled: number;
  weekCompleted: number;
  prevWeekCompleted: number;
  /** chi ha avviato o chiuso interventi oggi */
  team: { name: string; started: number; completed: number }[];
  /** lunedì della settimana in corso */
  weekStart: string;
}

export interface CustomersSummary {
  active: number;
  newInPeriod: number;
  newPrev: number;
}

export interface QueueSummary {
  reportsToApprove: { count: number; oldest: string | null } | null;
  formsOpen: { count: number; oldest: Date | null } | null;
  urgentTasks: { count: number; overdue: number } | null;
}

export interface CommandCenter {
  range: PeriodRange;
  today: string;
  cash: CashSummary | null;
  workOrders: WorkOrdersSummary | null;
  customers: CustomersSummary | null;
  queues: QueueSummary;
}

function mondayOf(date: string): string {
  const dow = (utc(date).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

export async function getCommandCenter(
  tx: UserTx,
  access: TenantAccess,
  period: DashboardPeriod,
  today: string,
): Promise<CommandCenter> {
  const t = access.tenantId;
  const can = (p: string) => hasPermission(access, p);
  const range = periodRange(period, today);

  let cash: CashSummary | null = null;
  if (can("payments.read")) {
    const firstMonth = shiftMonths(`${today.slice(0, 7)}-01`, -5);
    const { rows } = await tx.query<{ collected: number; prev: number }>(
      `select
         coalesce(sum(coalesce(paid_amount_cents, amount_cents))
           filter (where paid_on >= $2::date and paid_on < $3::date), 0)::float8 as collected,
         coalesce(sum(coalesce(paid_amount_cents, amount_cents))
           filter (where paid_on >= $4::date and paid_on < $5::date), 0)::float8 as prev
       from public.payments
      where tenant_id = $1 and deleted_at is null and direction = 'incoming' and status = 'paid'`,
      [t, range.from, range.to, range.prevFrom, range.prevTo],
    );
    const months = await tx.query<{ month: string; cents: number }>(
      `select to_char(m, 'YYYY-MM') as month,
              coalesce((select sum(coalesce(p.paid_amount_cents, p.amount_cents))
                          from public.payments p
                         where p.tenant_id = $1 and p.deleted_at is null
                           and p.direction = 'incoming' and p.status = 'paid'
                           and p.paid_on >= m::date and p.paid_on < (m + interval '1 month')::date), 0)::float8 as cents
         from generate_series($2::date, $2::date + interval '5 months', interval '1 month') m
        order by m`,
      [t, firstMonth],
    );
    cash = {
      collectedCents: rows[0]?.collected ?? 0,
      prevCollectedCents: rows[0]?.prev ?? 0,
      byMonth: months.rows,
    };
  }

  let workOrders: WorkOrdersSummary | null = null;
  if (can("work_orders.read")) {
    const weekStart = mondayOf(today);
    const todayRows = (await listWorkOrders(tx, access, { from: today, to: today })).filter(
      (w) => w.status !== "cancelled",
    );
    const { rows } = await tx.query<{
      weekScheduled: number;
      weekCompleted: number;
      prevWeekCompleted: number;
    }>(
      `select
         count(*) filter (where w.status <> 'cancelled'
           and w.scheduled_start >= ($2::date)::timestamp at time zone '${TZ}'
           and w.scheduled_start < ($2::date + 7)::timestamp at time zone '${TZ}')::int as "weekScheduled",
         count(*) filter (where w.completed_at >= ($2::date)::timestamp at time zone '${TZ}'
           and w.completed_at < ($2::date + 7)::timestamp at time zone '${TZ}')::int as "weekCompleted",
         count(*) filter (where w.completed_at >= ($2::date - 7)::timestamp at time zone '${TZ}'
           and w.completed_at < ($2::date)::timestamp at time zone '${TZ}')::int as "prevWeekCompleted"
       from public.work_orders w
      where w.tenant_id = $1 and w.deleted_at is null`,
      [t, weekStart],
    );
    const team = await tx.query<{ name: string; started: number; completed: number }>(
      `select concat_ws(' ', e.first_name, e.last_name) as name,
              count(*) filter (where w.started_at >= ($2::date)::timestamp at time zone '${TZ}'
                and w.started_at < ($2::date + 1)::timestamp at time zone '${TZ}')::int as started,
              count(*) filter (where w.completed_at >= ($2::date)::timestamp at time zone '${TZ}'
                and w.completed_at < ($2::date + 1)::timestamp at time zone '${TZ}')::int as completed
         from public.work_orders w
         join public.work_order_assignees a on a.tenant_id = w.tenant_id and a.work_order_id = w.id
         join public.employees e on e.tenant_id = a.tenant_id and e.id = a.employee_id
        where w.tenant_id = $1 and w.deleted_at is null
          and (w.started_at >= ($2::date)::timestamp at time zone '${TZ}'
               or w.completed_at >= ($2::date)::timestamp at time zone '${TZ}')
        group by e.id, e.first_name, e.last_name
        order by completed desc, started desc, name
        limit 8`,
      [t, today],
    );
    workOrders = {
      today: todayRows,
      todayCompleted: todayRows.filter((w) => w.status === "completed").length,
      todayInProgress: todayRows.filter((w) => w.status === "in_progress").length,
      weekScheduled: rows[0]?.weekScheduled ?? 0,
      weekCompleted: rows[0]?.weekCompleted ?? 0,
      prevWeekCompleted: rows[0]?.prevWeekCompleted ?? 0,
      team: team.rows,
      weekStart,
    };
  }

  let customers: CustomersSummary | null = null;
  if (can("customers.read")) {
    const { rows } = await tx.query<CustomersSummary>(
      `select
         count(*) filter (where is_active)::int as active,
         count(*) filter (where created_at >= ($2::date)::timestamp at time zone '${TZ}'
           and created_at < ($3::date)::timestamp at time zone '${TZ}')::int as "newInPeriod",
         count(*) filter (where created_at >= ($4::date)::timestamp at time zone '${TZ}'
           and created_at < ($5::date)::timestamp at time zone '${TZ}')::int as "newPrev"
       from public.customers
      where tenant_id = $1 and deleted_at is null`,
      [t, range.from, range.to, range.prevFrom, range.prevTo],
    );
    customers = rows[0] ?? { active: 0, newInPeriod: 0, newPrev: 0 };
  }

  const queues: QueueSummary = {
    reportsToApprove: can("work_reports.approve")
      ? (
          await tx.query<{ count: number; oldest: string | null }>(
            `select count(*)::int as count, to_char(min(report_date), 'YYYY-MM-DD') as oldest
               from public.work_reports
              where tenant_id = $1 and deleted_at is null and status = 'submitted'`,
            [t],
          )
        ).rows[0]!
      : null,
    formsOpen: can("forms.read")
      ? (
          await tx.query<{ count: number; oldest: Date | null }>(
            `select count(*)::int as count, min(created_at) as oldest
               from public.form_submissions
              where tenant_id = $1 and deleted_at is null and status = 'draft'`,
            [t],
          )
        ).rows[0]!
      : null,
    urgentTasks: can("tasks.read")
      ? (
          await tx.query<{ count: number; overdue: number }>(
            `select count(*)::int as count,
                    count(*) filter (where due_date < $2::date)::int as overdue
               from public.tasks
              where tenant_id = $1 and deleted_at is null
                and status in ('todo', 'in_progress') and priority in ('high', 'urgent')`,
            [t, today],
          )
        ).rows[0]!
      : null,
  };

  return { range, today, cash, workOrders, customers, queues };
}
