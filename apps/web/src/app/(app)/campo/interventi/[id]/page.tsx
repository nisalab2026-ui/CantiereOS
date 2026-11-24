import { getWorkOrder, WORK_ORDER_KIND_LABELS, WORK_ORDER_STATUS_LABELS } from "@cantiereos/core";
import { ArrowLeft, ClipboardList, Clock, MapPin, Navigation, Phone, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { FieldNotes, WorkOrderStatusActions } from "../../../app/interventi/status-actions";
import {
  navigationUrl,
  PriorityBadge,
  timeOf,
  WorkOrderStatusBadge,
} from "../../../app/interventi/work-order-bits";
import { longDay } from "../../field-bits";

export const metadata: Metadata = { title: "Intervento" };

/** Tutto quello che serve sul posto, con le azioni grandi in fondo. */
export default async function FieldWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await getAppContext();
  const o = await asCurrentUser((tx) => getWorkOrder(tx, access, id));
  if (!o) notFound();
  const sameDay = o.start.slice(0, 10) === o.end.slice(0, 10);
  const canReport =
    access.permissions.has("work_reports.write") && o.projectId && o.status === "completed";

  return (
    <div className="space-y-4">
      <Link href="/campo" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Oggi
      </Link>

      <header className="cos-enter">
        <div className="flex flex-wrap items-center gap-1.5">
          <WorkOrderStatusBadge status={o.status} />
          <PriorityBadge priority={o.priority} />
          <Badge>{WORK_ORDER_KIND_LABELS[o.kind]}</Badge>
        </div>
        <h1
          className="mt-2 text-2xl leading-tight font-semibold tracking-tight"
          data-testid="field-order-title"
        >
          {o.title}
        </h1>
        {o.customerName && <p className="text-muted-foreground">{o.customerName}</p>}
      </header>

      {o.statusReason && (o.status === "suspended" || o.status === "cancelled") && (
        <p className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <strong>{WORK_ORDER_STATUS_LABELS[o.status]}:</strong> {o.statusReason}
        </p>
      )}

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="flex items-start gap-3">
          <Clock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="block first-letter:uppercase">{longDay(o.start.slice(0, 10))}</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {sameDay
                ? `${timeOf(o.start)} – ${timeOf(o.end)}`
                : `${timeOf(o.start)} → ${longDay(o.end.slice(0, 10))} ${timeOf(o.end)}`}
            </span>
          </span>
        </p>
        {o.address && (
          <p className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {o.siteName && (
                <span className="block text-sm text-muted-foreground">{o.siteName}</span>
              )}
              {o.address}
            </span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {o.address && (
            <a
              href={navigationUrl(o)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants(), "h-12 text-base", !o.customerPhone && "col-span-2")}
              data-testid="field-navigate"
            >
              <Navigation aria-hidden /> Naviga
            </a>
          )}
          {o.customerPhone && (
            <a
              href={`tel:${o.customerPhone.replace(/\s+/g, "")}`}
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "h-12 text-base",
                !o.address && "col-span-2",
              )}
            >
              <Phone aria-hidden /> Chiama
            </a>
          )}
        </div>
      </section>

      {o.description && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-1.5 text-sm font-semibold">Cosa fare</h2>
          <p className="whitespace-pre-line">{o.description}</p>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Note</h2>
        <FieldNotes id={o.id} notes={o.fieldNotes} canEdit={o.isMine || o.canPlan} />
      </section>

      {o.assignees.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4" aria-hidden /> Squadra
          </h2>
          <ul className="flex flex-wrap gap-2">
            {o.assignees.map((a) => (
              <li
                key={a.employeeId}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  a.isMe ? "border-primary/40 bg-primary/10 font-medium" : "border-border",
                )}
              >
                {a.isMe ? "Tu" : a.name}
                {a.isLead && <span className="ml-1 text-xs text-muted-foreground">· capo</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canReport && (
        <Link
          href="/app/rapportini"
          className={cn(buttonVariants({ variant: "secondary" }), "h-12 w-full text-base")}
        >
          <ClipboardList aria-hidden /> Compila il rapportino
        </Link>
      )}

      {o.events.length > 1 && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Storico</summary>
          <ol className="mt-3 space-y-2 text-sm">
            {o.events.map((e, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {WORK_ORDER_STATUS_LABELS[e.toStatus]}
                  {e.reason && <span className="text-muted-foreground"> · {e.reason}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(e.at)}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="cos-glass sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <WorkOrderStatusActions
          id={o.id}
          status={o.status}
          isMine={o.isMine}
          canPlan={o.canPlan}
          size="lg"
        />
      </div>
    </div>
  );
}
