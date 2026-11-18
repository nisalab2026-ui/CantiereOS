"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Mode = "idle" | "link" | "label" | "text";

/**
 * Cursore del sito: un punto verde preciso più un anello che lo segue con un piccolo ritardo.
 * Sopra link e pulsanti l'anello si allarga e si riempie; dove c'è `data-cursor` diventa
 * un'etichetta (APRI, PROVA…); nei campi di testo torna il cursore di sistema. Sostituisce la freccia
 * solo con mouse o trackpad e mai con "riduci movimento" (html[data-custom-cursor] in site.css).
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [visible, setVisible] = useState(false);
  const [down, setDown] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || still.matches) return;
    setEnabled(true);
    const root = document.documentElement;
    root.setAttribute("data-custom-cursor", "");

    let x = -100;
    let y = -100;
    let tx = -100;
    let ty = -100;
    let frame = 0;
    const loop = () => {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      if (ring.current) ring.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.2 ? requestAnimationFrame(loop) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      if (dot.current) dot.current.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      if (!frame) frame = requestAnimationFrame(loop);
      const target = e.target instanceof Element ? e.target : null;
      const text = target?.closest(
        "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, [contenteditable=true]",
      );
      const named = target?.closest("[data-cursor]")?.getAttribute("data-cursor") ?? null;
      const link = target?.closest(
        "a, button, [role=button], [role=radio], select, label, summary",
      );
      setLabel(named);
      setMode(text ? "text" : named ? "label" : link ? "link" : "idle");
      setVisible(true);
    };
    const onLeave = () => setVisible(false);
    const onDown = () => setDown(true);
    const onUp = () => setDown(false);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      root.removeAttribute("data-custom-cursor");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  if (!enabled) return null;
  const hidden = !visible || mode === "text";
  return (
    <>
      <div
        ref={ring}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[70]"
        style={{ transform: "translate3d(-100px,-100px,0)" }}
      >
        <div
          className={cn(
            "flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border transition-[width,height,opacity,background-color,border-color,box-shadow,scale] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            hidden ? "opacity-0" : "opacity-100",
            down && "scale-90",
            mode === "label"
              ? "h-9 w-auto border-transparent bg-primary px-4 text-[10px] font-semibold tracking-[0.22em] text-primary-foreground shadow-[0_10px_30px_-8px_var(--site-shadow)]"
              : mode === "link"
                ? "size-12 border-primary/60 bg-primary/10 backdrop-blur-[2px]"
                : "size-8 border-primary/45",
          )}
        >
          {mode === "label" ? label : null}
        </div>
      </div>
      <div
        ref={dot}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[71]"
        style={{ transform: "translate3d(-100px,-100px,0)" }}
      >
        <div
          className={cn(
            "size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary transition-[opacity,scale] duration-200",
            hidden || mode === "label" ? "opacity-0" : "opacity-100",
            mode === "link" && "scale-150",
          )}
        />
      </div>
    </>
  );
}
