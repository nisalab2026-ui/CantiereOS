import type { PaymentRow } from "@cantiereos/core";
import { Wallet } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/states";
import { formatDue } from "../scadenze/deadline-bits";
import { Money, PaymentStateBadge } from "./payment-bits";

/** Pagamenti aperti di un cliente, nella sua scheda. */
export function PaymentMiniList({ rows, emptyText }: { rows: PaymentRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <EmptyState icon={Wallet} title="Nessun pagamento" description={emptyText} />;
  }
  return (
    <ul className="divide-y divide-border" data-testid="payment-mini-list">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <Link href={`/app/pagamenti/${r.id}`} className="font-medium hover:underline">
              {r.description}
            </Link>
            <p className="text-xs text-muted-foreground tabular-nums">
              entro il {formatDue(r.dueDate)}
              {r.referenceCode ? ` · ${r.referenceCode}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Money cents={r.amountCents} className="text-sm font-medium" />
            <PaymentStateBadge state={r.state} />
          </div>
        </li>
      ))}
    </ul>
  );
}
