import type { DeadlineSummary, HistoryEvent } from "@cantiereos/core";
import { AlertTriangle, CalendarClock, CheckCircle2, UserRound, UserX } from "lucide-react";
import Link from "next/link";
import { LabeledBars, MonthBars } from "@/components/charts/bar-charts";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { daysText, DeadlineStateBadge, formatDue } from "./scadenze/deadline-bits";

const KIND_LABELS: Record<string, string> = {
  certification: "Certificazioni",
  maintenance: "Manutenzioni",
  inspection: "Controlli periodici",
  document: "Documenti",
  payment: "Pagamenti",
  contract: "Contratti",
  other: "Altro",
};

/** "Richiede attenzione": ogni numero porta alla lista già filtrata. */
export function PrioritySection({ s }: { s: DeadlineSummary }) {
  const tiles = [
    {
      key: "overdue",
      label: "In ritardo",
      value: s.overdue,
      href: "/app/scadenze?state=overdue",
      icon: AlertTriangle,
      tone: s.overdue > 0 ? "danger" : "neutral",
    },
    {
      key: "week",
      label: "Entro 7 giorni",
      value: s.dueThisWeek,
      href: `/app/scadenze?from=${isoToday()}&to=${isoInDays(7)}`,
      icon: CalendarClock,
      tone: s.dueThisWeek > 0 ? "warning" : "neutral",
    },
    {
      key: "none",
      label: "Senza responsabile",
      value: s.withoutResponsible,
      href: "/app/scadenze?responsible=none",
      icon: UserX,
      tone: s.withoutResponsible > 0 ? "warning" : "neutral",
    },
    {
      key: "mine",
      label: "Assegnate a me",
      value: s.mine,
      href: "/app/scadenze?responsible=me",
      icon: UserRound,
      tone: "neutral",
    },
    {
      key: "done",
      label: "Completate (30 giorni)",
      value: s.completedLast30,
      href: "/app/scadenze?state=done",
      icon: CheckCircle2,
      tone: "neutral",
    },
  ] as const;

  return (
    <section aria-labelledby="priority-title" className="space-y-4" data-testid="priority">
      <h2
        id="priority-title"
        className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase"
      >
        Richiede attenzione
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t, i) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={t.href}
              data-testid={`priority-${t.key}`}
              className={cn(
                "cos-enter group rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/40",
                t.tone === "danger" && "border-danger/40",
                t.tone === "warning" && "border-warning/40",
                t.tone === "neutral" && "border-border",
              )}
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon
                  className={cn(
                    "size-4",
                    t.tone === "danger" && "text-danger",
                    t.tone === "warning" && "text-warning",
                  )}
                  aria-hidden
                />
                {t.label}
              </span>
              <span
                className="mt-1 block font-mono text-2xl font-semibold tabular-nums"
                data-testid="priority-value"
              >
                {t.value}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Da gestire subito"
            description="Scadenze superate o entro il preavviso."
            actions={
              <Link href="/app/scadenze" className="text-sm text-primary hover:underline">
                Tutte le scadenze
              </Link>
            }
          />
          {s.urgent.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Tutto in regola"
              description="Nessuna scadenza superata o vicina."
            />
          ) : (
            <ul className="divide-y divide-border" data-testid="urgent-list">
              {s.urgent.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/app/scadenze/${d.id}`}
                    className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-accent/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.subject?.name ?? "Nessun collegamento"}
                        {d.responsibleName ? ` · ${d.responsibleName}` : " · senza responsabile"}
                      </span>
                    </span>
                    <span className="text-right text-xs tabular-nums">
                      <span className="block">{formatDue(d.dueDate)}</span>
                      <span className="block text-muted-foreground">{daysText(d)}</span>
                    </span>
                    <DeadlineStateBadge state={d.state} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Scadenze aperte nei prossimi 6 mesi" />
          <CardBody className="space-y-6">
            <MonthBars
              data={s.byMonth}
              caption="Scadenze aperte per mese"
              hrefFor={(m) => `/app/scadenze?from=${m}-01&to=${lastDay(m)}`}
            />
            {s.byKind.length > 0 && (
              <LabeledBars
                rows={s.byKind.map((k) => ({
                  key: k.kind,
                  label: KIND_LABELS[k.kind] ?? k.kind,
                  value: k.open,
                  note: k.overdue > 0 ? `${k.overdue} in ritardo` : undefined,
                  href: `/app/scadenze?kind=${k.kind}`,
                }))}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </section>
  );
}

const VERB: Record<string, string> = {
  created: "ha creato",
  updated: "ha modificato",
  deleted: "ha eliminato",
  archived: "ha archiviato",
  restored: "ha riattivato",
  completed: "ha completato",
  reopened: "ha riaperto",
  cancelled: "ha annullato",
};

/** Ultime modifiche in forma leggibile, con link all'elemento e al registro. */
export function RecentChanges({ events }: { events: HistoryEvent[] }) {
  return (
    <Card>
      <CardHeader
        title="Ultime modifiche"
        description="Chi ha fatto cosa, dal registro attività."
        actions={
          <Link href="/app/registro" className="text-sm text-primary hover:underline">
            Apri il registro
          </Link>
        }
      />
      {events.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nessuna attività"
          description="Le modifiche ai dati compariranno qui."
        />
      ) : (
        <ul className="divide-y divide-border" data-testid="recent-activity">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{e.actorName ?? "Sistema"}</span>{" "}
                <span className="text-muted-foreground">
                  {VERB[e.verb]} {e.tableLabel.toLowerCase()}
                </span>{" "}
                {e.recordTitle &&
                  (e.href && e.verb !== "deleted" ? (
                    <Link href={e.href} className="hover:underline">
                      {e.recordTitle}
                    </Link>
                  ) : (
                    e.recordTitle
                  ))}
              </span>
              <time
                dateTime={new Date(e.at).toISOString()}
                className="text-xs text-muted-foreground tabular-nums"
              >
                {formatRelative(e.at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function isoToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}
function isoInDays(n: number) {
  return new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Rome",
  });
}
function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
