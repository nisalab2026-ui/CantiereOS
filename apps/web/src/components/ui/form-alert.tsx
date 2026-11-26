"use client";

import { useEffect } from "react";
import { toast } from "./toaster";

/**
 * Esito di un modulo: l'errore resta nel modulo (role=alert), la conferma
 * compare come avviso a scomparsa.
 */
export function FormAlert({
  error,
  message,
}: {
  error?: string | undefined;
  message?: string | undefined;
}) {
  useEffect(() => {
    if (message) toast(message);
  }, [message]);
  return (
    <div aria-live="polite">
      {error && (
        <p
          role="alert"
          data-testid="form-error"
          className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
