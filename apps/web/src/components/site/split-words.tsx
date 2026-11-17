import { Fragment } from "react";

/**
 * Divide una riga in parole mascherate che salgono una dopo l'altra; `delay` (ms) colloca la riga nella
 * sequenza d'apertura. Il testo resta leggibile ai lettori di schermo come frase intera.
 */
export function SplitWords({
  text,
  delay = 0,
  className,
  wordClassName,
}: {
  text: string;
  delay?: number;
  className?: string;
  wordClassName?: string;
}) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span className="split-word">
            <span
              className={wordClassName}
              style={{ "--i": i, "--d": `${delay}ms` } as React.CSSProperties}
            >
              {word}
            </span>
          </span>
          {/* Fuori dal riquadro mascherato: uno spazio alla fine di un inline-block si perde. */}
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

/** Paragrafo le cui parole si accendono allo scorrimento (`data-scrub`); `glow` = parole in evidenza. */
export function ScrubText({ text, glow = [] }: { text: string; glow?: string[] }) {
  const words = text.split(" ");
  const lit = new Set(glow.map((w) => w.toLowerCase()));
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={`${w}-${i}`}>
          <span
            className={`scrub-word${lit.has(w.replace(/[.,:;]/g, "").toLowerCase()) ? " scrub-glow" : ""}`}
          >
            {w}
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  );
}
