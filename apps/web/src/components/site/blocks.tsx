import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { BrandLogo } from "@/components/brand-logo";
import { CONTACT, SITE_CREDIT } from "@/app/(marketing)/content";
import { LEGAL_LINKS } from "@/app/(marketing)/legal-content";
import { SplitWords } from "./split-words";
import { FooterWord } from "./extras";
import { WhatsAppIcon, whatsappHref } from "./whatsapp";

/** Apertura delle pagine interne: occhiello con riga che si disegna, titolo a parole, bagliore in parallasse. */
export function PageIntro({
  eyebrow,
  title,
  accent,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  /** ultime parole, con il gradiente del marchio */
  accent?: string;
  lead?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative isolate overflow-clip pt-36 pb-16 sm:pt-44 sm:pb-24">
      <div className="site-grid" aria-hidden />
      <div
        aria-hidden
        data-parallax="-0.25"
        className="pointer-events-none absolute -top-48 left-1/2 -z-10 h-[34rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--site-glow-1),transparent)]"
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="site-in mb-8 flex items-center gap-3 font-mono text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
          <span className="site-rule h-px w-10 bg-primary" /> {eyebrow}
        </p>
        <h1
          className="max-w-5xl text-[clamp(2.6rem,8vw,6.5rem)] leading-[0.95] font-semibold tracking-[-0.04em]"
          data-parallax="0.05"
        >
          <SplitWords text={title} />
          {accent ? (
            <>
              {" "}
              <SplitWords text={accent} delay={140} wordClassName="site-accent" />
            </>
          ) : null}
        </h1>
        {lead ? (
          <p
            className="site-in mt-8 max-w-2xl text-base text-muted-foreground sm:text-lg"
            style={{ "--d": "450ms" } as React.CSSProperties}
          >
            {lead}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  center,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("max-w-3xl", center && "mx-auto text-center")} data-progress>
      <p
        data-reveal
        className={cn(
          "mb-4 flex items-center gap-3 font-mono text-[11px] tracking-[0.3em] text-primary uppercase",
          center && "justify-center",
        )}
      >
        <span className="site-eyebrow-line h-px w-8 bg-primary" aria-hidden /> {eyebrow}
      </p>
      <h2
        data-reveal
        style={{ "--reveal-i": 1 } as React.CSSProperties}
        className="text-[clamp(2rem,5vw,3.6rem)] leading-[1.02] font-semibold tracking-[-0.035em]"
      >
        {title}
      </h2>
      {lead ? (
        <p
          data-reveal
          style={{ "--reveal-i": 2 } as React.CSSProperties}
          className="mt-5 text-base text-muted-foreground sm:text-lg"
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {items.map((f, i) => (
        <details
          key={f.q}
          className="site-faq group"
          data-reveal
          style={{ "--reveal-i": i } as React.CSSProperties}
        >
          <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5 text-base font-medium transition-colors hover:bg-accent/50 sm:px-6 [&::-webkit-details-marker]:hidden">
            <span className="flex-1">{f.q}</span>
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-open:rotate-45 group-open:border-primary group-open:text-primary"
            >
              <Plus className="size-4" />
            </span>
          </summary>
          <p className="site-faq-answer px-5 pb-6 text-muted-foreground sm:px-6">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Chiusura delle pagine: titolo che cresce entrando e invito all'azione. */
export function CtaBand({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative isolate overflow-clip py-28 sm:py-40" data-progress>
      <div
        aria-hidden
        className="cos-glow pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--site-glow-2),transparent)]"
      />
      <div className="site-grid" aria-hidden />
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
        <h2 className="grow-title text-[clamp(2.4rem,7vw,5.6rem)] leading-[0.98] font-semibold tracking-[-0.04em]">
          Meno carta. <span className="site-accent">Più cantiere.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-muted-foreground sm:text-lg">
          Registra la tua azienda e prova CantiereOS con la tua squadra. Nessuna installazione,
          nessuna carta di credito.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            href={signedIn ? "/app" : "/registrati"}
            data-magnetic
            data-cursor="INIZIA"
            className="cos-primary inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-base font-medium text-primary-foreground"
          >
            {signedIn ? "Apri il gestionale" : "Registra la tua azienda"}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/prezzi"
            data-magnetic
            className="inline-flex h-12 items-center rounded-xl border border-border bg-card px-6 text-base font-medium hover:bg-accent"
          >
            Vedi i prezzi
          </Link>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter({ contactEmail }: { contactEmail: string | null }) {
  const cols = [
    {
      title: "Prodotto",
      links: [
        ["/funzionalita", "Funzionalità"],
        ["/mestieri", "Mestieri"],
        ["/prezzi", "Prezzi"],
        ["/guida", "Guida all'uso"],
      ],
    },
    {
      title: "Azienda",
      links: [
        ["/chi-siamo", "Chi siamo"],
        ["/chi-siamo#come-lavoriamo", "Come lavoriamo"],
        ["/contatti", "Contatti"],
      ],
    },
    {
      title: "Accesso",
      links: [
        ["/accedi", "Accedi"],
        ["/registrati", "Registra l'azienda"],
      ],
    },
    { title: "Note legali", links: LEGAL_LINKS.map((l) => [l.href, l.label] as const) },
  ] as const;
  return (
    <footer className="relative border-t border-border" data-progress>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Link href="/" aria-label="CantiereOS, pagina iniziale" className="inline-flex">
            <BrandLogo />
          </Link>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            Il gestionale per imprese edili e di servizi tecnici. Scadenze, moduli, documenti e
            squadre in un solo posto.
          </p>
          <a
            href={whatsappHref()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
          >
            <WhatsAppIcon className="size-4 text-[#25d366]" />
            WhatsApp {CONTACT.whatsappDisplay}
            <span className="sr-only"> (si apre in una nuova scheda)</span>
          </a>
          {contactEmail && (
            <a
              href={`mailto:${contactEmail}`}
              className="mt-2 block text-sm text-primary hover:underline"
            >
              {contactEmail}
            </a>
          )}
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="text-sm font-semibold">{c.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="transition-colors hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-6 text-xs text-muted-foreground sm:px-6">
        <p>
          © {new Date().getFullYear()} CantiereOS. Tutti i diritti riservati. Prezzi IVA esclusa.
        </p>
        <a
          href={SITE_CREDIT.href}
          target="_blank"
          rel="noopener"
          className="site-credit group inline-flex items-center gap-2 hover:text-foreground"
        >
          Sito realizzato da
          <span className="site-credit-name font-semibold text-foreground">{SITE_CREDIT.name}</span>
          <span className="site-credit-dot size-1.5 rounded-full bg-primary" aria-hidden />
          <span className="sr-only"> (si apre in una nuova scheda)</span>
        </a>
      </div>
      <FooterWord />
    </footer>
  );
}
