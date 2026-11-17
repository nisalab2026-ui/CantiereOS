"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/messages";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

/** Modulo collegato a una Server Action, con messaggi di errore/esito accessibili. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className ?? "space-y-4"} noValidate>
      {children}
      <div aria-live="polite">
        {state.error && (
          <p
            role="alert"
            data-testid="form-error"
            className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {state.error}
          </p>
        )}
        {state.message && (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{state.message}</p>
        )}
        {state.detail && (
          <p
            className="mt-2 break-all rounded-md border border-border px-3 py-2 font-mono text-xs"
            data-testid="form-detail"
          >
            {state.detail}
          </p>
        )}
      </div>
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  className,
  pending: pendingProp,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  /** Stato di invio esplicito (per KeepValuesForm, dove useFormStatus non vale). */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" variant={variant} loading={pending} className={className}>
      {children}
    </Button>
  );
}

/**
 * Modulo che NON svuota i campi dopo l'invio: se il server segnala un errore,
 * l'utente ritrova tutto ciò che aveva scritto. (Con `action={…}` React
 * azzera il modulo a ogni invio.) `dispatch` è il secondo valore di useActionState.
 */
export function KeepValuesForm({
  dispatch,
  className,
  children,
}: {
  dispatch: (form: FormData) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [, start] = useTransition();
  return (
    <form
      noValidate
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(() => dispatch(data));
      }}
    >
      {children}
    </form>
  );
}
