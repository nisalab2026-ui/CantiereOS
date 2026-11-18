import { ArrowRight, CalendarClock, ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageIntro } from "@/components/site/blocks";
import { TRADE_ICONS } from "@/components/site/icons";
import { TradeScene } from "@/components/site/trade-scenes";
import { getVerifiedSession } from "@/lib/auth";
import { TRADE_PAGES } from "../trades-content";

export const metadata: Metadata = {
  title: "Mestieri",
  description:
    "CantiereOS per imprese edili, elettricisti, idraulici e termoidraulici, coperture e linee vita, manutenzioni, antincendio, serramenti e facility management.",
};

export default async function MestieriPage() {
  const signedIn = await getVerifiedSession()
    .then(Boolean)
    .catch(() => false);
  const total = String(TRADE_PAGES.length).padStart(2, "0");

  return (
    <>
      <PageIntro
        eyebrow="Mestieri"
        title="Un gestionale,"
        accent="il tuo mestiere."
        lead="Idraulici, elettricisti, chi lavora sui tetti, imprese edili: ogni mestiere ha le sue scadenze, i suoi moduli e i suoi documenti. Ecco come CantiereOS li tiene in ordine, con gli strumenti che ci sono già."
      />

      {/* Indice dei mestieri: resta in alto e accende quello che stai leggendo */}
      <nav
        aria-label="Mestieri"
        data-scrollspy
        className="trade-index sticky top-[4.75rem] z-30 border-y border-border bg-background/75 backdrop-blur-xl"
      >
        <ul className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 py-2.5 sm:px-6 [&::-webkit-scrollbar]:hidden">
          {TRADE_PAGES.map((t) => {
            const Icon = TRADE_ICONS[t.icon];
            return (
              <li key={t.id} className="shrink-0">
                <a
                  href={`#${t.id}`}
                  className="trade-pill flex h-9 items-center gap-2 rounded-full border border-transparent px-3.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon className="size-4" aria-hidden />
                  {t.name}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="relative">
        {TRADE_PAGES.map((t, i) => {
          const Icon = TRADE_ICONS[t.icon];
          const n = String(i + 1).padStart(2, "0");
          return (
            <section
              key={t.id}
              id={t.id}
              data-progress
              aria-labelledby={`${t.id}-title`}
              className="trade-section relative isolate scroll-mt-36 overflow-clip border-b border-border py-24 sm:py-32"
            >
              {/* Il nome del mestiere, enorme e a contorno, scorre dietro la sezione */}
              <p
                aria-hidden
                data-parallax={i % 2 ? "0.22" : "-0.22"}
                className="trade-ghost pointer-events-none absolute top-10 -z-10 text-[clamp(4.5rem,15vw,12rem)] leading-none font-semibold tracking-[-0.05em] whitespace-nowrap select-none"
                style={{ [i % 2 ? "right" : "left"]: "-2vw" }}
              >
                {t.name}
              </p>
              <div
                aria-hidden
                className="pointer-events-none absolute top-1/3 -z-10 size-[34rem] rounded-full bg-[radial-gradient(closest-side,var(--site-glow-1),transparent)]"
                style={{ [i % 2 ? "left" : "right"]: "-10rem" }}
              />

              <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
                <div className="lg:sticky lg:top-36 lg:self-start">
                  <div className="flex items-center gap-4">
                    <span className="trade-icon grid size-14 place-items-center rounded-2xl bg-[image:var(--primary-gradient)] text-white shadow-[0_14px_34px_-14px_var(--site-shadow)]">
                      <Icon className="size-7" aria-hidden />
                    </span>
                    <span className="font-mono text-sm text-muted-foreground">
                      <span className="text-primary">{n}</span> / {total}
                    </span>
                  </div>
                  <h2
                    id={`${t.id}-title`}
                    data-reveal
                    className="mt-6 text-[clamp(2rem,4.4vw,3.2rem)] leading-[1] font-semibold tracking-[-0.04em]"
                  >
                    {t.name}
                  </h2>
                  <p
                    data-reveal
                    style={{ "--reveal-i": 1 } as React.CSSProperties}
                    className="site-accent mt-3 text-lg font-semibold tracking-tight sm:text-xl"
                  >
                    {t.claim}
                  </p>
                  <TradeScene icon={t.icon} className="mt-7" />
                  <div
                    aria-hidden
                    className="trade-progress mt-5 h-0.5 w-full rounded-full bg-border"
                  >
                    <div className="h-full rounded-full bg-[image:var(--primary-gradient)]" />
                  </div>
                </div>

                <div className="space-y-4">
                  <p data-reveal className="pb-2 text-muted-foreground sm:text-lg lg:pt-24">
                    {t.intro}
                  </p>
                  {t.needs.map((need, k) => (
                    <article
                      key={need.title}
                      data-reveal
                      style={{ "--reveal-i": k } as React.CSSProperties}
                      className="site-spot trade-card rounded-3xl border border-border bg-card p-6 sm:p-8"
                    >
                      <p className="font-mono text-xs text-primary">
                        {n}.{k + 1}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                        {need.title}
                      </h3>
                      <p className="mt-2 text-muted-foreground">{need.text}</p>
                    </article>
                  ))}

                  <div className="grid gap-4 pt-2 sm:grid-cols-2">
                    <div data-reveal className="rounded-3xl border border-border bg-card/60 p-6">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <CalendarClock className="size-4 text-primary" aria-hidden />
                        Scadenze tipiche
                      </p>
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {t.deadlines.map((d, k) => (
                          <li
                            key={d}
                            className="trade-chip rounded-full border border-border bg-background px-3 py-1 text-xs"
                            style={{ "--k": k } as React.CSSProperties}
                          >
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div data-reveal className="rounded-3xl border border-border bg-card/60 p-6">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <ClipboardCheck className="size-4 text-primary" aria-hidden />
                        Moduli che puoi creare
                      </p>
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {t.forms.map((f, k) => (
                          <li
                            key={f}
                            className="trade-chip rounded-full border border-primary/25 bg-accent px-3 py-1 text-xs text-foreground"
                            style={{ "--k": k } as React.CSSProperties}
                          >
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <h2
          data-reveal
          className="text-[clamp(1.8rem,4vw,2.8rem)] leading-tight font-semibold tracking-[-0.03em]"
        >
          Il tuo mestiere non è in elenco?
        </h2>
        <p data-reveal className="mx-auto mt-4 max-w-2xl text-muted-foreground sm:text-lg">
          Scadenze, moduli e documenti funzionano per qualsiasi impresa che lavora sul campo. I
          moduli li disegni tu, con le voci del tuo lavoro.
        </p>
        <Link
          href="/contatti"
          data-magnetic
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-6 font-medium hover:bg-accent"
        >
          Raccontaci come lavori
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      <CtaBand signedIn={signedIn} />
    </>
  );
}
