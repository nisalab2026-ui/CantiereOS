import type { DeadlineRow } from "@cantiereos/core";
import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/states";
import { daysText, DeadlineStateBadge, formatDue } from "./deadline-bits";

/** Scadenze di un cliente o dipendente, nella sua scheda. */
export function DeadlineMiniList({ rows, emptyText }: { rows: DeadlineRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <EmptyState icon={CalendarClock} title="Nessuna scadenza" description={emptyText} />;
  }
  return (
    <ul className="divide-y divide-border" data-testid="deadline-mini-list">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <Link href={`/app/scadenze/${r.id}`} className="font-medium hover:underline">
              {r.title}
            </Link>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatDue(r.dueDate)}
              {daysText(r) ? ` · ${daysText(r)}` : ""}
              {r.responsibleName ? ` · ${r.responsibleName}` : ""}
            </p>
          </div>
          <DeadlineStateBadge state={r.state} />
        </li>
      ))}
    </ul>
  );
}
