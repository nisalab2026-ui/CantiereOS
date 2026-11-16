"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms";
import { confirmMfaEnrollment, startMfaEnrollment, type EnrollState } from "../../actions";

/** Configurazione di un'app di autenticazione (TOTP) in due passi. */
export function MfaEnrollment() {
  const [started, start] = useActionState(startMfaEnrollment, {} as EnrollState);
  const [confirmed, confirm] = useActionState(confirmMfaEnrollment, {} as EnrollState);

  if (confirmed.message) {
    return (
      <p className="text-sm text-success" role="status">
        {confirmed.message} Ricarica la pagina per continuare.
      </p>
    );
  }
  if (!started.factorId) {
    return (
      <form action={start} className="space-y-2">
        {started.error && (
          <p role="alert" className="text-sm text-danger">
            {started.error}
          </p>
        )}
        <SubmitButton>Configura app di autenticazione</SubmitButton>
      </form>
    );
  }
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Apri un&apos;app di autenticazione (es. quella del tuo telefono per i codici a 6 cifre).
        </li>
        <li>Inquadra il codice QR oppure inserisci a mano la chiave.</li>
        <li>Scrivi qui il codice a 6 cifre che l&apos;app mostra.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- QR SVG generato da Supabase Auth */}
      <img
        src={started.qrCode}
        alt="Codice QR per l'app di autenticazione"
        className="size-44 rounded-md bg-white p-2"
      />
      <p className="text-xs">
        Chiave:{" "}
        <code className="break-all font-mono" data-testid="totp-secret">
          {started.secret}
        </code>
      </p>
      <form action={confirm} className="flex items-end gap-2">
        <input type="hidden" name="factorId" value={started.factorId} />
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">Codice</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="h-10 w-32 rounded-md border border-line bg-surface px-3 text-sm"
          />
        </label>
        <SubmitButton>Attiva</SubmitButton>
      </form>
      {confirmed.error && (
        <p role="alert" className="text-sm text-danger">
          {confirmed.error}
        </p>
      )}
    </div>
  );
}
