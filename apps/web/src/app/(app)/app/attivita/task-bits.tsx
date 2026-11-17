import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "@cantiereos/core";
import { ArrowDown, ArrowUp, ChevronsUp, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STATUS_TONES: Record<TaskStatus, "info" | "warning" | "success" | "neutral"> = {
  todo: "info",
  in_progress: "warning",
  done: "success",
  cancelled: "neutral",
};

export function TaskStatusBadge({ status, overdue }: { status: TaskStatus; overdue?: boolean }) {
  if (overdue) {
    return (
      <Badge tone="danger" data-testid="task-status">
        In ritardo
      </Badge>
    );
  }
  return (
    <Badge tone={STATUS_TONES[status]} data-testid="task-status">
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}

const PRIORITY_ICON = { low: ArrowDown, normal: Minus, high: ArrowUp, urgent: ChevronsUp };
const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: "text-muted-foreground",
  normal: "text-muted-foreground",
  high: "text-warning",
  urgent: "text-danger font-medium",
};

/** Priorità con icona e testo: mai solo colore. */
export function TaskPriority({ priority }: { priority: TaskPriority }) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${PRIORITY_CLASS[priority]}`}>
      <Icon className="size-3.5" aria-hidden />
      {TASK_PRIORITY_LABELS[priority]}
    </span>
  );
}
