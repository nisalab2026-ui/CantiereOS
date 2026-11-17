import { ArrowRight, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageIntro, SectionHeading } from "@/components/site/blocks";
import { ScrubText } from "@/components/site/split-words";
import { getVerifiedSession } from "@/lib/auth";
import { PRINCIPLES } from "../content";

export const metadata: Metadata = {
  title: "Chi siamo",
  description: "Perché nasce CantiereOS, come lo costruiamo e come lavoriamo con le imprese.",
};

/** Come lavoriamo con le imprese: dal primo contatto all'uso quotidiano. */
const METHOD = [
  {
    n: "01",
    title: "Ascoltiamo il lavoro vero",
    text: "Partiamo dai fogli, dai moduli di carta e dalle chat che usate oggi. Ogni funzione nasce da un problema concreto di cantiere o d'ufficio.",
  },
  {
    n: "02",
    title: "Portiamo la carta nel gestionale",
    text: "I vostri moduli diventano modelli da compilare sul telefono, con i dati di cliente e cantiere già inseriti.",
  },
  {
    n: "03",
    title: "Rilasciamo a piccoli passi",
    text: "Una parte alla volta, ognuna con i suoi test automatici. Niente rivoluzioni che bloccano l'impresa per settimane.",
  },
  {
    n: "04",
    title: "Restiamo raggiungibili",
    text: "Guida in ogni sezione, risposte in italiano e miglioramenti continui in base a quello che ci segnalate.",
  },
];

export default async function AboutPage() {
  const signedIn = await getVerifiedSession()
    .then(Boolean)
    .catch(() => false);
  const contactEmail = process.env.PUBLIC_CONTACT_EMAIL?.trim() || null;

  return (
    <>
      <PageIntro
        eyebrow="Chi siamo"
        title="Software serio per chi"
        accent="costruisce davvero."
        lead="CantiereOS nasce per le imprese edili e di servizi tecnici che oggi tengono scadenze, verbali e documenti tra fogli Excel, carta e chat. Vogliamo che tutto questo stia in un solo posto, semplice da usare anche dal cantiere."
      />

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <p
          data-scrub
          className="text-[clamp(1.6rem,4vw,3rem)] leading-[1.18] font-semibold tracking-[-0.03em]"
        >
          <ScrubText
            text="Crediamo che un gestionale debba togliere lavoro, non aggiungerne. Che debba dire la verità sui dati. E che un tecnico in cantiere meriti uno strumento bello quanto quello dell'ufficio."
            glow={["togliere", "verità", "bello"]}
          />
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="I nostri principi" title="Quattro regole che non cambiano." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <div
              key={p.title}
              data-reveal
              style={{ "--reveal-i": i % 2 } as React.CSSProperties}
              className="site-spot rounded-3xl border border-border bg-card p-7 sm:p-9"
            >
              <p className="font-mono text-sm text-primary">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">{p.title}</h3>
              <p className="mt-2 text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="come-lavoriamo"
        className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6 sm:py-32"
      >
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <SectionHeading
              eyebrow="Come lavoriamo"
              title="Con le imprese, un passo alla volta."
              lead="Ogni impresa ha le sue abitudini. Il nostro lavoro è adattare il gestionale a voi, non il contrario."
            />
          </div>
          <div data-stack className="space-y-6">
            {METHOD.map((s, i) => (
              <div key={s.n} className="stack-card" style={{ "--k": i } as React.CSSProperties}>
                <div className="stack-inner rounded-3xl border border-border bg-card p-7 shadow-[0_30px_80px_-50px_rgb(0_0_0/0.8)] backdrop-blur-xl sm:p-9">
                  <p className="font-mono text-sm text-primary">{s.n}</p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {s.title}
                  </h3>
                  <p className="mt-3 text-muted-foreground sm:text-lg">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contatti" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
        <div
          data-reveal
          className="site-spot grid gap-8 rounded-3xl border border-border bg-card p-8 sm:p-12 lg:grid-cols-[1.3fr_1fr] lg:items-center"
        >
          <div>
            <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
              Contatti
            </p>
            <h2 className="mt-4 text-[clamp(1.8rem,4vw,2.8rem)] leading-tight font-semibold tracking-[-0.03em]">
              Vuoi vedere CantiereOS sui tuoi dati?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Registra l&apos;azienda e prova con la tua squadra, oppure scrivici per un avvio
              guidato.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              href={signedIn ? "/app" : "/registrati"}
              data-magnetic
              className="cos-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-medium text-primary-foreground"
            >
              {signedIn ? "Apri il gestionale" : "Registra la tua azienda"}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            {contactEmail && (
              <a
                href={`mailto:${contactEmail}`}
                data-magnetic
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border px-6 font-medium hover:bg-accent"
              >
                <Mail className="size-4" aria-hidden /> {contactEmail}
              </a>
            )}
          </div>
        </div>
      </section>

      <CtaBand signedIn={signedIn} />
    </>
  );
}
