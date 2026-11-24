import type { WorkOrderRow } from "@cantiereos/core";
import { ChevronRight, MapPin, Users } from "lucide-react";
import Link from "next/link";
import {
  PriorityBadge,
  STATUS_BAR,
  timeOf,
  WorkOrderStatusBadge,
} from "../app/interventi/work-order-bits";
import { cn } from "@/lib/cn";

export const fieldHref = (id: string) => `/campo/interventi/${id}`;

const DAY = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
/** "lunedì 24 novembre" da "AAAA-MM-GG". */
export const longDay = (iso: string) => DAY.format(new Date(`${iso}T12:00:00Z`));
export const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Riga di un intervento nelle liste del campo: tutto il tocco apre il dettaglio. */
export function FieldOrderRow({
  o,
  index,
  day,
}: {
  o: WorkOrderRow;
  /** numero della tappa sulla mappa */
  index?: number;
  /** giorno mostrato: per gli interventi su più giorni */
  day?: string;
}) {
  const startsToday = !day || o.start.slice(0, 10) === day;
  const endsToday = !day || o.end.slice(0, 10) === day;
  return (
    <Link
      href={fieldHref(o.id)}
      data-testid="field-order"
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-l-4 border-border bg-card p-3.5 shadow-xs transition active:scale-[0.99]",
        STATUS_BAR[o.status],
      )}
    >
      {index !== undefined && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular-nums">
          {index}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {startsToday ? timeOf(o.start) : "…"}–{endsToday ? timeOf(o.end) : "…"}
          </span>
          <PriorityBadge priority={o.priority} />
        </div>
        <p className="truncate font-medium">{o.title}</p>
        {o.customerName && (
          <p className="truncate text-sm text-muted-foreground">{o.customerName}</p>
        )}
        {o.address && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{o.address}</span>
          </p>
        )}
        {o.assignees.length > 1 && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Users className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              con{" "}
              {o.assignees
                .filter((a) => !a.isMe)
                .map((a) => a.name.split(" ")[0])
                .join(", ")}
            </span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <WorkOrderStatusBadge status={o.status} />
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </div>
    </Link>
  );
}
