import type { Metadata } from "next";
import { GUIDE } from "@/app/(app)/app/guida/content";
import { GuideBrowser } from "@/app/(app)/app/guida/guide-browser";
import { CtaBand, PageIntro } from "@/components/site/blocks";
import { getVerifiedSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Guida all'uso",
  description:
    "Come si usa CantiereOS, sezione per sezione: scadenze, moduli, documenti, attività, utenti e sicurezza.",
};

/**
 * Guida pubblica: gli stessi contenuti della Guida nel gestionale (una sola fonte, aggiornata con le
 * funzioni), tutti visibili e senza i collegamenti alle pagine interne, che richiedono l'accesso.
 */
export default async function PublicGuidePage() {
  const signedIn = await getVerifiedSession()
    .then(Boolean)
    .catch(() => false);
  const topics = GUIDE.map(({ href: _href, ...t }) => t);
  return (
    <>
      <PageIntro
        eyebrow="Guida all'uso"
        title="Come si usa"
        accent="CantiereOS."
        lead="Tutte le istruzioni, sezione per sezione. Cerca una parola o apri una domanda: sono le stesse risposte che trovi dentro il gestionale."
      />
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <GuideBrowser topics={topics} />
      </div>
      <CtaBand signedIn={signedIn} />
    </>
  );
}
