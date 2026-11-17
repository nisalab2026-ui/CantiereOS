import type { CommunicationRow } from "@cantiereos/core";
import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/format";
import { formatDue } from "../scadenze/deadline-bits";
import { ChannelLabel } from "./communication-bits";

/** Ultime comunicazioni con un cliente, fornitore o dipendente, nella sua scheda. */
export function CommunicationMiniList({
  rows,
  emptyText,
}: {
  rows: CommunicationRow[];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={MessagesSquare} title="Nessuna comunicazione" description={emptyText} />
    );
  }
  return (
    <ul className="divide-y divide-border" data-testid="communication-mini-list">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <Link href={`/app/comunicazioni/${r.id}`} className="font-medium hover:underline">
              {r.subject}
            </Link>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <ChannelLabel channel={r.channel} direction={r.direction} />
              <span className="tabular-nums">{formatDateTime(r.occurredAt)}</span>
              {r.contactName && <span>{r.contactName}</span>}
            </p>
          </div>
          {r.followUpDate && !r.followUpDone && (
            <Badge tone={r.followUpOverdue ? "danger" : "warning"}>
              Richiamare {formatDue(r.followUpDate)}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
