"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

/**
 * Errore inatteso in una pagina dell'area applicativa: nessun dettaglio
 * tecnico, solo il riferimento (digest) che compare anche nei log del server.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <ErrorState
        {...(error.digest ? { reference: error.digest } : {})}
        action={
          <Button variant="secondary" onClick={() => reset()}>
            Riprova
          </Button>
        }
      />
    </div>
  );
}
