import { getWorkOrder, WORK_ORDER_KIND_LABELS, WORK_ORDER_STATUS_LABELS } from "@cantiereos/core";
import { Navigation, Pencil, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { FieldNotes, WorkOrderStatusActions } from "../status-actions";
import { navigationUrl, PriorityBadge, timeOf, WorkOrderStatusBadge } from "../work-order-bits";

export const metadata: Metadata = { title: "Intervento" };

const DAY = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayLabel = (local: string) => DAY.format(new Date(`${local.slice(0, 10)}T12:00:00Z`));

export default async function WorkOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "work_orders.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const o = await asCurrentUser((tx) => getWorkOrder(tx, access, id));
  if (!o) notFound();
  const sameDay = o.start.slice(0, 10) === o.end.slice(0, 10);
  const when = sameDay
    ? `${dayLabel(o.start)}, ${timeOf(o.start)}–${timeOf(o.end)}`
    : `dal ${dayLabel(o.start)} ${timeOf(o.start)} al ${dayLabel(o.end)} ${timeOf(o.end)}`;

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumbs
        items={[{ label: "Interventi", href: "/app/interventi" }, { label: o.number }]}
      />
      <PageHeader
        title={o.title}
        testId="work-order-title"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{o.number}</span>
            <WorkOrderStatusBadge status={o.status} />
            <PriorityBadge priority={o.priority} />
            <Badge>{WORK_ORDER_KIND_LABELS[o.kind]}</Badge>
          </span>
        }
        actions={
          o.canPlan ? (
            <Link
              href={`/app/interventi/${o.id}/modifica`}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Pencil aria-hidden /> Modifica
            </Link>
          ) : undefined
        }
      />

      {(sp.creato || sp.salvato) && (
        <div className="mb-4">
          <Notice>
            {sp.creato ? "Intervento creato: la squadra è stata avvisata." : "Intervento salvato."}
          </Notice>
        </div>
      )}
      {o.statusReason && (o.status === "suspended" || o.status === "cancelled") && (
        <div className="mb-4">
          <Notice tone="warning">
            {WORK_ORDER_STATUS_LABELS[o.status]}: {o.statusReason}
          </Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <DetailList
              items={[
                {
                  label: "Quando",
                  value: <span className="first-letter:uppercase">{when}</span>,
                  wide: true,
                },
                {
                  label: "Cliente",
                  value: o.customerId ? (
                    <Link href={`/app/clienti/${o.customerId}`} className="hover:underline">
                      {o.customerName}
                    </Link>
                  ) : null,
                },
                {
                  label: "Commessa",
                  value: o.projectId ? (
                    <Link href={`/app/commesse/${o.projectId}`} className="hover:underline">
                      {o.projectLabel}
                    </Link>
                  ) : null,
                },
                { label: o.projectSiteId ? "Cantiere" : "Sede", value: o.siteName },
                { label: "Indirizzo", value: o.address },
                { label: "Descrizione del lavoro", value: o.description, wide: true },
              ]}
            />
            {(o.address || o.customerPhone) && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                {o.address && (
                  <a
                    href={navigationUrl(o)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    <Navigation aria-hidden /> Naviga
                  </a>
                )}
                {o.customerPhone && (
                  <a
                    href={`tel:${o.customerPhone.replace(/\s+/g, "")}`}
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    <Phone aria-hidden /> Chiama {o.customerPhone}
                  </a>
                )}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Note dal campo</h2>
            <FieldNotes id={o.id} notes={o.fieldNotes} canEdit={o.isMine || o.canPlan} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Stato</h2>
            <WorkOrderStatusActions
              id={o.id}
              status={o.status}
              isMine={o.isMine}
              canPlan={o.canPlan}
              canDelete={access.permissions.has("work_orders.delete")}
            />
            {(o.startedAt || o.completedAt) && (
              <p className="mt-3 text-xs text-muted-foreground">
                {o.startedAt && <>Iniziato {formatDateTime(o.startedAt)}</>}
                {o.completedAt && <> · completato {formatDateTime(o.completedAt)}</>}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Squadra</h2>
            {o.assignees.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuno assegnato.</p>
            ) : (
              <ul className="space-y-2" data-testid="work-order-crew">
                {o.assignees.map((a) => (
                  <li key={a.employeeId} className="flex items-center gap-2 text-sm">
                    <span
                      aria-hidden
                      className="flex size-7 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary"
                    >
                      {a.name
                        .split(" ")
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    {a.isLead && <Badge tone="info">Capo squadra</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Storico</h2>
            <ol
              className="relative space-y-3 border-l border-border pl-4"
              data-testid="work-order-events"
            >
              {o.events.map((e, i) => (
                <li key={i} className="text-sm">
                  <span
                    aria-hidden
                    className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary/60"
                  />
                  <p className="font-medium">{WORK_ORDER_STATUS_LABELS[e.toStatus]}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(e.at)}
                    {e.actorName && ` · ${e.actorName}`}
                  </p>
                  {e.reason && <p className="mt-0.5 text-xs">{e.reason}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
