import type { DocumentRow } from "@cantiereos/core";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

/** Scadenza del documento: rossa se superata, gialla entro 30 giorni. */
export function ExpiryBadge({ row }: { row: Pick<DocumentRow, "expiry" | "expiresOn"> }) {
  if (!row.expiresOn) return <span className="text-muted-foreground">—</span>;
  const tone =
    row.expiry === "expired" ? "danger" : row.expiry === "expiring" ? "warning" : "neutral";
  return (
    <Badge tone={tone} data-testid="document-expiry">
      {row.expiry === "expired" ? "Scaduto " : ""}
      {formatDate(row.expiresOn)}
    </Badge>
  );
}
