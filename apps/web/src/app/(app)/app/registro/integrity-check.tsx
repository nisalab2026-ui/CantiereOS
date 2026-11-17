"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNumber } from "@/lib/format";
import { verifyChainAction, type ChainCheck } from "./actions";

/**
 * Verifica su richiesta della catena di hash del registro (ADR-010): il database
 * ricalcola ogni hash e indica la prima voce alterata o mancante.
 */
export function IntegrityCheck() {
  const [result, setResult] = useState<ChainCheck | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => start(async () => setResult(await verifyChainAction()))}
      >
        <ShieldCheck aria-hidden /> {pending ? "Verifica in corso…" : "Verifica integrità"}
      </Button>
      <div
        role="status"
        aria-live="polite"
        className="max-w-sm text-right text-xs"
        data-testid="integrity-result"
      >
        {result && !result.ok && <span className="text-danger">{result.error}</span>}
        {result?.ok && result.valid && (
          <span className="text-success">
            Registro integro: {formatNumber(result.checked)} voci verificate il{" "}
            {formatDateTime(result.verifiedAt)}.
            {result.lastHash && (
              <span
                className="mt-0.5 block font-mono text-[11px] text-muted-foreground"
                title="Impronta dell'ultima voce: annotala per confronti futuri"
              >
                Impronta {result.lastHash.slice(0, 16)}…
              </span>
            )}
          </span>
        )}
        {result?.ok && !result.valid && (
          <span className="inline-flex items-start gap-1 text-danger">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Catena interrotta dopo {formatNumber(result.checked)} voci: una voce è stata alterata o
            rimossa direttamente nel database. Contatta il supporto.
          </span>
        )}
      </div>
    </div>
  );
}
