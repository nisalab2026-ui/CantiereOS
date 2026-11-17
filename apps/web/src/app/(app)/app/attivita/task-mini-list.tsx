import type { TaskRow } from "@cantiereos/core";
import { ListTodo } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/states";
import { formatDue } from "../scadenze/deadline-bits";
import { TaskPriority, TaskStatusBadge } from "./task-bits";

/** Attività collegate a un cliente o dipendente, nella sua scheda. */
export function TaskMiniList({ rows, emptyText }: { rows: TaskRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <EmptyState icon={ListTodo} title="Nessuna attività" description={emptyText} />;
  }
  return (
    <ul className="divide-y divide-border" data-testid="task-mini-list">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <Link href={`/app/attivita/${r.id}`} className="font-medium hover:underline">
              {r.title}
            </Link>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular-nums">
              <TaskPriority priority={r.priority} />
              {r.dueDate && <span>entro il {formatDue(r.dueDate)}</span>}
              {r.assigneeName && <span>{r.assigneeName}</span>}
            </p>
          </div>
          <TaskStatusBadge status={r.status} overdue={r.overdue} />
        </li>
      ))}
    </ul>
  );
}
