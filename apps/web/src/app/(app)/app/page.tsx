import {
  DASHBOARD_LAYOUT_KEY,
  DASHBOARD_PERIODS,
  DASHBOARD_WIDGET_LABELS,
  dashboardLayoutSchema,
  getCommandCenter,
  getDashboard,
  getPreference,
  resolveDashboardLayout,
  type CommandCenter,
  type DashboardPeriod,
  type DashboardWidget,
  getDeadlineSummary,
  getDocumentExpirySummary,
  getPaymentSummary,
  getTaskSummary,
  listActivity,
  listMapPoints,
  listTasks,
  listWorkReports,
  loadWorkReportOptions,
  type DashboardData,
  type DeadlineSummary,
  type HistoryEvent,
  type MapData,
  type PaymentSummary,
  type TaskRow,
  type TaskSummary,
  type TeamSummary,
} from "@cantiereos/core";
import {
  Building2,
  CalendarClock,
  HardHat,
  ListTodo,
  MailPlus,
  Truck,
  Users,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PlacesMap } from "@/components/map/places-map";
import { mapTiles } from "@/lib/map-config";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { TaskMiniList } from "./attivita/task-mini-list";
import { Money } from "./pagamenti/payment-bits";
import { PrioritySection, RecentChanges } from "./priority";
import { TodayReportCard } from "./rapportini/today-card";
import { CustomizeDashboard } from "./_dashboard/customize";
import { CashTrend, KpiStrip, PeriodSwitch, Queues, WorkOrdersToday } from "./command-center";

export const metadata: Metadata = { title: "Panoramica" };

const NOTICES: Record<string, string> = {
  "azienda=creata": "Azienda creata. Il periodo di prova di 30 giorni è iniziato.",
  "invito=accettato": "Invito accettato: ora fai parte dell'azienda.",
  "password=aggiornata": "Password aggiornata. Le altre sessioni sono state chiuse.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const notice = Object.entries(NOTICES).find(([k]) => {
    const [key, value] = k.split("=");
    return sp[key!] === value;
  })?.[1];
  const { company, access } = await getAppContext();
  const canReport = access.permissions.has("work_reports.write");
  const canApproveReports = access.permissions.has("work_reports.approve");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const period: DashboardPeriod = (DASHBOARD_PERIODS as readonly string[]).includes(
    sp.periodo ?? "",
  )
    ? (sp.periodo as DashboardPeriod)
    : "month";
  const { data, deadlines, docs, activity, tasks, payments, reports, map, cc, layout } =
    await asCurrentUser(async (tx) => {
      const d = await getDashboard(tx, access);
      const center = d.kind === "admin" || d.kind === "manager";
      return {
        data: d,
        cc: center ? await getCommandCenter(tx, access, period, today) : null,
        layout: center
          ? await getPreference(tx, access, DASHBOARD_LAYOUT_KEY, dashboardLayoutSchema)
          : null,
        reports:
          canReport || canApproveReports
            ? {
                today: canReport
                  ? (
                      await listWorkReports(tx, access, {
                        mine: true,
                        from: today,
                        to: today,
                        status: "all",
                        pageSize: 5,
                      })
                    ).rows
                  : null,
                projects: canReport ? (await loadWorkReportOptions(tx, access)).projects : null,
                toApprove: canApproveReports
                  ? (await listWorkReports(tx, access, { status: "submitted", pageSize: 1 })).total
                  : null,
              }
            : null,
        deadlines: d.kind === "portal" ? null : await getDeadlineSummary(tx, access),
        docs:
          d.kind !== "portal" && access.permissions.has("documents.read")
            ? await getDocumentExpirySummary(tx, access)
            : null,
        activity:
          d.kind === "admin" && access.permissions.has("audit.read")
            ? (await listActivity(tx, access, { limit: 8 })).events
            : null,
        map:
          d.kind !== "portal" && access.permissions.has("customers.read")
            ? await listMapPoints(tx, access)
            : null,
        payments:
          (d.kind === "admin" || d.kind === "manager") && access.permissions.has("payments.read")
            ? await getPaymentSummary(tx, access)
            : null,
        tasks:
          d.kind !== "portal" && access.permissions.has("tasks.read")
            ? {
                summary: await getTaskSummary(tx, access),
                mine: (await listTasks(tx, access, { assignee: "me", state: "open", pageSize: 5 }))
                  .rows,
              }
            : null,
      };
    });

  const center =
    cc && (data.kind === "admin" || data.kind === "manager")
      ? commandCenterWidgets({ data, cc, deadlines, docs, activity, tasks, payments, map })
      : null;
  const arranged = center ? resolveDashboardLayout(layout, center.available) : null;

  return (
    <div className="space-y-6" data-testid={`dashboard-${data.kind}`}>
      {notice && <Notice>{notice}</Notice>}
      <PageHeader
        title={company.name}
        testId="company-name"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              Ruolo: <span data-testid="role-name">{company.roleName}</span>
            </span>
            {company.isDemo && <DemoBadge />}
          </span>
        }
        actions={
          center && arranged ? (
            <>
              <PeriodSwitch current={period} />
              <CustomizeDashboard
                items={[...arranged.visible, ...arranged.hidden].map((id) => ({
                  id,
                  label: DASHBOARD_WIDGET_LABELS[id],
                  visible: arranged.visible.includes(id),
                }))}
              />
            </>
          ) : undefined
        }
      />
      {company.isDemo && (
        <p
          className="rounded-md border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning"
          data-testid="demo-notice"
        >
          Azienda dimostrativa: tutti i dati che vedi vengono dal seed di sviluppo e non sono reali.
        </p>
      )}
      {reports && <TodayReportCard {...reports} />}
      {center && arranged ? (
        <>
          {arranged.visible.map((id, i) => (
            <div
              key={id}
              className="cos-enter"
              style={{ "--i": Math.min(i, 6) } as React.CSSProperties}
              data-widget={id}
            >
              {center.nodes[id]}
            </div>
          ))}
          {arranged.visible.length === 0 && (
            <EmptyState
              icon={UsersRound}
              title="Hai nascosto tutti i riquadri"
              description="Usa «Personalizza» per scegliere cosa vedere in panoramica."
            />
          )}
        </>
      ) : (
        <DashboardBody
          data={data}
          deadlines={deadlines}
          docs={docs}
          activity={activity}
          map={map && <MapOverview m={map} />}
          tasks={
            <>
              {tasks && <MyTasks {...tasks} />}
              {payments && <PaymentsOverview s={payments} />}
            </>
          }
        />
      )}
    </div>
  );
}

/**
 * Riquadri della panoramica di titolare, ufficio e responsabili. Un riquadro
 * esiste solo se la persona ha il permesso di vederne i dati.
 */
function commandCenterWidgets({
  data,
  cc,
  deadlines,
  docs,
  activity,
  tasks,
  payments,
  map,
}: {
  data: DashboardData;
  cc: CommandCenter;
  deadlines: DeadlineSummary | null;
  docs: { expired: number; expiring: number } | null;
  activity: HistoryEvent[] | null;
  tasks: { summary: TaskSummary; mine: TaskRow[] } | null;
  payments: PaymentSummary | null;
  map: MapData | null;
}): { available: DashboardWidget[]; nodes: Partial<Record<DashboardWidget, React.ReactNode>> } {
  const nodes: Partial<Record<DashboardWidget, React.ReactNode>> = {};
  const q = cc.queues;
  if (cc.cash || payments || cc.workOrders || cc.customers || q.reportsToApprove || q.urgentTasks) {
    nodes.kpis = <KpiStrip cc={cc} payments={payments} />;
  }
  if (cc.cash || payments) {
    nodes.cash = (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {cc.cash && <CashTrend cash={cc.cash} />}
        {payments && <PaymentsOverview s={payments} stacked={Boolean(cc.cash)} />}
      </div>
    );
  }
  if (deadlines) nodes.priority = <PrioritySection s={deadlines} docs={docs} />;
  if (cc.workOrders) nodes.work_orders = <WorkOrdersToday w={cc.workOrders} today={cc.today} />;
  if (tasks) nodes.tasks = <MyTasks {...tasks} />;
  if (q.reportsToApprove || q.formsOpen || q.urgentTasks) nodes.queues = <Queues q={q} />;
  if (map) nodes.map = <MapOverview m={map} />;
  if (activity !== null && data.kind === "admin")
    nodes.activity = <RecentChanges events={activity} />;
  nodes.organization = <Organization data={data} hideCustomers={cc.customers !== null} />;
  return { available: Object.keys(nodes) as DashboardWidget[], nodes };
}

/** Numeri dell'organizzazione: utenti, inviti, anagrafiche, squadre. */
function Organization({ data, hideCustomers }: { data: DashboardData; hideCustomers: boolean }) {
  if (data.kind === "admin") {
    return (
      <section className="space-y-3" aria-label="Azienda">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.activeMembers !== null && (
            <KpiCard
              index={0}
              label="Utenti attivi"
              value={data.activeMembers}
              {...(data.seats !== null ? { suffix: `/ ${data.seats} posti` } : {})}
              icon={Users}
              href="/app/membri"
            />
          )}
          {data.pendingInvitations !== null && (
            <KpiCard
              index={1}
              label="Inviti in attesa"
              value={data.pendingInvitations}
              icon={MailPlus}
              href="/app/membri"
            />
          )}
          {data.customers !== null && !hideCustomers && (
            <KpiCard
              index={2}
              label="Clienti attivi"
              value={data.customers}
              icon={Building2}
              href="/app/clienti"
            />
          )}
          {data.suppliers !== null && (
            <KpiCard
              index={3}
              label="Fornitori attivi"
              value={data.suppliers}
              icon={Truck}
              href="/app/fornitori"
            />
          )}
          {data.employees !== null && (
            <KpiCard
              index={4}
              label="Personale attivo"
              value={data.employees}
              icon={HardHat}
              href="/app/personale"
            />
          )}
        </div>
        {data.trialEndsAt && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="size-4" aria-hidden />
            Periodo di prova fino al {formatDate(data.trialEndsAt)}.
          </p>
        )}
      </section>
    );
  }
  if (data.kind === "manager") {
    return (
      <section className="space-y-4" aria-label="Organizzazione">
        <div className="grid gap-4 sm:grid-cols-3">
          {data.employees !== null && (
            <KpiCard
              index={0}
              label="Personale attivo"
              value={data.employees}
              icon={HardHat}
              href="/app/personale"
            />
          )}
          {data.customers !== null && !hideCustomers && (
            <KpiCard
              index={1}
              label="Clienti attivi"
              value={data.customers}
              icon={Building2}
              href="/app/clienti"
            />
          )}
          {data.sites !== null && (
            <KpiCard index={2} label="Sedi dei clienti" value={data.sites} icon={Building2} />
          )}
        </div>
        {data.teams !== null && <Teams teams={data.teams} title="Squadre" />}
      </section>
    );
  }
  return null;
}

function DashboardBody({
  data,
  deadlines,
  docs,
  activity,
  tasks,
  map,
}: {
  map: React.ReactNode;
  data: DashboardData;
  deadlines: DeadlineSummary | null;
  docs: { expired: number; expiring: number } | null;
  activity: HistoryEvent[] | null;
  tasks: React.ReactNode;
}) {
  const priority = deadlines ? <PrioritySection s={deadlines} docs={docs} /> : null;
  switch (data.kind) {
    case "admin":
    case "manager":
      // titolare, ufficio e responsabili usano il centro di controllo
      return null;
    case "technician":
      return (
        <>
          {tasks}
          <Card>
            <CardHeader title="La tua scheda" />
            <CardBody>
              {data.employee ? (
                <p className="text-sm">
                  <span className="font-medium">
                    {data.employee.firstName} {data.employee.lastName}
                  </span>
                  {data.employee.jobTitle && (
                    <span className="text-muted-foreground"> · {data.employee.jobTitle}</span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Il tuo account non è ancora collegato a una scheda del personale. Chiedi
                  all&apos;ufficio di collegarlo.
                </p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                L&apos;agenda degli interventi comparirà qui con il modulo cantieri e interventi.
              </p>
            </CardBody>
          </Card>
          {map}
          {data.teams !== null && <Teams teams={data.teams} title="Le tue squadre" />}
          {priority}
        </>
      );
    case "portal":
      return (
        <Card>
          <CardHeader title="Area cliente" />
          <CardBody>
            <p className="text-sm">
              {data.customer ? (
                <>
                  Accesso per <span className="font-medium">{data.customer.name}</span>.
                </>
              ) : (
                "Il tuo accesso non è collegato a un cliente."
              )}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Documenti e avanzamento lavori compariranno qui con il portale clienti.
            </p>
          </CardBody>
        </Card>
      );
  }
}

function MapOverview({ m }: { m: MapData }) {
  const placed = m.points.filter((p) => p.lat !== null);
  const n = (kind: string) => placed.filter((p) => p.kind === kind).length;
  const count = (k: string, one: string, many: string) => `${n(k)} ${n(k) === 1 ? one : many}`;
  const parts = [
    count("customer", "cliente", "clienti"),
    count("customer_site", "sede", "sedi"),
    ...(m.canSeeSites ? [count("project_site", "cantiere", "cantieri")] : []),
  ];
  return (
    <Card className="overflow-hidden" data-testid="dashboard-map">
      <CardHeader
        title="Mappa"
        description={`${parts.join(" · ")} sulla mappa${m.missing ? ` · ${m.missing} senza posizione` : ""}`}
        actions={
          <Link
            href="/app/clienti/mappa"
            className="text-sm font-medium text-primary hover:underline"
          >
            Apri la mappa
          </Link>
        }
      />
      <PlacesMap points={placed} tiles={mapTiles()} variant="compact" />
    </Card>
  );
}

function Teams({ teams, title }: { teams: TeamSummary[]; title: string }) {
  return (
    <Card>
      <CardHeader title={title} />
      {teams.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Nessuna squadra"
          description="Le squadre create compariranno qui."
        />
      ) : (
        <ul className="divide-y divide-border" data-testid="team-list">
          {teams.map((t) => (
            <li key={t.id}>
              <Link
                href={`/app/squadre?id=${t.id}`}
                className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-accent/40"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: t.color ?? "transparent" }}
                  aria-hidden
                />
                <span className="flex-1 font-medium">{t.name}</span>
                <span className="text-muted-foreground">
                  {t.leader ? `Caposquadra: ${t.leader}` : "Senza caposquadra"}
                </span>
                <Badge>
                  {t.members} {t.members === 1 ? "persona" : "persone"}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Le attività assegnate all'utente, con i numeri che portano alla lista filtrata. */
function MyTasks({ summary, mine }: { summary: TaskSummary; mine: TaskRow[] }) {
  const stats = [
    { label: "Assegnate a te", value: summary.mine, href: "/app/attivita?assignee=me" },
    {
      label: "In ritardo",
      value: summary.overdue,
      href: "/app/attivita?state=overdue",
      danger: true,
    },
    { label: "Aperte in azienda", value: summary.open, href: "/app/attivita" },
  ];
  return (
    <Card data-testid="my-tasks">
      <CardHeader
        title="Le tue attività"
        actions={
          <Link href="/app/calendario?mie=1" className="text-sm text-primary hover:underline">
            Apri il calendario
          </Link>
        }
      />
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="px-4 py-3 hover:bg-accent/40">
            <p
              className={`text-xl font-semibold tabular-nums ${s.danger && s.value > 0 ? "text-danger" : ""}`}
            >
              {s.value}
            </p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </Link>
        ))}
      </div>
      <CardBody>
        {mine.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ListTodo className="size-4" aria-hidden /> Nessuna attività aperta assegnata a te.
          </p>
        ) : (
          <TaskMiniList rows={mine} emptyText="" />
        )}
      </CardBody>
    </Card>
  );
}

/** Pagamenti attesi: ogni numero porta alla lista già filtrata. */
function PaymentsOverview({ s, stacked = false }: { s: PaymentSummary; stacked?: boolean }) {
  const stats = [
    {
      label: "Da incassare",
      cents: s.incomingOpenCents,
      href: "/app/pagamenti?direction=incoming",
      note: null,
    },
    {
      label: "Incassi in ritardo",
      cents: s.incomingOverdueCents,
      href: "/app/pagamenti?direction=incoming&state=overdue",
      note: s.incomingOverdue > 0 ? `${s.incomingOverdue} da sollecitare` : null,
      danger: s.incomingOverdue > 0,
    },
    {
      label: "Da pagare entro 30 giorni",
      cents: s.outgoingDueSoonCents,
      href: "/app/pagamenti?direction=outgoing",
      note: s.outgoingOverdue > 0 ? `${s.outgoingOverdue} già scaduti` : null,
      danger: s.outgoingOverdue > 0,
    },
  ];
  return (
    <Card data-testid="payments-overview">
      <CardHeader
        title="Pagamenti attesi"
        actions={
          <Link href="/app/pagamenti" className="text-sm text-primary hover:underline">
            Apri i pagamenti
          </Link>
        }
      />
      <div
        className={
          stacked
            ? "grid divide-y divide-border"
            : "grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        }
      >
        {stats.map((x) => (
          <Link key={x.label} href={x.href} className="px-5 py-4 hover:bg-accent/40">
            <p className="text-xs text-muted-foreground">{x.label}</p>
            <Money
              cents={x.cents}
              className={`text-xl font-semibold ${x.danger ? "text-danger" : ""}`}
            />
            {x.note && <p className="text-xs text-muted-foreground">{x.note}</p>}
          </Link>
        ))}
      </div>
    </Card>
  );
}
