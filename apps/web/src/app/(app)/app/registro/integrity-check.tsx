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
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card/60 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Integrità del registro</p>
        <div role="status" aria-live="polite" className="text-xs" data-testid="integrity-result">
          {!result && (
            <span className="text-muted-foreground">
              Ogni voce è concatenata alla precedente con un&apos;impronta crittografica: la
              verifica rileva voci alterate o rimosse.
            </span>
          )}
          {result && !result.ok && <span className="text-danger">{result.error}</span>}
          {result?.ok && result.valid && (
            <span className="text-success">
              Registro integro: {formatNumber(result.checked)} voci verificate il{" "}
              {formatDateTime(result.verifiedAt)}.
              {result.lastHash && (
                <span
                  className="ml-2 font-mono text-muted-foreground"
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
              Catena interrotta dopo {formatNumber(result.checked)} voci: una voce è stata alterata
              o rimossa direttamente nel database. Contatta il supporto.
            </span>
          )}
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => start(async () => setResult(await verifyChainAction()))}
      >
        <ShieldCheck aria-hidden /> {pending ? "Verifica in corso…" : "Verifica integrità"}
      </Button>
    </div>
  );
}
