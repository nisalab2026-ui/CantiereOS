"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Un punto di luce blu che segue il puntatore e dice cosa farà un clic (APRI, PROVA…), come nel sito
 * Lume Studio. Il cursore di sistema resta visibile: questo aggiunge solo significato. Solo mouse e
 * trackpad, mai con "riduci movimento".
 */
export function Cursor() {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [overLink, setOverLink] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || still.matches) return;
    setEnabled(true);

    let x = -100;
    let y = -100;
    let tx = -100;
    let ty = -100;
    let frame = 0;
    const loop = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      if (ref.current) ref.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.2 ? requestAnimationFrame(loop) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      if (!frame) frame = requestAnimationFrame(loop);
      const target = e.target instanceof Element ? e.target : null;
      setLabel(target?.closest("[data-cursor]")?.getAttribute("data-cursor") ?? null);
      setOverLink(
        Boolean(
          target?.closest("a, button, [role=button], input, select, textarea, label, summary"),
        ),
      );
      setVisible(true);
    };
    const onLeave = () => setVisible(false);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  if (!enabled) return null;
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[70]"
      style={{ transform: "translate3d(-100px,-100px,0)" }}
    >
      <div
        className={cn(
          "flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-[width,height,opacity,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          visible ? "opacity-100" : "opacity-0",
          label
            ? "h-9 w-auto bg-cyan px-4 text-[10px] font-semibold tracking-[0.22em] text-[#04140c] shadow-[0_0_34px_6px_rgb(16_185_129/0.4)]"
            : overLink
              ? "size-10 bg-primary/10 shadow-[0_0_26px_4px_rgb(34_197_94/0.35)] ring-1 ring-primary"
              : "size-2.5 bg-cyan shadow-[0_0_16px_4px_rgb(16_185_129/0.6),0_0_60px_16px_rgb(34_197_94/0.2)]",
        )}
      >
        {label}
      </div>
    </div>
  );
}
