import { Check } from "lucide-react";
import type { Metadata } from "next";
import { CtaBand, PageIntro, SectionHeading } from "@/components/site/blocks";
import { FEATURE_ICONS } from "@/components/site/icons";
import { FeatureMock } from "@/components/site/mockups";
import { getVerifiedSession } from "@/lib/auth";
import { COMING_SOON, FEATURES } from "../content";

export const metadata: Metadata = {
  title: "Funzionalità",
  description:
    "Scadenze, moduli compilabili, archivio documenti, attività e calendario, pagamenti, anagrafiche e sicurezza: cosa fa CantiereOS.",
};

const MORE = [
  [
    "Ricerca istantanea",
    "Trova clienti, persone, scadenze e documenti da qualunque pagina con Ctrl/⌘ K.",
  ],
  ["Notifiche nell'app", "Avvisi per scadenze, attività assegnate e commenti che ti riguardano."],
  [
    "Esportazioni in Excel",
    "Ogni elenco si esporta in CSV con i filtri applicati e l'esportazione resta registrata.",
  ],
  [
    "Più aziende, un accesso",
    "Passi da un'azienda all'altra dal selettore; i dati restano separati.",
  ],
  ["Registro attività", "Chi ha fatto cosa e quando, con i valori prima e dopo ogni modifica."],
  ["Guida integrata", "Istruzioni per ogni sezione dentro il gestionale, con ricerca."],
  ["Tema chiaro e scuro", "Scegli lo stile che si legge meglio, in ufficio o sotto il sole."],
  ["Verifica in due passaggi", "Obbligatoria per i ruoli amministrativi, con codici di recupero."],
];

export default async function FeaturesPage() {
  const signedIn = await getVerifiedSession()
    .then(Boolean)
    .catch(() => false);
  return (
    <>
      <PageIntro
        eyebrow="Funzionalità"
        title="Tutto quello che serve,"
        accent="niente di più."
        lead="Sei strumenti pensati per il lavoro di un'impresa edile o di servizi tecnici, collegati tra loro: ogni scadenza, documento e attività sta sulla scheda del cliente o della persona a cui appartiene."
      />

      <div className="mx-auto max-w-6xl space-y-28 px-4 pb-24 sm:space-y-40 sm:px-6">
        {FEATURES.map((f, i) => {
          const Icon = FEATURE_ICONS[f.icon];
          const flip = i % 2 === 1;
          return (
            <section
              key={f.id}
              id={f.id}
              className="grid scroll-mt-28 items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <div className={flip ? "lg:order-2" : undefined}>
                <span
                  data-reveal
                  className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary"
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2
                  data-reveal
                  style={{ "--reveal-i": 1 } as React.CSSProperties}
                  className="mt-6 text-[clamp(1.9rem,4.4vw,3.2rem)] leading-[1.05] font-semibold tracking-[-0.035em]"
                >
                  {f.title}
                </h2>
                <p
                  data-reveal
                  style={{ "--reveal-i": 2 } as React.CSSProperties}
                  className="mt-5 text-muted-foreground sm:text-lg"
                >
                  {f.text}
                </p>
                <ul className="mt-7 space-y-3">
                  {f.points.map((p, k) => (
                    <li
                      key={p}
                      data-reveal
                      style={{ "--reveal-i": k + 3 } as React.CSSProperties}
                      className="flex gap-3"
                    >
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                        <Check className="size-3" aria-hidden />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={flip ? "lg:order-1" : undefined} data-progress>
                <div className="reveal-media relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_30%_20%,var(--site-glow-1),transparent_60%)] p-6 sm:p-12">
                  <div className="mx-auto max-w-sm" data-parallax="0.06">
                    <FeatureMock id={f.id} />
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="E inoltre" title="I dettagli che fanno la differenza." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MORE.map(([t, d], i) => (
            <div
              key={t}
              data-reveal
              style={{ "--reveal-i": i % 4 } as React.CSSProperties}
              className="site-spot rounded-2xl border border-border bg-card p-6"
            >
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-dashed border-border p-6 sm:p-10">
          <h2 className="text-2xl font-semibold tracking-tight" data-reveal>
            In arrivo
          </h2>
          <p className="mt-1 text-sm text-muted-foreground" data-reveal>
            Parti in sviluppo: le annunciamo qui, le attiviamo solo quando sono pronte e verificate.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COMING_SOON.map((c, i) => (
              <div key={c.title} data-reveal style={{ "--reveal-i": i } as React.CSSProperties}>
                <p className="font-medium">{c.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand signedIn={signedIn} />
    </>
  );
}
