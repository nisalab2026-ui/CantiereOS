import type { HistoryEvent, HistoryVerb } from "@cantiereos/core";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  CircleSlash,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/ui/states";

const VERBS: Record<HistoryVerb, { label: string; icon: LucideIcon; tone: string }> = {
  created: { label: "ha creato", icon: Plus, tone: "text-success bg-success/12" },
  updated: { label: "ha modificato", icon: Pencil, tone: "text-info bg-info/12" },
  deleted: { label: "ha eliminato", icon: Trash2, tone: "text-danger bg-danger/12" },
  archived: { label: "ha archiviato", icon: Archive, tone: "text-warning bg-warning/12" },
  restored: { label: "ha riattivato", icon: ArchiveRestore, tone: "text-success bg-success/12" },
  completed: { label: "ha completato", icon: CheckCircle2, tone: "text-success bg-success/12" },
  reopened: { label: "ha riaperto", icon: RotateCcw, tone: "text-info bg-info/12" },
  cancelled: { label: "ha annullato", icon: CircleSlash, tone: "text-muted-foreground bg-accent" },
};

const dayFmt = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Rome",
});
const timeFmt = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

/**
 * Cronologia: eventi raggruppati per giorno, con autore, operazione e per le
 * modifiche il confronto "prima → dopo" di ogni campo.
 */
export function Timeline({
  events,
  showRecord = true,
  emptyText = "Nessuna attività registrata.",
}: {
  events: HistoryEvent[];
  /** Mostra quale elemento è stato toccato (utile nel registro e per gli elementi collegati). */
  showRecord?: boolean | ((e: HistoryEvent) => boolean);
  emptyText?: string;
}) {
  if (events.length === 0) {
    return <EmptyState icon={History} title="Nessun evento" description={emptyText} />;
  }
  const groups: { day: string; items: HistoryEvent[] }[] = [];
  for (const e of events) {
    const day = dayFmt.format(new Date(e.at));
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }
  return (
    <div className="space-y-6" data-testid="timeline">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase first-letter:uppercase">
            {g.day}
          </h3>
          <ol className="relative space-y-3 border-l border-border pl-6">
            {g.items.map((e) => {
              const v = VERBS[e.verb];
              const Icon = v.icon;
              const record = typeof showRecord === "function" ? showRecord(e) : showRecord;
              return (
                <li key={e.id} className="relative" data-testid="timeline-event">
                  <span
                    className={cn(
                      "absolute top-0.5 -left-[2.15rem] flex size-6 items-center justify-center rounded-full ring-4 ring-background",
                      v.tone,
                    )}
                    aria-hidden
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <p className="text-sm">
                    <span className="font-medium">{e.actorName ?? "Sistema"}</span>{" "}
                    <span className="text-muted-foreground">{v.label}</span>{" "}
                    <span className="text-muted-foreground lowercase">{e.tableLabel}</span>
                    {record && e.recordTitle && (
                      <>
                        {" "}
                        {e.href && e.verb !== "deleted" ? (
                          <Link href={e.href} className="font-medium hover:underline">
                            {e.recordTitle}
                          </Link>
                        ) : (
                          <span className="font-medium">{e.recordTitle}</span>
                        )}
                      </>
                    )}
                    <time
                      dateTime={new Date(e.at).toISOString()}
                      title={formatDateTime(e.at)}
                      className="ml-2 text-xs text-muted-foreground tabular-nums"
                    >
                      {timeFmt.format(new Date(e.at))}
                    </time>
                  </p>
                  {e.verb !== "created" && e.changes.length > 0 && <ChangeList event={e} />}
                  {e.verb === "created" && e.changes.length > 0 && (
                    <details className="mt-1 text-xs text-muted-foreground">
                      <summary className="cursor-pointer select-none hover:text-foreground">
                        Dati iniziali ({e.changes.length})
                      </summary>
                      <ChangeList event={e} />
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ChangeList({ event }: { event: HistoryEvent }) {
  return (
    <dl className="mt-1.5 grid gap-1 rounded-md border border-border bg-background/40 px-3 py-2 text-xs">
      {event.changes.map((c) => (
        <div key={c.field} className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-3">
          <dt className="text-muted-foreground">{c.label}</dt>
          <dd className="min-w-0 break-words">
            {event.verb === "created" ? (
              c.after
            ) : (
              <>
                <span className="text-muted-foreground line-through decoration-danger/60">
                  {c.before ?? "vuoto"}
                </span>
                <span className="mx-1.5 text-muted-foreground" aria-label="diventa">
                  →
                </span>
                <span className="font-medium">{c.after ?? "vuoto"}</span>
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
