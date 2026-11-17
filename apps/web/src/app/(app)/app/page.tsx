import {
  getDashboard,
  getDeadlineSummary,
  getDocumentExpirySummary,
  listActivity,
  type DashboardData,
  type DeadlineSummary,
  type HistoryEvent,
  type TeamSummary,
} from "@cantiereos/core";
import {
  Building2,
  CalendarClock,
  HardHat,
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
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { PrioritySection, RecentChanges } from "./priority";

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
  const { data, deadlines, docs, activity } = await asCurrentUser(async (tx) => {
    const d = await getDashboard(tx, access);
    return {
      data: d,
      deadlines: d.kind === "portal" ? null : await getDeadlineSummary(tx, access),
      docs:
        d.kind !== "portal" && access.permissions.has("documents.read")
          ? await getDocumentExpirySummary(tx, access)
          : null,
      activity:
        d.kind === "admin" && access.permissions.has("audit.read")
          ? (await listActivity(tx, access, { limit: 8 })).events
          : null,
    };
  });

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
      />
      {company.isDemo && (
        <p
          className="rounded-md border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning"
          data-testid="demo-notice"
        >
          Azienda dimostrativa: tutti i dati che vedi vengono dal seed di sviluppo e non sono reali.
        </p>
      )}
      <DashboardBody data={data} deadlines={deadlines} docs={docs} activity={activity} />
    </div>
  );
}

function DashboardBody({
  data,
  deadlines,
  docs,
  activity,
}: {
  data: DashboardData;
  deadlines: DeadlineSummary | null;
  docs: { expired: number; expiring: number } | null;
  activity: HistoryEvent[] | null;
}) {
  const priority = deadlines ? <PrioritySection s={deadlines} docs={docs} /> : null;
  switch (data.kind) {
    case "admin":
      return (
        <>
          {priority}
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
            {data.customers !== null && (
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
          {activity !== null && (
            <div className="cos-enter" style={{ "--i": 5 } as React.CSSProperties}>
              <RecentChanges events={activity} />
            </div>
          )}
        </>
      );
    case "manager":
      return (
        <>
          {priority}
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
            {data.customers !== null && (
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
          {data.teams !== null && (
            <div className="cos-enter" style={{ "--i": 3 } as React.CSSProperties}>
              <Teams teams={data.teams} title="Squadre" />
            </div>
          )}
        </>
      );
    case "technician":
      return (
        <>
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
