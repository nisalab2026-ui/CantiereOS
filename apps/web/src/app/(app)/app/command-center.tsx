import {
  DASHBOARD_PERIOD_LABELS,
  DASHBOARD_PERIODS,
  formatCents,
  type CommandCenter,
  type DashboardPeriod,
  type PaymentSummary,
  type QueueSummary,
  type WorkOrdersSummary,
} from "@cantiereos/core";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarCheck2,
  ClipboardCheck,
  ClipboardList,
  Flame,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { MonthBars } from "@/components/charts/bar-charts";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { timeOf, WorkOrderStatusBadge } from "./interventi/work-order-bits";

/* -------------------------------------------------------------------------- */
/* Periodo                                                                    */
/* -------------------------------------------------------------------------- */

/** Selettore di periodo: link veri (funziona senza JavaScript e si condivide). */
export function PeriodSwitch({ current }: { current: DashboardPeriod }) {
  return (
    <nav
      aria-label="Periodo"
      className="inline-flex rounded-full border border-border bg-card p-0.5 text-sm shadow-xs"
      data-testid="period-switch"
    >
      {DASHBOARD_PERIODS.map((p) => (
        <Link
          key={p}
          href={p === "month" ? "/app" : `/app?periodo=${p}`}
          aria-current={p === current ? "true" : undefined}
          className={cn(
            "rounded-full px-3 py-1 whitespace-nowrap transition-colors",
            p === current
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {DASHBOARD_PERIOD_LABELS[p]}
        </Link>
      ))}
    </nav>
  );
}

const COMPARE_LABEL: Record<DashboardPeriod, string> = {
  month: "stessi giorni del mese scorso",
  "last-month": "mese precedente",
  quarter: "stesso tratto del trimestre prima",
};

/* -------------------------------------------------------------------------- */
/* Indicatori                                                                 */
/* -------------------------------------------------------------------------- */

function Delta({ cur, prev, period }: { cur: number; prev: number; period: DashboardPeriod }) {
  if (prev === 0 && cur === 0) {
    return <span className="text-muted-foreground">Nessun dato da confrontare</span>;
  }
  if (prev === 0) {
    return (
      <span className="text-muted-foreground">
        Nessun valore nel periodo di confronto ({COMPARE_LABEL[period]})
      </span>
    );
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-sm px-1 font-medium tabular-nums",
          up ? "bg-success/12 text-success" : "bg-danger/12 text-danger",
        )}
        data-testid="kpi-delta"
      >
        <Icon className="size-3" aria-hidden />
        {up ? "+" : ""}
        {pct}%
      </span>
      <span className="text-muted-foreground">rispetto a {COMPARE_LABEL[period]}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  href,
  foot,
  tone = "neutral",
  index,
  testId,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  href: string;
  foot: React.ReactNode;
  tone?: "neutral" | "danger" | "warning";
  index: number;
  testId: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={cn(
        "cos-enter cos-lift group relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card p-4 shadow-xs transition-colors hover:border-primary/40",
        tone === "danger" ? "border-danger/40" : tone === "warning" ? "border-warning/40" : "",
        tone === "neutral" && "border-border",
      )}
      style={{ "--i": index } as React.CSSProperties}
    >
      <span aria-hidden className="cos-edge absolute inset-x-6 top-0 h-px opacity-70" />
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
          {label}
        </span>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
      </span>
      <span
        className="mt-2 truncate font-mono text-2xl font-semibold tracking-tight tabular-nums"
        data-testid="stat-value"
      >
        {value}
      </span>
      <span className="mt-1 text-xs">{foot}</span>
    </Link>
  );
}

/** Riga di indicatori: ognuno porta alla lista filtrata. */
export function KpiStrip({ cc, payments }: { cc: CommandCenter; payments: PaymentSummary | null }) {
  const p = cc.range.period;
  const tiles: React.ReactNode[] = [];
  if (cc.cash) {
    tiles.push(
      <Stat
        key="collected"
        testId="kpi-collected"
        label={`Incassato · ${DASHBOARD_PERIOD_LABELS[p].toLowerCase()}`}
        value={formatCents(cc.cash.collectedCents)}
        icon={Wallet}
        href="/app/pagamenti?direction=incoming&state=paid"
        foot={<Delta cur={cc.cash.collectedCents} prev={cc.cash.prevCollectedCents} period={p} />}
        index={tiles.length}
      />,
    );
  }
  if (payments) {
    tiles.push(
      <Stat
        key="open"
        testId="kpi-receivable"
        label="Da incassare"
        value={formatCents(payments.incomingOpenCents)}
        icon={Wallet}
        href={
          payments.incomingOverdue > 0
            ? "/app/pagamenti?direction=incoming&state=overdue"
            : "/app/pagamenti?direction=incoming"
        }
        tone={payments.incomingOverdue > 0 ? "danger" : "neutral"}
        foot={
          payments.incomingOverdue > 0 ? (
            <span className="text-danger">
              {payments.incomingOverdue} scadut{payments.incomingOverdue === 1 ? "o" : "i"} ·{" "}
              {formatCents(payments.incomingOverdueCents)}
            </span>
          ) : (
            <span className="text-muted-foreground">Nessun incasso in ritardo</span>
          )
        }
        index={tiles.length}
      />,
    );
  }
  if (cc.workOrders) {
    const w = cc.workOrders;
    tiles.push(
      <Stat
        key="wo"
        testId="kpi-work-orders"
        label="Interventi oggi"
        value={`${w.todayCompleted} / ${w.today.length}`}
        icon={CalendarCheck2}
        href={`/app/interventi?settimana=${cc.today}`}
        foot={
          <span className="text-muted-foreground">
            {w.today.length === 0
              ? "Nessun intervento in programma"
              : `completati${w.todayInProgress > 0 ? ` · ${w.todayInProgress} in corso` : ""}`}
          </span>
        }
        index={tiles.length}
      />,
    );
  }
  if (cc.customers) {
    tiles.push(
      <Stat
        key="cust"
        testId="kpi-customers"
        label="Clienti attivi"
        value={String(cc.customers.active)}
        icon={Building2}
        href="/app/clienti"
        foot={
          <span className="inline-flex flex-wrap items-center gap-1">
            <span className="font-medium">
              +{cc.customers.newInPeriod} nuov{cc.customers.newInPeriod === 1 ? "o" : "i"}
            </span>
            {cc.customers.newPrev > 0 ? (
              <Delta cur={cc.customers.newInPeriod} prev={cc.customers.newPrev} period={p} />
            ) : (
              <span className="text-muted-foreground">nel periodo</span>
            )}
          </span>
        }
        index={tiles.length}
      />,
    );
  }
  if (cc.queues.reportsToApprove) {
    const r = cc.queues.reportsToApprove;
    tiles.push(
      <Stat
        key="reports"
        testId="kpi-reports"
        label="Rapportini da approvare"
        value={String(r.count)}
        icon={ClipboardCheck}
        href="/app/rapportini?status=submitted"
        tone={r.count > 0 ? "warning" : "neutral"}
        foot={
          <span className="text-muted-foreground">
            {r.oldest ? `Il più vecchio è del ${formatDay(r.oldest)}` : "Nessuno in attesa"}
          </span>
        }
        index={tiles.length}
      />,
    );
  }
  if (cc.queues.urgentTasks) {
    const u = cc.queues.urgentTasks;
    tiles.push(
      <Stat
        key="tasks"
        testId="kpi-urgent-tasks"
        label="Attività urgenti"
        value={String(u.count)}
        icon={Flame}
        href="/app/attivita?sort=priority&dir=asc"
        tone={u.overdue > 0 ? "danger" : "neutral"}
        foot={
          u.overdue > 0 ? (
            <span className="text-danger">{u.overdue} in ritardo</span>
          ) : (
            <span className="text-muted-foreground">Priorità alta o urgente, aperte</span>
          )
        }
        index={tiles.length}
      />,
    );
  }
  if (tiles.length === 0) return null;
  return (
    <section aria-label="Indicatori principali" data-testid="kpi-strip">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {tiles}
      </div>
    </section>
  );
}

const dayFmt = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const formatDay = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));

/* -------------------------------------------------------------------------- */
/* Incassi                                                                    */
/* -------------------------------------------------------------------------- */

export function CashTrend({ cash }: { cash: NonNullable<CommandCenter["cash"]> }) {
  const total = cash.byMonth.reduce((s, m) => s + m.cents, 0);
  return (
    <Card data-testid="cash-trend">
      <CardHeader
        title="Andamento incassi"
        description={`Ultimi 6 mesi · ${formatCents(total)} incassati`}
        actions={
          <Link
            href="/app/pagamenti?direction=incoming&state=paid"
            className="text-sm text-primary hover:underline"
          >
            Vedi gli incassi
          </Link>
        }
      />
      <CardBody>
        {total === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nessun incasso registrato"
            description="Quando segni un pagamento in entrata come incassato, l'andamento compare qui."
          />
        ) : (
          <MonthBars
            data={cash.byMonth.map((m) => ({ month: m.month, count: m.cents }))}
            caption="Incassato per mese"
            valueLabel="Incassato"
            format={formatCents}
          />
        )}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Interventi                                                                 */
/* -------------------------------------------------------------------------- */

export function WorkOrdersToday({ w, today }: { w: WorkOrdersSummary; today: string }) {
  const weekDelta = w.weekCompleted - w.prevWeekCompleted;
  return (
    <Card data-testid="work-orders-today">
      <CardHeader
        title="Interventi"
        description={`Oggi ${w.today.length} · settimana: ${w.weekCompleted} completati su ${w.weekScheduled} in programma`}
        actions={
          <Link
            href={`/app/interventi?settimana=${today}`}
            className="text-sm text-primary hover:underline"
          >
            Apri la settimana
          </Link>
        }
      />
      <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:divide-x lg:divide-border">
        <div>
          {w.today.length === 0 ? (
            <EmptyState
              icon={CalendarCheck2}
              title="Nessun intervento oggi"
              description="Gli interventi pianificati per oggi compariranno qui, con il loro stato."
            />
          ) : (
            <ul className="divide-y divide-border" data-testid="today-orders">
              {w.today.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/app/interventi/${o.id}`}
                    className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-accent/40"
                  >
                    <span className="w-11 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {timeOf(o.start)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{o.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[o.customerName, o.assignees.map((a) => a.name).join(", ")]
                          .filter(Boolean)
                          .join(" · ") || "Nessuna squadra"}
                      </span>
                    </span>
                    <WorkOrderStatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
              {w.today.length > 6 && (
                <li className="px-5 py-2 text-xs text-muted-foreground">
                  e altri {w.today.length - 6}
                </li>
              )}
            </ul>
          )}
        </div>
        <div className="space-y-4 border-t border-border p-5 lg:border-t-0">
          <div>
            <p className="text-xs text-muted-foreground">Completati questa settimana</p>
            <p className="font-mono text-2xl font-semibold tabular-nums">{w.weekCompleted}</p>
            <p className="text-xs text-muted-foreground">
              {weekDelta === 0
                ? "come la settimana scorsa"
                : `${weekDelta > 0 ? "+" : ""}${weekDelta} rispetto alla settimana scorsa`}
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Squadra oggi</p>
            {w.team.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuno ha ancora avviato o chiuso interventi oggi.
              </p>
            ) : (
              <ul className="space-y-1 text-sm" data-testid="team-today">
                {w.team.map((m) => (
                  <li key={m.name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {m.completed > 0 && `${m.completed} chius${m.completed === 1 ? "o" : "i"}`}
                      {m.completed > 0 && m.started > 0 && " · "}
                      {m.started > 0 && `${m.started} avviat${m.started === 1 ? "o" : "i"}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Da chiudere                                                                */
/* -------------------------------------------------------------------------- */

export function Queues({ q }: { q: QueueSummary }) {
  const rows = [
    q.reportsToApprove && {
      key: "reports",
      icon: ClipboardCheck,
      label: "Rapportini da approvare",
      count: q.reportsToApprove.count,
      note: q.reportsToApprove.oldest ? `dal ${formatDay(q.reportsToApprove.oldest)}` : null,
      href: "/app/rapportini?status=submitted",
    },
    q.formsOpen && {
      key: "forms",
      icon: ClipboardList,
      label: "Moduli in compilazione",
      count: q.formsOpen.count,
      note: q.formsOpen.oldest ? `il primo ${formatRelative(q.formsOpen.oldest)}` : null,
      href: "/app/moduli?status=draft",
    },
    q.urgentTasks && {
      key: "tasks",
      icon: Flame,
      label: "Attività urgenti aperte",
      count: q.urgentTasks.count,
      note: q.urgentTasks.overdue > 0 ? `${q.urgentTasks.overdue} in ritardo` : null,
      href: "/app/attivita?sort=priority&dir=asc",
    },
  ].filter((r): r is Exclude<typeof r, null | undefined> => Boolean(r));
  if (rows.length === 0) return null;
  return (
    <Card data-testid="queues">
      <CardHeader title="Da chiudere" description="Lavoro iniziato che aspetta un passaggio." />
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.key}>
              <Link
                href={r.href}
                className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-accent/40"
                data-testid={`queue-${r.key}`}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.label}</span>
                  {r.note && (
                    <span className="block truncate text-xs text-muted-foreground">{r.note}</span>
                  )}
                </span>
                <span
                  className={cn(
                    "font-mono text-lg font-semibold tabular-nums",
                    r.count === 0 && "text-muted-foreground",
                  )}
                >
                  {r.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
