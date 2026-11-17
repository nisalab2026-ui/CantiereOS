import type { DeadlineRow, DeadlineState } from "@cantiereos/core";
import { Badge } from "@/components/ui/badge";

const TONES: Record<DeadlineState, "danger" | "warning" | "info" | "success" | "neutral"> = {
  overdue: "danger",
  due_soon: "warning",
  scheduled: "info",
  done: "success",
  cancelled: "neutral",
};
const LABELS: Record<DeadlineState, string> = {
  overdue: "In ritardo",
  due_soon: "In scadenza",
  scheduled: "Programmata",
  done: "Completata",
  cancelled: "Annullata",
};

export function DeadlineStateBadge({ state }: { state: DeadlineState }) {
  return (
    <Badge tone={TONES[state]} data-testid="deadline-state">
      {LABELS[state]}
    </Badge>
  );
}

/** "tra 5 giorni", "oggi", "3 giorni fa" per le scadenze aperte. */
export function daysText(row: Pick<DeadlineRow, "daysLeft" | "state">): string | null {
  if (row.state === "done" || row.state === "cancelled") return null;
  const d = row.daysLeft;
  if (d === 0) return "oggi";
  if (d === 1) return "domani";
  if (d === -1) return "ieri";
  return d > 0 ? `tra ${d} giorni` : `${-d} giorni fa`;
}

export const SUBJECT_HREF: Record<string, string | null> = {
  customer: "/app/clienti",
  employee: "/app/personale",
  supplier: null,
  team: null,
};

export const SUBJECT_LABEL: Record<string, string> = {
  customer: "Cliente",
  employee: "Dipendente",
  supplier: "Fornitore",
  team: "Squadra",
};

export function formatDue(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
