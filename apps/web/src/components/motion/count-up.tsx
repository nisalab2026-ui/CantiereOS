"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";

/**
 * Numero che "sale" fino al valore reale (letto dal server). Il valore finale
 * è nel markup dal primo rendering: senza JS o con "riduci movimento" si vede
 * subito quello, l'animazione è solo una decorazione.
 */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || value === 0) return;
    started.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setShown(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span aria-label={formatNumber(value)}>
      <span aria-hidden>{formatNumber(shown)}</span>
    </span>
  );
}
