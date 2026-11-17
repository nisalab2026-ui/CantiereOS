import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { getRecoveryStatus } from "@cantiereos/core";
import { asCurrentUser, getMfaStatus, requireSession } from "@/lib/auth";
import { authAdminConfigured } from "@/lib/auth-admin";
import { formatDate } from "@/lib/format";
import { removeMfaFactor } from "../../actions";
import { MfaEnrollment } from "./enroll";
import { RecoveryCodes } from "./recovery-codes";

export const metadata: Metadata = { title: "Sicurezza" };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const mfa = await getMfaStatus(session);
  const sp = await searchParams;
  const mandatory = sp.obbligatoria === "1";
  const recovered = sp.recupero === "1";
  const recovery = mfa.verifiedFactors.length > 0 ? await asCurrentUser(getRecoveryStatus) : null;
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sicurezza dell&apos;account</h1>
      {recovered && mfa.verifiedFactors.length === 0 && (
        <Notice tone="warning">
          Codice di recupero accettato: l&apos;app di autenticazione è stata scollegata e gli altri
          dispositivi disconnessi. Configurala di nuovo qui sotto.
        </Notice>
      )}
      {mandatory && !recovered && mfa.verifiedFactors.length === 0 && (
        <Notice tone="warning">
          Il tuo ruolo gestisce dati e utenti dell&apos;azienda: per continuare attiva la verifica
          in due passaggi.
        </Notice>
      )}

      <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-medium">Verifica in due passaggi (MFA)</h2>
        {mfa.verifiedFactors.length === 0 ? (
          <MfaEnrollment />
        ) : (
          <>
            <p className="text-sm" data-testid="mfa-active">
              Attiva. Sessione corrente:{" "}
              {session.aal === "aal2" ? "verificata" : "non ancora verificata"}.
            </p>
            {session.aal !== "aal2" && (
              <Link
                href="/mfa?next=/account/sicurezza"
                className="text-sm font-medium text-brand hover:underline"
              >
                Verifica ora
              </Link>
            )}
            <ul className="space-y-2">
              {mfa.verifiedFactors.map((f) => (
                <li key={f.id} className="flex items-center justify-between text-sm">
                  <span>{f.friendlyName ?? "App di autenticazione"}</span>
                  {session.aal === "aal2" && (
                    <form action={removeMfaFactor}>
                      <input type="hidden" name="factorId" value={f.id} />
                      <button className="text-danger hover:underline">Rimuovi</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-xs text-muted">
          La verifica in due passaggi protegge l&apos;accesso: non equivale a una firma elettronica
          qualificata.
        </p>
      </section>

      {recovery && (
        <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <h2 className="font-medium">Codici di recupero</h2>
          <p className="text-sm text-muted" data-testid="recovery-status">
            {recovery.remaining > 0
              ? `${recovery.remaining} codici disponibili${recovery.generatedAt ? `, generati il ${formatDate(recovery.generatedAt)}` : ""}.`
              : "Nessun codice disponibile."}{" "}
            Servono se perdi il telefono: ognuno vale una sola volta.
          </p>
          {!authAdminConfigured() ? (
            <p className="text-sm text-muted">
              Recupero non configurato su questo ambiente (manca la chiave di servizio di Supabase).
            </p>
          ) : session.aal === "aal2" ? (
            <RecoveryCodes hasCodes={recovery.remaining > 0} />
          ) : (
            <p className="text-sm text-muted">Verifica il secondo fattore per generarli.</p>
          )}
        </section>
      )}

      <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-medium">Sessioni</h2>
        <p className="text-sm text-muted">
          Chiude l&apos;accesso su tutti i dispositivi, compreso questo. Le sessioni chiuse vengono
          rifiutate subito.
        </p>
        <form action="/esci" method="post">
          <input type="hidden" name="scope" value="global" />
          <button className="inline-flex h-10 items-center rounded-md border border-danger px-4 text-sm font-medium text-danger hover:bg-danger/10">
            Esci da tutti i dispositivi
          </button>
        </form>
        <p className="text-sm">
          Vuoi cambiare password? Usa{" "}
          <Link href="/password-dimenticata" className="font-medium text-brand hover:underline">
            il recupero password
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
