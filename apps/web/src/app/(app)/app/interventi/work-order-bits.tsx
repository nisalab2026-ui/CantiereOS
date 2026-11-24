import {
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from "@cantiereos/core";
import { Badge } from "@/components/ui/badge";

export const STATUS_TONE: Record<
  WorkOrderStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  scheduled: "neutral",
  in_progress: "info",
  suspended: "warning",
  completed: "success",
  cancelled: "danger",
};

/** Colore del bordo sinistro delle schede, per riconoscere lo stato a colpo d'occhio. */
export const STATUS_BAR: Record<WorkOrderStatus, string> = {
  scheduled: "border-l-primary",
  in_progress: "border-l-info",
  suspended: "border-l-warning",
  completed: "border-l-success",
  cancelled: "border-l-danger opacity-60",
};

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{WORK_ORDER_STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: WorkOrderPriority }) {
  if (priority === "normal" || priority === "low") return null;
  return (
    <Badge tone={priority === "urgent" ? "danger" : "warning"}>
      {WORK_ORDER_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

/** "08:30" da "AAAA-MM-GGTHH:MM". */
export const timeOf = (local: string) => local.slice(11, 16);
export const dateOf = (local: string) => local.slice(0, 10);

/** Percorso con l'app di mappe del telefono (Google Maps apre anche Apple Mappe su iPhone). */
export function navigationUrl(o: {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}) {
  const dest =
    o.latitude !== null && o.longitude !== null
      ? `${o.latitude},${o.longitude}`
      : (o.address ?? "");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}
