"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const TabletCanvas = dynamic(() => import("./tablet-canvas"), { ssr: false });

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Apertura del sito: il tablet 3D che si raddrizza scorrendo. Finché la scena
 * non è pronta (e sempre su telefono, con «riduci movimento», senza WebGL o
 * senza JavaScript) resta la figura 2D passata come `fallback`: la pagina è
 * completa anche senza 3D e il caricamento del 3D non rallenta la prima
 * visualizzazione (three.js si scarica solo qui, dopo l'avvio).
 */
export function TabletHero({ fallback, label }: { fallback: React.ReactNode; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [use3d, setUse3d] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wide = window.matchMedia("(min-width: 768px)").matches;
    const lowPower = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (reduce || !wide || (lowPower !== undefined && lowPower < 4) || !webglAvailable()) return;
    setUse3d(true);
  }, []);
  return (
    <div
      ref={wrap}
      className="relative"
      data-testid="tablet-hero"
      data-mode={ready ? "3d" : "2d"}
      {...(ready ? { role: "img", "aria-label": label } : {})}
    >
      <div
        className={cn("transition-opacity duration-700", ready && "pointer-events-none opacity-0")}
        aria-hidden={ready || undefined}
      >
        {fallback}
      </div>
      {use3d && (
        <div
          className={cn(
            "pointer-events-none absolute -inset-x-[6%] -inset-y-[20%] transition-opacity duration-700",
            ready ? "opacity-100" : "opacity-0",
          )}
          aria-hidden
        >
          <div className="absolute inset-x-[18%] bottom-[6%] h-[12%] rounded-[50%] bg-[radial-gradient(closest-side,var(--site-shadow,rgb(0_0_0/0.25)),transparent)] blur-xl" />
          <TabletCanvas track={wrap} onReady={() => setReady(true)} />
        </div>
      )}
    </div>
  );
}
