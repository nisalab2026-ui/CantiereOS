"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface StickyItem {
  id: string;
  title: string;
  text: string;
  points: string[];
  icon: React.ReactNode;
  preview: React.ReactNode;
}

/**
 * Sezione a due colonne: a sinistra le funzioni scorrono, a destra l'anteprima
 * resta ferma (sticky) e cambia con la funzione al centro dello schermo.
 * Su telefono ogni funzione ha la sua anteprima subito sotto il testo. Senza
 * JavaScript si vede la prima anteprima e tutto il testo.
 */
export function StickyFeatures({ items }: { items: StickyItem[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const el of refs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
      <ol className="space-y-14 lg:space-y-0">
        {items.map((f, i) => (
          <li
            key={f.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-i={i}
            data-id={f.id}
            data-active={active === i || undefined}
            className="flex flex-col justify-center transition-opacity duration-500 lg:min-h-[72vh] lg:opacity-35 lg:data-[active]:opacity-100"
            data-testid="sticky-step"
          >
            <p className="font-mono text-sm text-primary">{String(i + 1).padStart(2, "0")}</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                {f.icon}
              </span>
              <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{f.title}</h3>
            </div>
            <p className="mt-4 text-muted-foreground sm:text-lg">{f.text}</p>
            <ul className="mt-5 space-y-2 text-sm">
              {f.points.map((p) => (
                <li key={p} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-6 lg:hidden">{f.preview}</div>
          </li>
        ))}
      </ol>
      <div className="hidden lg:block">
        <div className="sticky top-28 h-[min(32rem,calc(100vh-9rem))]">
          <div className="relative h-full overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-[0_40px_120px_-50px_var(--site-shadow)] backdrop-blur-xl">
            {items.map((f, i) => (
              <div
                key={f.id}
                aria-hidden={active !== i}
                className={cn(
                  "absolute inset-6 flex items-center transition-[opacity,translate,scale] duration-500 ease-out",
                  active === i
                    ? "translate-y-0 scale-100 opacity-100"
                    : i < active
                      ? "-translate-y-6 scale-[0.98] opacity-0"
                      : "translate-y-6 scale-[0.98] opacity-0",
                )}
                data-testid={active === i ? "sticky-preview-active" : undefined}
                data-id={f.id}
              >
                <div className="w-full">{f.preview}</div>
              </div>
            ))}
            <div className="absolute right-6 bottom-5 flex gap-1.5" aria-hidden>
              {items.map((f, i) => (
                <span
                  key={f.id}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-500",
                    active === i ? "w-6 bg-primary" : "w-1.5 bg-border",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
