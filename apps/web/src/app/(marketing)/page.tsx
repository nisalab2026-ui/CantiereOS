import {
  ArrowRight,
  BellRing,
  Check,
  ClipboardCheck,
  HardHat,
  KeyRound,
  type LucideIcon,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { FEATURE_ICONS, TRADE_ICONS } from "@/components/site/icons";
import { CtaBand, FaqList, SectionHeading } from "@/components/site/blocks";
import { Seal, StatsStrip } from "@/components/site/extras";
import { TradeScene } from "@/components/site/trade-scenes";
import { AppWindow, DashboardMock, FeatureMock, PhoneMock } from "@/components/site/mockups";
import { BentoGrid } from "@/components/site/bento";
import { StickyFeatures } from "@/components/site/sticky-features";
import { TabletHero } from "@/components/site/tablet/tablet-hero";
import { ScrubText, SplitWords } from "@/components/site/split-words";
import { getVerifiedSession } from "@/lib/auth";
import { COMING_SOON, FEATURES, HOME_FAQ, PLANS, SECURITY_POINTS, STEPS, TRADES } from "./content";
import { TRADE_PAGES } from "./trades-content";

export default async function HomePage() {
  const signedIn = await getVerifiedSession()
    .then(Boolean)
    .catch(() => false);
  const featured = PLANS.find((p) => p.recommended) ?? PLANS[0]!;

  return (
    <>
      {/* --- Apertura ------------------------------------------------------------------------------ */}
      <section className="relative isolate overflow-clip pt-32 pb-10 sm:pt-40 md:pb-32">
        <div className="site-grid" aria-hidden />
        <div
          aria-hidden
          data-parallax="-0.3"
          className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[40rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--site-glow-1),transparent)]"
        />
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <p className="site-in mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-cyan shadow-[0_0_10px_var(--cyan)]" />
            Il gestionale per imprese edili e di servizi tecnici
          </p>
          <h1 className="mx-auto max-w-5xl text-[clamp(2.7rem,8.4vw,7rem)] leading-[0.94] font-semibold tracking-[-0.045em]">
            <SplitWords text="Il cantiere in ordine," />{" "}
            <SplitWords text="dall'ufficio al telefono." delay={280} wordClassName="site-accent" />
          </h1>
          <p
            className="site-in mx-auto mt-7 max-w-2xl text-base text-muted-foreground sm:text-lg"
            style={{ "--d": "600ms" } as React.CSSProperties}
          >
            Scadenze, moduli di controllo, documenti, attività e pagamenti in un solo posto. La tua
            squadra lavora sugli stessi dati, in ufficio e in cantiere.
          </p>
          <div
            className="site-in mt-9 flex flex-wrap justify-center gap-3"
            style={{ "--d": "760ms" } as React.CSSProperties}
          >
            <Link
              href={signedIn ? "/app" : "/registrati"}
              data-magnetic
              data-cursor="INIZIA"
              className="cos-primary inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-base font-medium text-primary-foreground"
            >
              {signedIn ? "Apri il gestionale" : "Prova gratis 30 giorni"}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="#funzioni"
              data-magnetic
              className="inline-flex h-12 items-center rounded-xl border border-border bg-card px-6 text-base font-medium hover:bg-accent"
            >
              Scopri come funziona
            </Link>
          </div>
        </div>

        {/* La finestra dell'app si raddrizza mentre si scende; le bolle di stato fluttuano a profondità diverse */}
        <div className="relative mx-auto mt-16 max-w-6xl px-4 sm:mt-20 sm:px-6" data-progress>
          <div
            data-parallax="-0.12"
            className="absolute -top-16 right-2 z-10 hidden md:block lg:-right-6"
          >
            <Seal text="Prova gratis · 30 giorni · Senza carta · " />
          </div>
          <div className="relative">
            <TabletHero
              label="CantiereOS su un tablet: la panoramica vera del gestionale, con i dati dell'azienda dimostrativa"
              fallback={
                <div className="site-tilt-in">
                  <AppWindow label="Illustrazione: la panoramica di CantiereOS con le scadenze da gestire">
                    <DashboardMock />
                  </AppWindow>
                </div>
              }
            />
            <div
              aria-hidden
              data-parallax="0.18"
              className="absolute -top-7 -left-4 hidden lg:block xl:-left-16"
            >
              <div className="site-float cos-glass flex items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5 text-left text-xs">
                <span className="grid size-7 place-items-center rounded-lg bg-success/15 text-success">
                  <Check className="size-4" />
                </span>
                <span>
                  <b className="block font-semibold">Modulo chiuso</b>
                  <span className="text-muted-foreground">Ispezione linea vita</span>
                </span>
              </div>
            </div>
            <div
              aria-hidden
              data-parallax="0.32"
              className="absolute -right-4 bottom-[16%] hidden lg:block xl:-right-20"
            >
              <div
                className="site-float cos-glass flex items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5 text-left text-xs"
                style={{ "--d": "-2.5s" } as React.CSSProperties}
              >
                <span className="grid size-7 place-items-center rounded-lg bg-warning/15 text-warning">
                  <BellRing className="size-4" />
                </span>
                <span>
                  <b className="block font-semibold">Scade tra 6 giorni</b>
                  <span className="text-muted-foreground">Patentino PLE · M. Ferri</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Nastro dei mestieri ------------------------------------------------------------------ */}
      <section aria-label="Pensato per" className="py-16 sm:py-24">
        <p className="mb-6 text-center font-mono text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
          Pensato per
        </p>
        <div className="marquee" data-marquee="45">
          <div className="marquee-track">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                {TRADES.map((t, i) => (
                  <span
                    key={t}
                    className={`px-6 text-[clamp(1.8rem,4.5vw,3.6rem)] font-semibold tracking-[-0.03em] ${i % 2 ? "marquee-outline" : ""}`}
                  >
                    {t}
                    <span className="ml-12 text-primary">·</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Manifesto: le parole si accendono --------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-28">
        <p
          data-scrub
          className="text-[clamp(1.7rem,4.2vw,3.3rem)] leading-[1.15] font-semibold tracking-[-0.03em]"
        >
          <ScrubText
            text="Un'impresa non ha bisogno di un altro programma complicato. Ha bisogno di sapere cosa scade, chi fa cosa e dove sono i documenti. Subito, anche dal cantiere."
            glow={["scade,", "cosa", "documenti.", "cantiere."]}
          />
        </p>
      </section>

      {/* --- Numeri che contano --------------------------------------------------------------- */}
      <StatsStrip
        stats={[
          { value: 6, label: "strumenti in un solo gestionale" },
          { value: 30, label: "giorni di prova gratuita, senza carta di credito" },
          { value: 49, suffix: " €", label: "al mese per iniziare, IVA esclusa" },
          { value: 0, label: "programmi da installare: basta il browser" },
        ]}
      />

      {/* --- Per ogni mestiere ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28" data-progress>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Mestieri"
            title="Idraulici, elettricisti, tetti, cantieri."
            lead="Ogni mestiere ha le sue scadenze e i suoi moduli. Scopri come CantiereOS lavora con il tuo."
          />
          <Link
            href="/mestieri"
            data-reveal
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary"
          >
            Tutti i mestieri
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-1"
              aria-hidden
            />
          </Link>
        </div>
        <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TRADE_PAGES.map((t, i) => {
            const Icon = TRADE_ICONS[t.icon];
            return (
              <li key={t.id} data-reveal style={{ "--reveal-i": i % 4 } as React.CSSProperties}>
                <Link
                  href={`/mestieri#${t.id}`}
                  data-cursor="APRI"
                  className="site-spot trade-tile group flex h-full flex-col rounded-3xl border border-border bg-card p-4 pb-6"
                >
                  <TradeScene icon={t.icon} decorative className="mb-5" />
                  <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                    <Icon className="size-5 text-primary" aria-hidden />
                    {t.name}
                  </span>
                  <span className="mt-1.5 text-sm text-muted-foreground">{t.who}</span>
                  <span className="mt-auto flex items-center gap-1 pt-5 text-sm font-medium text-primary opacity-70 transition-opacity group-hover:opacity-100">
                    Scopri
                    <ArrowRight
                      className="size-3.5 transition-transform group-hover:translate-x-1"
                      aria-hidden
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* --- Le funzioni: testo che scorre, anteprima ferma -------------------------------------- */}
      <section id="funzioni" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-24 sm:px-6 sm:py-32">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4 lg:mb-0">
          <SectionHeading eyebrow="Cosa fa" title="Sei strumenti, un solo gestionale." />
          <Link
            href="/funzionalita"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary"
          >
            Tutte le funzionalità
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-1"
              aria-hidden
            />
          </Link>
        </div>
        <StickyFeatures
          items={FEATURES.map((f) => {
            const Icon = FEATURE_ICONS[f.icon];
            return {
              id: f.id,
              title: f.title,
              text: f.text,
              points: f.points,
              icon: <Icon className="size-5" aria-hidden />,
              preview: <FeatureMock id={f.id} />,
            };
          })}
        />
      </section>

      {/* --- E poi: griglia bento -------------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-32">
        <SectionHeading
          eyebrow="E poi"
          title="Dall'intervento al rapportino, fino ai costi."
          lead="Interventi, rapportini e commesse lavorano sugli stessi dati: quello che si fa in cantiere arriva in ufficio senza ricopiare nulla."
        />
        <div className="mt-12">
          <BentoGrid />
        </div>
      </section>

      {/* --- Come si parte: passi che si impilano ------------------------------------------------ */}
      <section id="come-funziona" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <SectionHeading
              eyebrow="Come si parte"
              title="Operativi in un pomeriggio."
              lead="Niente installazioni, niente consulenti per mesi. Registri l'azienda, inserisci quello che serve e inviti la squadra."
            />
          </div>
          <div data-stack className="space-y-6">
            {STEPS.map((s, i) => (
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

      {/* --- Dal cantiere ------------------------------------------------------------------------- */}
      <section className="relative isolate overflow-clip py-24 sm:py-32">
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-0 -z-10 size-[40rem] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--site-glow-3),transparent)]"
          data-parallax="-0.2"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="In cantiere"
              title="Il telefono diventa il quaderno del tecnico."
              lead="Agenda del giorno, moduli da compilare, documenti da mostrare al cliente. Pulsanti grandi e testi chiari, pensati per chi lavora con i guanti."
            />
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                [Smartphone, "Dal browser, senza installare nulla"],
                [ClipboardCheck, "Moduli compilati e firmati sul posto"],
                [HardHat, "Ognuno vede solo il suo lavoro"],
                [KeyRound, "Accesso protetto anche dal telefono"],
              ].map(([Icon, t], i) => {
                const I = Icon as LucideIcon;
                return (
                  <li
                    key={t as string}
                    data-reveal
                    style={{ "--reveal-i": i } as React.CSSProperties}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
                  >
                    <I className="size-4 shrink-0 text-primary" aria-hidden />
                    {t as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="relative" data-parallax="0.08">
            <PhoneMock />
          </div>
        </div>
      </section>

      {/* --- Sicurezza ---------------------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <SectionHeading
          center
          eyebrow="Sicurezza"
          title="I dati della tua impresa restano tuoi."
          lead="Costruito da zero per più aziende sullo stesso sistema, con controlli nel database e non solo nell'interfaccia."
        />
        <div
          aria-hidden
          className="mx-auto mt-14 flex max-w-3xl items-center justify-center gap-2 sm:gap-3"
          data-reveal
        >
          {["Creato", "Modificato", "Completato", "Esportato", "Archiviato"].map((t, i) => (
            <div key={t} className="flex items-center gap-2 sm:gap-3">
              <span
                className="chain-link rounded-xl border border-border bg-card px-2.5 py-2 font-mono text-[10px] text-muted-foreground sm:px-4 sm:text-xs"
                style={{ "--i": i } as React.CSSProperties}
              >
                {t}
              </span>
              {i < 4 && <span className="h-px w-3 bg-border sm:w-6" />}
            </div>
          ))}
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECURITY_POINTS.map((p, i) => (
            <div
              key={p.title}
              data-reveal
              style={{ "--reveal-i": i } as React.CSSProperties}
              className="site-spot rounded-2xl border border-border bg-card p-6"
            >
              <ShieldCheck className="size-5 text-primary" aria-hidden />
              <h3 className="mt-4 font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- In arrivo ---------------------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-dashed border-border p-6 sm:p-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight" data-reveal>
              In arrivo
            </h2>
            <p className="text-sm text-muted-foreground" data-reveal>
              In sviluppo, non ancora disponibili.
            </p>
          </div>
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

      {/* --- Prezzi in breve ---------------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div
          className="site-spot relative isolate grid items-center gap-8 overflow-hidden rounded-3xl border border-border bg-card p-8 sm:p-12 lg:grid-cols-[1.3fr_1fr]"
          data-reveal
        >
          <div>
            <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">Prezzi</p>
            <h2 className="mt-4 text-[clamp(1.8rem,4vw,3rem)] leading-tight font-semibold tracking-[-0.03em]">
              Un prezzo chiaro per tutta la squadra, non per persona.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Tre piani con gli utenti inclusi. Prova gratis per 30 giorni, poi scegli.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/40 p-6">
            <p className="text-sm text-muted-foreground">
              Piano {featured.name} · {featured.users}
            </p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="text-5xl font-semibold tracking-tight tabular-nums">
                {featured.yearly} €
              </span>
              <span className="text-muted-foreground">/ mese</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              IVA esclusa, con fatturazione annuale. Da {PLANS[0]!.yearly} € al mese.
            </p>
            <Link
              href="/prezzi"
              data-magnetic
              className="cos-primary mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground"
            >
              Confronta i piani <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* --- Domande ------------------------------------------------------------------------------ */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading
          center
          eyebrow="Domande frequenti"
          title="Le risposte, prima di cominciare."
        />
        <div className="mt-12">
          <FaqList items={HOME_FAQ} />
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground" data-reveal>
          Come si usa ogni sezione?{" "}
          <Link href="/guida" className="font-medium text-primary hover:underline">
            Leggi la guida all&apos;uso
          </Link>
        </p>
      </section>

      <CtaBand signedIn={signedIn} />
    </>
  );
}
