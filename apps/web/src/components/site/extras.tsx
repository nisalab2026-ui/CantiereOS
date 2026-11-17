import { LogoMark } from "@/components/brand/logo";

/** Sigillo circolare con il marchio al centro: il testo gira con lo scorrimento della pagina. */
export function Seal({ text, className }: { text: string; className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="relative grid size-32 place-items-center rounded-full border border-border bg-card shadow-[0_20px_50px_-24px_var(--site-shadow)] backdrop-blur-md">
        <svg viewBox="0 0 100 100" className="site-seal absolute inset-0 size-full">
          <defs>
            <path id="site-seal-path" d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0" />
          </defs>
          <text className="fill-foreground font-mono text-[7.4px] font-semibold tracking-[0.12em] uppercase">
            <textPath href="#site-seal-path" textLength="236" lengthAdjust="spacingAndGlyphs">
              {text}
            </textPath>
          </text>
        </svg>
        <LogoMark animated className="size-11" />
      </div>
    </div>
  );
}

export interface Stat {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
}

/** Fascia di numeri: le cifre contano da zero quando entrano (data-count in motion-root). */
export function StatsStrip({ stats }: { stats: readonly Stat[] }) {
  return (
    <section aria-label="CantiereOS in numeri" className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            data-reveal
            style={{ transitionDelay: `${i * 90}ms` }}
            className="site-stat relative flex flex-col border-t border-border pt-6"
          >
            <dt className="order-3 mt-3 text-sm text-muted-foreground">{s.label}</dt>
            <dd className="order-2 text-[clamp(2.6rem,6vw,4.2rem)] leading-none font-semibold tracking-[-0.04em] tabular-nums">
              {s.prefix}
              <span data-count={s.value}>{s.value}</span>
              <span className="text-primary">{s.suffix}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Il nome a tutta larghezza in fondo alla pagina: le lettere salgono una per volta. */
export function FooterWord() {
  const word = "CantiereOS";
  return (
    <div aria-hidden className="overflow-hidden px-4 sm:px-6">
      <p className="footer-word mx-auto max-w-6xl text-center text-[clamp(3.4rem,15.5vw,13.5rem)] leading-[0.85] font-semibold tracking-[-0.06em] select-none">
        {Array.from(word).map((ch, i) => (
          <span
            key={i}
            style={{ "--i": i } as React.CSSProperties}
            className={i >= 8 ? "site-accent" : "text-foreground/90"}
          >
            {ch}
          </span>
        ))}
      </p>
    </div>
  );
}
