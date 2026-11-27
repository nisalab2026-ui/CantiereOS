import type React from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ShieldX } from "lucide-react";
import { cn } from "@/lib/cn";

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-accent", className)}
      style={style}
      aria-hidden
    />
  );
}

/** Stato vuoto: spiega cosa comparirà. L'azione c'è solo se è reale e permessa. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}
      data-testid="empty-state"
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-accent text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Qualcosa non ha funzionato",
  description = "Non è stato possibile caricare questa sezione. Riprova tra qualche istante.",
  reference,
  action,
}: {
  title?: string;
  description?: string;
  reference?: string;
  action?: React.ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {reference && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Riferimento per l&apos;assistenza: {reference}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Sezione non consentita al ruolo corrente. Se il permesso esiste ma richiede
 * la verifica in due passaggi, lo dice e porta alla pagina giusta.
 */
export function ForbiddenState({ needsMfa = false }: { needsMfa?: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-16 text-center"
      data-testid="forbidden"
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-accent text-muted-foreground">
        <ShieldX className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium">
        {needsMfa ? "Serve la verifica in due passaggi" : "Sezione non disponibile"}
      </p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {needsMfa
          ? "Il tuo ruolo può accedere a questa sezione dopo aver verificato l'accesso con il codice dell'app di autenticazione."
          : "Il tuo ruolo in questa azienda non può vedere questa sezione. Se ti serve, chiedi a un amministratore."}
      </p>
      {needsMfa && (
        <a
          href="/account/sicurezza"
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          Vai a Sicurezza
        </a>
      )}
    </div>
  );
}
