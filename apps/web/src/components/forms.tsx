"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
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
            className="mt-2 break-all rounded-md border border-line px-3 py-2 font-mono text-xs"
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
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-brand text-brand-ink hover:opacity-90",
    secondary: "border border-line bg-surface hover:bg-canvas",
    danger: "border border-danger text-danger hover:bg-danger/10",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:opacity-60 ${styles}`}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
