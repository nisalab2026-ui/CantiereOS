import { formatCents, type PaymentState } from "@cantiereos/core";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TONES: Record<PaymentState, "info" | "danger" | "success" | "neutral"> = {
  open: "info",
  overdue: "danger",
  paid: "success",
  cancelled: "neutral",
};
const LABELS: Record<PaymentState, string> = {
  open: "Aperto",
  overdue: "In ritardo",
  paid: "Pagato",
  cancelled: "Annullato",
};

export function PaymentStateBadge({ state }: { state: PaymentState }) {
  return (
    <Badge tone={TONES[state]} data-testid="payment-state">
      {LABELS[state]}
    </Badge>
  );
}

/** Direzione con icona e testo (mai solo colore). */
export function PaymentDirection({ direction }: { direction: "incoming" | "outgoing" }) {
  return direction === "incoming" ? (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <ArrowDownLeft className="size-3.5" aria-hidden /> Da incassare
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-warning">
      <ArrowUpRight className="size-3.5" aria-hidden /> Da pagare
    </span>
  );
}

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={`tabular-nums ${className ?? ""}`}>{formatCents(cents)}</span>;
}

/** Centesimi → testo per il campo importo ("1250,50"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
