import { listWorkOrders, type WorkOrderRow } from "@cantiereos/core";
import { CalendarRange, ChevronLeft, ChevronRight, MapPin, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { todayInRome } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { PriorityBadge, STATUS_BAR, timeOf, WorkOrderStatusBadge } from "./work-order-bits";

export const metadata: Metadata = { title: "Interventi" };

const PATH = "/app/interventi";
const WEEKDAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
};
const label = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "work_orders.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canPlan = access.permissions.has("work_orders.write");
  const seesAll = access.permissions.has("work_orders_all.read");

  const today = todayInRome();
  const week = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.settimana ?? "") ? sp.settimana! : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const mine = !seesAll || sp.miei === "1";
  const rows = await asCurrentUser((tx) =>
    listWorkOrders(tx, access, { from: days[0]!, to: days[6]!, mine }),
  );
  const byDay = new Map<string, WorkOrderRow[]>();
  for (const r of rows) {
    // un intervento su più giorni compare in ognuno
    for (const d of days) {
      if (r.start.slice(0, 10) <= d && r.end.slice(0, 10) >= d) {
        byDay.set(d, [...(byDay.get(d) ?? []), r]);
      }
    }
  }
  const link = (p: { settimana?: string; miei?: boolean }) => {
    const q = new URLSearchParams();
    q.set("settimana", p.settimana ?? week);
    if (p.miei ?? (seesAll && mine)) q.set("miei", "1");
    return `${PATH}?${q.toString()}`;
  };
  const open = rows.filter((r) => r.status !== "cancelled" && r.status !== "completed").length;

  return (
    <div>
      <PageHeader
        title="Interventi"
        description={
          rows.length === 0
            ? "Le uscite della settimana, con orario, luogo e squadra."
            : `${rows.length} ${rows.length === 1 ? "intervento" : "interventi"} in settimana, ${open} da chiudere.`
        }
        actions={
          <>
            {seesAll && (
              <div
                className="inline-flex rounded-md border border-border p-0.5"
                role="group"
                aria-label="Mostra"
              >
                {[
                  [false, "Tutti"],
                  [true, "Solo miei"],
                ].map(([v, l]) => (
                  <Link
                    key={String(l)}
                    href={link({ miei: v as boolean })}
                    aria-current={mine === v ? "true" : undefined}
                    className={cn(
                      "rounded-sm px-3 py-1 text-sm transition-colors",
                      mine === v
                        ? "bg-accent font-medium"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {l as string}
                  </Link>
                ))}
              </div>
            )}
            {canPlan && (
              <Link
                href={`${PATH}/nuovo`}
                className={buttonVariants()}
                data-testid="new-work-order"
              >
                <Plus aria-hidden /> Nuovo intervento
              </Link>
            )}
          </>
        }
      />

      {sp.eliminato && (
        <div className="mb-4">
          <Notice>Intervento eliminato. La sua cronologia resta nel registro attività.</Notice>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={link({ settimana: addDays(week, -7) })}
            className={buttonVariants({ variant: "secondary", size: "icon" })}
            aria-label="Settimana precedente"
          >
            <ChevronLeft aria-hidden />
          </Link>
          <Link
            href={link({ settimana: mondayOf(today) })}
            className={buttonVariants({ variant: "secondary" })}
          >
            Oggi
          </Link>
          <Link
            href={link({ settimana: addDays(week, 7) })}
            className={buttonVariants({ variant: "secondary", size: "icon" })}
            aria-label="Settimana successiva"
          >
            <ChevronRight aria-hidden />
          </Link>
        </div>
        <p className="text-sm font-medium" data-testid="week-label">
          {label(days[0]!)} – {label(days[6]!)} {days[6]!.slice(0, 4)}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={CalendarRange}
            title="Nessun intervento in questa settimana"
            description={
              canPlan
                ? "Crea un intervento: scegli cliente, orario e squadra. Chi è in squadra riceve un avviso."
                : "Quando l'ufficio ti assegna un intervento lo trovi qui."
            }
            {...(canPlan
              ? {
                  action: (
                    <Link href={`${PATH}/nuovo`} className={buttonVariants()}>
                      <Plus aria-hidden /> Nuovo intervento
                    </Link>
                  ),
                }
              : {})}
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {days.map((d, i) => {
            const items = byDay.get(d) ?? [];
            const isToday = d === today;
            return (
              <section
                key={d}
                aria-label={`${WEEKDAYS[i]} ${label(d)}`}
                className={cn(
                  "flex min-h-28 flex-col rounded-xl border bg-card/60 p-2",
                  isToday ? "border-primary/50 ring-1 ring-primary/20" : "border-border",
                  items.length === 0 && "hidden xl:flex",
                )}
              >
                <header className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className={cn("text-sm font-semibold", isToday && "text-primary")}>
                    {WEEKDAYS[i]}{" "}
                    <span className="font-normal text-muted-foreground">{label(d)}</span>
                  </h2>
                  {items.length > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {items.length}
                    </span>
                  )}
                </header>
                <ul className="space-y-2">
                  {items.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`${PATH}/${r.id}`}
                        data-testid="work-order-card"
                        className={cn(
                          "block rounded-lg border border-l-4 border-border bg-card p-2.5 text-sm shadow-xs transition hover:-translate-y-px hover:shadow-sm",
                          STATUS_BAR[r.status],
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            {r.start.slice(0, 10) === d ? timeOf(r.start) : "…"}–
                            {r.end.slice(0, 10) === d ? timeOf(r.end) : "…"}
                          </span>
                          <PriorityBadge priority={r.priority} />
                        </div>
                        <p className="mt-1 leading-snug font-medium">{r.title}</p>
                        {r.customerName && (
                          <p className="truncate text-xs text-muted-foreground">{r.customerName}</p>
                        )}
                        {r.address && (
                          <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                            <MapPin className="mt-px size-3 shrink-0" aria-hidden />
                            <span className="line-clamp-2">{r.address}</span>
                          </p>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                            <Users className="size-3 shrink-0" aria-hidden />
                            <span className="truncate">
                              {r.assignees.length === 0
                                ? "Nessuno"
                                : r.assignees.map((a) => a.name.split(" ")[0]).join(", ")}
                            </span>
                          </span>
                          <WorkOrderStatusBadge status={r.status} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
