import { listCalendar, type CalendarItem } from "@cantiereos/core";
import { CalendarClock, ChevronLeft, ChevronRight, ListTodo } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { sectionGate } from "@/lib/permissions";

export const metadata: Metadata = { title: "Calendario" };

const PATH = "/app/calendario";
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/** Data di oggi nel fuso dell'azienda (Italia), come YYYY-MM-DD. */
function todayInRome(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Griglia del mese: da lunedì a domenica, 5 o 6 settimane (massimo 42 giorni). */
function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = addDays(first, -((first.getUTCDay() + 6) % 7));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const end = addDays(last, 6 - ((last.getUTCDay() + 6) % 7));
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(iso(d));
  return days;
}

function parseMonth(v: string | undefined, today: string): [number, number] {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? "");
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    if (y >= 2000 && y <= 2100 && mo >= 0 && mo <= 11) return [y, mo];
  }
  return [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
}

const monthParam = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { access } = await getAppContext();
  const canTasks = access.permissions.has("tasks.read");
  const canDeadlines = access.permissions.has("deadlines.read");
  if (!canTasks && !canDeadlines) {
    const gate = sectionGate(access, "tasks.read");
    return <ForbiddenState needsMfa={gate === "mfa"} />;
  }

  const today = todayInRome();
  const [year, month] = parseMonth(sp.mese, today);
  const mine = sp.mie === "1";
  const days = monthGrid(year, month);
  const items = await asCurrentUser((tx) =>
    listCalendar(tx, access, { from: days[0]!, to: days[days.length - 1]!, mine }),
  );
  const byDay = new Map<string, CalendarItem[]>();
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);

  const link = (p: { mese?: string; mie?: boolean }) => {
    const q = new URLSearchParams();
    q.set("mese", p.mese ?? monthParam(year, month));
    if (p.mie ?? mine) q.set("mie", "1");
    return `${PATH}?${q.toString()}`;
  };
  const monthKey = monthParam(year, month);
  const inMonth = (d: string) => d.startsWith(monthKey);
  const agenda = days.filter((d) => inMonth(d) && byDay.has(d));

  return (
    <div>
      <PageHeader
        title="Calendario"
        description={
          canTasks && canDeadlines
            ? "Attività e scadenze del mese in un'unica vista."
            : canTasks
              ? "Le attività del mese."
              : "Le scadenze del mese."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-md border border-border p-0.5"
              role="group"
              aria-label="Mostra"
            >
              <Link
                href={link({ mie: false })}
                aria-current={!mine ? "true" : undefined}
                className={cn(
                  "rounded-sm px-3 py-1 text-sm",
                  !mine ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Tutte
              </Link>
              <Link
                href={link({ mie: true })}
                aria-current={mine ? "true" : undefined}
                className={cn(
                  "rounded-sm px-3 py-1 text-sm",
                  mine ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Solo mie
              </Link>
            </div>
          </div>
        }
      />

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <Link
            href={link({ mese: monthParam(year, month - 1) })}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Mese precedente"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold capitalize" data-testid="calendar-month">
              {MONTHS[month]} {year}
            </h2>
            {!today.startsWith(monthKey) && (
              <Link
                href={link({ mese: today.slice(0, 7) })}
                className="text-sm text-primary hover:underline"
              >
                Oggi
              </Link>
            )}
          </div>
          <Link
            href={link({ mese: monthParam(year, month + 1) })}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Mese successivo"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>

        {/* Griglia mensile (da tablet in su) */}
        <div className="hidden md:block">
          <div className="grid grid-cols-7 border-b border-border text-xs font-medium text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-1.5">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7" data-testid="calendar-grid">
            {days.map((d, i) => {
              const list = byDay.get(d) ?? [];
              return (
                <div
                  key={d}
                  className={cn(
                    "min-h-28 border-border p-1.5",
                    i % 7 !== 6 && "border-r",
                    i < days.length - 7 && "border-b",
                    !inMonth(d) && "bg-accent/30",
                  )}
                >
                  <p
                    className={cn(
                      "mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      d === today
                        ? "bg-primary font-semibold text-primary-foreground"
                        : inMonth(d)
                          ? "text-foreground"
                          : "text-muted-foreground",
                    )}
                  >
                    {Number(d.slice(8, 10))}
                  </p>
                  <ul className="space-y-1">
                    {list.slice(0, 4).map((it) => (
                      <li key={`${it.kind}-${it.id}`}>
                        <CalendarChip item={it} />
                      </li>
                    ))}
                    {list.length > 4 && (
                      <li className="px-1 text-xs text-muted-foreground">
                        +{list.length - 4} altre
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* Agenda (telefono) */}
        <div className="md:hidden" data-testid="calendar-agenda">
          {agenda.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Niente in programma questo mese.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {agenda.map((d) => (
                <li key={d} className="px-4 py-3">
                  <p
                    className={cn(
                      "mb-2 text-xs font-medium",
                      d === today ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {new Intl.DateTimeFormat("it-IT", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      timeZone: "UTC",
                    }).format(new Date(`${d}T00:00:00Z`))}
                    {d === today ? " · oggi" : ""}
                  </p>
                  <ul className="space-y-1.5">
                    {byDay.get(d)!.map((it) => (
                      <li key={`${it.kind}-${it.id}`}>
                        <CalendarChip item={it} large />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {canTasks && (
            <span className="inline-flex items-center gap-1">
              <ListTodo className="size-3.5" aria-hidden /> Attività
            </span>
          )}
          {canDeadlines && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden /> Scadenze
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-danger" aria-hidden /> In ritardo
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="line-through">Testo barrato</span> = completata
          </span>
        </div>
      </Card>
    </div>
  );
}

function CalendarChip({ item, large = false }: { item: CalendarItem; large?: boolean }) {
  const Icon = item.kind === "task" ? ListTodo : CalendarClock;
  const state = item.done ? "completata" : item.overdue ? "in ritardo" : null;
  return (
    <Link
      href={item.href}
      data-testid="calendar-item"
      title={`${item.kind === "task" ? "Attività" : "Scadenza"}: ${item.title}${item.ownerName ? ` · ${item.ownerName}` : ""}${state ? ` · ${state}` : ""}`}
      className={cn(
        "flex items-center gap-1 rounded-sm border-l-2 px-1.5 py-0.5 hover:bg-accent",
        large ? "text-sm" : "text-xs",
        item.overdue
          ? "border-danger bg-danger/8"
          : item.kind === "task"
            ? "border-primary bg-primary/6"
            : "border-info bg-info/8",
        item.done && "text-muted-foreground line-through",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{item.title}</span>
      {state && <span className="sr-only"> ({state})</span>}
    </Link>
  );
}
