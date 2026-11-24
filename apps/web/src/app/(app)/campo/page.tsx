import { listNotifications, listWorkOrders, type WorkOrderRow } from "@cantiereos/core";
import { Bell, CalendarCheck2, Clock, MapPin, Navigation, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RouteMap } from "@/components/map/route-map";
import { buttonVariants } from "@/components/ui/button";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatRelative, todayInRome } from "@/lib/format";
import { mapTiles } from "@/lib/map-config";
import { WorkOrderStatusActions } from "../app/interventi/status-actions";
import {
  navigationUrl,
  PriorityBadge,
  timeOf,
  WorkOrderStatusBadge,
} from "../app/interventi/work-order-bits";
import { addDays, fieldHref, FieldOrderRow, longDay } from "./field-bits";

export const metadata: Metadata = { title: "Oggi" };

const isOpen = (o: WorkOrderRow) => o.status !== "completed" && o.status !== "cancelled";

function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat("it-IT", {
      hour: "numeric",
      hour12: false,
      timeZone: "Europe/Rome",
    }).format(new Date()),
  );
  return h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
}

/** La giornata del dipendente: il prossimo intervento in grande, la mappa, il resto. */
export default async function FieldTodayPage() {
  const { access } = await getAppContext();
  const today = todayInRome();
  const { orders, upcoming, notices, firstName } = await asCurrentUser(async (tx) => {
    const orders = await listWorkOrders(tx, access, { from: today, to: today, mine: true });
    const upcoming = orders.some(isOpen)
      ? []
      : (
          await listWorkOrders(tx, access, {
            from: addDays(today, 1),
            to: addDays(today, 14),
            mine: true,
          })
        ).filter(isOpen);
    const notices = await listNotifications(tx, access, 5);
    const u = await tx.query<{ name: string | null }>(
      `select coalesce(
         (select e.first_name from public.employees e
           where e.tenant_id = $1 and e.user_id = auth.uid() and e.deleted_at is null limit 1),
         (select split_part(full_name, ' ', 1) from public.users where id = auth.uid())) as name`,
      [access.tenantId],
    );
    return { orders, upcoming, notices, firstName: u.rows[0]?.name ?? null };
  });
  const next = orders.find((o) => o.status === "in_progress") ?? orders.find(isOpen);
  const others = orders.filter((o) => o !== next);
  const done = orders.filter((o) => o.status === "completed").length;
  const unread = notices.items.filter((n) => !n.readAt);

  return (
    <div className="space-y-6">
      <section className="cos-enter">
        <p className="text-sm text-muted-foreground first-letter:uppercase">{longDay(today)}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight" data-testid="field-greeting">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {orders.length === 0
            ? "Oggi non hai interventi in programma."
            : `${orders.length} ${orders.length === 1 ? "intervento" : "interventi"} oggi${
                done ? `, ${done} ${done === 1 ? "completato" : "completati"}` : ""
              }.`}
        </p>
        {orders.length > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700"
              style={{ width: `${Math.round((done / orders.length) * 100)}%` }}
            />
          </div>
        )}
      </section>

      {next ? (
        <section
          aria-label="Prossimo intervento"
          className="cos-enter cos-glass overflow-hidden rounded-3xl border border-primary/25 bg-card shadow-sm"
        >
          <Link href={fieldHref(next.id)} className="block p-5" data-testid="field-next">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                {next.status === "in_progress" ? "In corso" : "Prossimo"}
              </span>
              <span className="flex items-center gap-1.5">
                <PriorityBadge priority={next.priority} />
                <WorkOrderStatusBadge status={next.status} />
              </span>
            </div>
            <p className="mt-2 text-xl leading-snug font-semibold">{next.title}</p>
            {next.customerName && <p className="text-muted-foreground">{next.customerName}</p>}
            <div className="mt-3 space-y-1.5 text-sm">
              <p className="flex items-center gap-2">
                <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="tabular-nums">
                  {timeOf(next.start)} – {timeOf(next.end)}
                </span>
              </p>
              {next.address && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{next.address}</span>
                </p>
              )}
            </div>
          </Link>
          <div className="grid gap-2 border-t border-border/70 p-4">
            {next.address && (
              <a
                href={navigationUrl(next)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "secondary" }), "h-12 w-full text-base")}
              >
                <Navigation aria-hidden /> Naviga
              </a>
            )}
            <WorkOrderStatusActions
              id={next.id}
              status={next.status}
              isMine
              canPlan={false}
              size="lg"
            />
          </div>
        </section>
      ) : (
        <section className="cos-enter flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            {orders.length > 0 ? (
              <CalendarCheck2 className="size-6" />
            ) : (
              <Sparkles className="size-6" />
            )}
          </span>
          <p className="mt-3 font-medium">
            {orders.length > 0 ? "Hai chiuso tutto per oggi" : "Nessun intervento oggi"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {upcoming[0]
              ? `Il prossimo è ${longDay(upcoming[0].start.slice(0, 10))} alle ${timeOf(upcoming[0].start)}.`
              : "Quando l'ufficio ti assegna un lavoro, lo trovi qui e ricevi un avviso."}
          </p>
          {upcoming[0] && (
            <Link
              href={fieldHref(upcoming[0].id)}
              className={cn(buttonVariants({ variant: "secondary" }), "mt-4")}
            >
              Apri il prossimo
            </Link>
          )}
        </section>
      )}

      {orders.length > 0 && (
        <section aria-labelledby="field-map-title" className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 id="field-map-title" className="text-sm font-semibold">
              Il giro di oggi
            </h2>
            <Link href="/campo/mappa" className="text-sm font-medium text-primary">
              Mappa grande
            </Link>
          </div>
          <RouteMap
            tiles={mapTiles()}
            className="h-48"
            stops={orders.map((o) => ({
              id: o.id,
              title: o.title,
              time: timeOf(o.start),
              lat: o.latitude,
              lng: o.longitude,
              status: o.status,
              href: fieldHref(o.id),
            }))}
          />
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="field-others" className="space-y-2">
          <h2 id="field-others" className="text-sm font-semibold">
            {next ? "Poi" : "Oggi"}
          </h2>
          <ul className="space-y-2">
            {others.map((o) => (
              <li key={o.id}>
                <FieldOrderRow o={o} index={orders.indexOf(o) + 1} day={today} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {unread.length > 0 && (
        <section aria-labelledby="field-notices" className="space-y-2">
          <h2 id="field-notices" className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="size-4" aria-hidden /> Avvisi
            <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground tabular-nums">
              {unread.length}
            </span>
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {unread.map((n) => {
              const href = n.link?.replace(/^\/app\/interventi\//, "/campo/interventi/") ?? null;
              const body = (
                <>
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatRelative(n.createdAt)}
                  </p>
                </>
              );
              return (
                <li key={n.id}>
                  {href ? (
                    <Link href={href} className="block px-4 py-3 active:bg-accent">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
