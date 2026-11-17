import type { DocumentRow } from "@cantiereos/core";
import { FileText, Lock } from "lucide-react";
import Link from "next/link";
import { ExpiryBadge } from "./document-bits";
import { CATEGORY_LABELS, formatBytes } from "./shared";

/** Elenco compatto dei documenti collegati (schede di clienti, personale…). */
export function DocumentMiniList({ rows, emptyText }: { rows: DocumentRow[]; emptyText: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border" data-testid="document-mini-list">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-2.5">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <Link href={`/app/documenti/${r.id}`} className="text-sm font-medium hover:underline">
              {r.title}
            </Link>
            {r.isConfidential && (
              <Lock className="ml-1.5 inline size-3.5 text-warning" aria-label="Riservato" />
            )}
            <p className="truncate text-xs text-muted-foreground">
              {CATEGORY_LABELS[r.category]}
              {r.fileName ? ` · ${r.fileName} · ${formatBytes(r.sizeBytes)}` : ""}
            </p>
          </div>
          {r.expiresOn && <ExpiryBadge row={r} />}
        </li>
      ))}
    </ul>
  );
}
