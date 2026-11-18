import { ArrowRight, Mail, MessageCircle, Rocket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageIntro } from "@/components/site/blocks";
import { WhatsAppIcon, WhatsAppLink } from "@/components/site/whatsapp";
import { getVerifiedSession } from "@/lib/auth";
import { CONTACT } from "../content";

export const metadata: Metadata = {
  title: "Contatti",
  description:
    "Scrivici su WhatsApp per avere maggiori informazioni su CantiereOS, una dimostrazione o un avvio guidato.",
};

const TOPICS = [
  "Una dimostrazione sui dati della tua impresa",
  "Quale piano scegliere per la tua squadra",
  "L'avvio guidato con l'importazione dei tuoi dati",
  "Domande su sicurezza e privacy",
] as const;

export default async function ContattiPage() {
  const signedIn = await getVerifiedSession()
    .then(Boolean)
    .catch(() => false);
  const contactEmail = process.env.PUBLIC_CONTACT_EMAIL?.trim() || null;

  return (
    <>
      <PageIntro
        eyebrow="Contatti"
        title="Parliamo del tuo"
        accent="cantiere."
        lead="Hai domande su CantiereOS, vuoi una dimostrazione o un aiuto per partire? Scrivici su WhatsApp: ti rispondiamo noi, senza centralini né moduli da compilare."
      />

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div
            data-reveal
            className="site-spot relative isolate overflow-hidden rounded-3xl border border-border bg-card p-8 sm:p-12"
          >
            <div
              aria-hidden
              data-parallax="-0.12"
              className="pointer-events-none absolute -top-24 -right-24 -z-10 size-[26rem] rounded-full bg-[radial-gradient(closest-side,rgb(37_211_102/0.22),transparent)]"
            />
            <span className="wa-badge relative grid size-16 place-items-center rounded-2xl bg-[#25d366] text-white shadow-[0_16px_40px_-14px_rgb(18_140_70/0.8)]">
              <span className="wa-wave" aria-hidden />
              <WhatsAppIcon className="wa-icon relative size-8" />
            </span>
            <h2 className="mt-8 text-[clamp(1.8rem,4vw,2.8rem)] leading-tight font-semibold tracking-[-0.03em]">
              Scrivici su WhatsApp
            </h2>
            <p className="mt-3 max-w-md text-muted-foreground sm:text-lg">
              Il modo più veloce per avere maggiori informazioni. Il messaggio è già pronto: basta
              premere invio.
            </p>
            <p className="mt-6 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
              <a href={`tel:+${CONTACT.whatsapp}`} className="hover:text-primary">
                {CONTACT.whatsappDisplay}
              </a>
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <WhatsAppLink label="Apri la chat" />
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}`}
                  data-magnetic
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-5 font-medium hover:bg-accent"
                >
                  <Mail className="size-4" aria-hidden /> {contactEmail}
                </a>
              )}
            </div>
          </div>

          <div className="grid gap-6">
            <div data-reveal className="rounded-3xl border border-border bg-card p-8">
              <MessageCircle className="size-6 text-primary" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold tracking-tight">
                Di cosa possiamo parlare
              </h2>
              <ul className="mt-4 space-y-2.5 text-muted-foreground">
                {TOPICS.map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span
                      className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary"
                      aria-hidden
                    />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal className="rounded-3xl border border-border bg-card p-8">
              <Rocket className="size-6 text-primary" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold tracking-tight">
                Preferisci provare da solo?
              </h2>
              <p className="mt-2 text-muted-foreground">
                Registra l&apos;azienda e usa CantiereOS gratis per 30 giorni, senza carta di
                credito.
              </p>
              <Link
                href={signedIn ? "/app" : "/registrati"}
                className="mt-5 inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                {signedIn ? "Apri il gestionale" : "Registra la tua azienda"}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <CtaBand signedIn={signedIn} />
    </>
  );
}
