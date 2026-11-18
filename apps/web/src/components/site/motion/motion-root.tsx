"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Cursor } from "./cursor";
import { refreshScrollEngine, startScrollEngine } from "./scroll-engine";

declare global {
  interface Window {
    __siteMotion?: boolean;
  }
}

/**
 * Eseguito prima del primo disegno (con il nonce della CSP): nasconde i contenuti da far entrare solo se
 * JavaScript gira, e li mostra comunque se questo bundle non arriva entro 2,5 secondi.
 */
export const MOTION_BOOT_SCRIPT = `(function(d){d.dataset.js="";setTimeout(function(){if(window.__siteMotion)return;document.querySelectorAll("[data-reveal]").forEach(function(e){e.setAttribute("data-shown","")})},2500)})(document.documentElement)`;

type NavigatorHints = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

/**
 * Quanto movimento riceve il dispositivo: "full", oppure "lite" (la stessa storia senza sfocature e derive)
 * per telefoni e tablet, macchine piccole o impegnate e risparmio dati: sfocature e ombre ridisegnate a ogni
 * fotogramma sono ciò che fa scattare lo scorrimento sul telefono.
 */
function motionTier(): "full" | "lite" {
  const nav = navigator as NavigatorHints;
  if (nav.connection?.saveData) return "lite";
  if (window.matchMedia("(pointer: coarse)").matches) return "lite";
  if ((nav.hardwareConcurrency ?? 8) <= 4) return "lite";
  if ((nav.deviceMemory ?? 8) <= 4) return "lite";
  return "full";
}

/**
 * Un solo punto che guida il movimento del sito pubblico: livello del dispositivo, motore di scorrimento,
 * ingressi delle sezioni, pulsanti magnetici e cursore. Lasciando il sito pubblico (verso il gestionale)
 * tutto si spegne e gli attributi su <html> vengono tolti.
 */
export function MotionRoot() {
  const pathname = usePathname();

  useEffect(() => {
    window.__siteMotion = true;
    const root = document.documentElement;
    root.dataset.js = "";
    root.dataset.tier = motionTier();
    return () => {
      delete root.dataset.tier;
      delete root.dataset.js;
      window.__siteMotion = false;
    };
  }, []);

  // Coreografia per tutta la visita; scorrimento morbido solo con il mouse su una macchina capace.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    root.dataset.engine = "";
    const smooth = motionTier() === "full" && window.matchMedia("(pointer: fine)").matches;
    const stop = startScrollEngine({ smooth });
    return () => {
      stop();
      delete root.dataset.engine;
      root.style.removeProperty("--scroll");
    };
  }, []);

  useEffect(() => {
    refreshScrollEngine();
  }, [pathname]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-shown", "");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px 10% 0px" },
    );
    document.querySelectorAll("[data-reveal]:not([data-shown])").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  // Numeri con data-count: contano da 0 al valore quando entrano nello schermo (il valore vero è già
  // scritto nel markup, quindi senza JavaScript o con "riduci movimento" si legge subito).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frames = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          const el = entry.target as HTMLElement;
          const to = Number(el.dataset.count);
          if (!Number.isFinite(to) || to === 0) continue;
          const start = performance.now();
          const duration = 1400;
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            el.textContent = String(Math.round(to * (1 - Math.pow(1 - t, 4))));
            if (t < 1) frames.add(requestAnimationFrame(tick));
          };
          el.textContent = "0";
          frames.add(requestAnimationFrame(tick));
        }
      },
      { threshold: 0.6 },
    );
    document.querySelectorAll("[data-count]").forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      frames.forEach(cancelAnimationFrame);
    };
  }, [pathname]);

  // Indice con data-scrollspy: si accende la voce della sezione che si sta leggendo.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>("[data-scrollspy]");
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    const sections = links
      .map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))))
      .filter((el): el is HTMLElement => el !== null);
    const mark = (id: string) =>
      links.forEach((a) =>
        a.hash === `#${id}`
          ? a.setAttribute("aria-current", "true")
          : a.removeAttribute("aria-current"),
      );
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) mark(hit.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [pathname]);

  // I controlli con data-magnetic si avvicinano di qualche pixel al puntatore del mouse.
  useEffect(() => {
    if (
      !window.matchMedia("(pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-magnetic]"));
    if (items.length === 0) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      if (!last) return;
      for (const el of items) {
        const r = el.getBoundingClientRect();
        const dx = last.clientX - (r.left + r.width / 2);
        const dy = last.clientY - (r.top + r.height / 2);
        const reach = Math.max(r.width, r.height) * 0.9;
        const near = Math.hypot(dx, dy) < reach;
        el.style.setProperty("--mgx", near ? `${(dx * 0.18).toFixed(1)}px` : "0px");
        el.style.setProperty("--mgy", near ? `${(dy * 0.25).toFixed(1)}px` : "0px");
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, [pathname]);

  // Le card con .site-spot ricevono la posizione del puntatore per la luce che lo segue.
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      const card = e.target instanceof Element ? e.target.closest<HTMLElement>(".site-spot") : null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return <Cursor />;
}
