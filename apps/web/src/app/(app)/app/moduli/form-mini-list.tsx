import type { FormSubmissionRow } from "@cantiereos/core";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { FormStatusBadge } from "./form-bits";

/** Ultimi moduli (scheda cliente). */
export function FormMiniList({
  rows,
  emptyText,
}: {
  rows: FormSubmissionRow[];
  emptyText: string;
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border" data-testid="form-mini-list">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <Link href={`/app/moduli/${r.id}`} className="font-medium hover:underline">
              {r.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              {[
                r.subjectCode && `Impianto ${r.subjectCode}`,
                r.site?.name,
                formatDateTime(r.completedAt ?? r.updatedAt),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <FormStatusBadge status={r.status} />
        </li>
      ))}
    </ul>
  );
}
