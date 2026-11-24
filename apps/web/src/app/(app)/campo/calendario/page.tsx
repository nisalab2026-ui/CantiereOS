import { listWorkOrders, type WorkOrderRow } from "@cantiereos/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { todayInRome } from "@/lib/format";
import { addDays, FieldOrderRow, longDay } from "../field-bits";

export const metadata: Metadata = { title: "Calendario" };

type View = "giorno" | "settimana" | "mese";
const VIEWS: [View, string][] = [
  ["giorno", "Giorno"],
  ["settimana", "Settimana"],
  ["mese", "Mese"],
];
const WD = ["L", "M", "M", "G", "V", "S", "D"];
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
const dow = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
const mondayOf = (iso: string) => addDays(iso, -dow(iso));
const DOT: Record<WorkOrderRow["status"], string> = {
  scheduled: "bg-primary",
  in_progress: "bg-info",
  suspended: "bg-warning",
  completed: "bg-success",
  cancelled: "bg-muted-foreground/50",
};

export default async function FieldCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { access } = await getAppContext();
  const today = todayInRome();
  const view: View = sp.vista === "giorno" || sp.vista === "mese" ? sp.vista : "settimana";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : today;

  let from = day;
  let to = day;
  let grid: string[] = [day];
  if (view === "settimana") {
    from = mondayOf(day);
    to = addDays(from, 6);
    grid = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  } else if (view === "mese") {
    const first = `${day.slice(0, 7)}-01`;
    const last = addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1);
    from = mondayOf(first);
    to = addDays(last, 6 - dow(last));
    grid = [];
    for (let d = from; d <= to; d = addDays(d, 1)) grid.push(d);
  }
  const rows = await asCurrentUser((tx) => listWorkOrders(tx, access, { from, to, mine: true }));
  const on = (d: string) =>
    rows.filter((r) => r.start.slice(0, 10) <= d && r.end.slice(0, 10) >= d);

  const step = view === "giorno" ? 1 : view === "settimana" ? 7 : 0;
  const prev = step ? addDays(day, -step) : addDays(`${day.slice(0, 7)}-01`, -1);
  const next = step ? addDays(day, step) : addDays(`${day.slice(0, 7)}-01`, 32);
  const href = (p: { vista?: View; d?: string }) =>
    `/campo/calendario?vista=${p.vista ?? view}&d=${p.d ?? day}`;
  const title =
    view === "giorno"
      ? longDay(day)
      : view === "settimana"
        ? `${Number(from.slice(8))} – ${Number(to.slice(8))} ${MONTHS[Number(to.slice(5, 7)) - 1]}`
        : `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
  const listDays = view === "mese" ? [day] : grid;

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-3 rounded-full border border-border bg-card p-1"
        role="tablist"
      >
        {VIEWS.map(([v, l]) => (
          <Link
            key={v}
            href={href({ vista: v })}
            role="tab"
            aria-selected={view === v}
            className={cn(
              "rounded-full py-2 text-center text-sm font-medium transition-colors",
              view === v ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground",
            )}
          >
            {l}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={href({ d: prev })}
          aria-label="Precedente"
          className="flex size-10 items-center justify-center rounded-full border border-border bg-card"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <div className="text-center">
          <h1 className="font-semibold first-letter:uppercase" data-testid="field-cal-title">
            {title}
          </h1>
          {day !== today && (
            <Link href={href({ d: today })} className="text-xs font-medium text-primary">
              Torna a oggi
            </Link>
          )}
        </div>
        <Link
          href={href({ d: next })}
          aria-label="Successivo"
          className="flex size-10 items-center justify-center rounded-full border border-border bg-card"
        >
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      </div>

      {view !== "giorno" && (
        <div className="rounded-2xl border border-border bg-card p-2">
          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
            {WD.map((w, i) => (
              <span key={i} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {grid.map((d) => {
              const items = on(d);
              const outside = view === "mese" && d.slice(0, 7) !== day.slice(0, 7);
              return (
                <Link
                  key={d}
                  href={view === "mese" ? href({ d }) : `#g-${d}`}
                  aria-label={`${longDay(d)}: ${items.length} interventi`}
                  className={cn(
                    "mx-auto flex h-12 w-10 flex-col items-center justify-center gap-1 rounded-xl text-sm tabular-nums transition-colors",
                    d === day && view === "mese" && "bg-primary/12 font-semibold",
                    d === today && "text-primary font-semibold",
                    outside && "opacity-35",
                  )}
                >
                  {Number(d.slice(8))}
                  <span className="flex h-1.5 gap-0.5">
                    {items.slice(0, 3).map((r) => (
                      <span key={r.id} className={cn("size-1.5 rounded-full", DOT[r.status])} />
                    ))}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {listDays.map((d) => {
          const items = on(d);
          if (view === "settimana" && items.length === 0) return null;
          return (
            <section key={d} id={`g-${d}`} className="scroll-mt-20 space-y-2">
              {view !== "giorno" && (
                <h2
                  className={cn(
                    "text-sm font-semibold first-letter:uppercase",
                    d === today && "text-primary",
                  )}
                >
                  {longDay(d)}
                </h2>
              )}
              {items.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Nessun intervento.
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((r) => (
                    <li key={r.id}>
                      <FieldOrderRow o={r} day={d} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {view === "settimana" && rows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nessun intervento in questa settimana.
          </p>
        )}
      </div>
    </div>
  );
}
