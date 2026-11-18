import type Lenis from "lenis";

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

/**
 * Coreografia allo scorrimento del sito pubblico, in un solo ciclo requestAnimationFrame (stesso motore
 * del sito Lume Studio). Il markup si attiva con attributi e il CSS trasforma i numeri scritti qui in
 * movimento (app/(marketing)/site.css):
 *
 * - `data-parallax="0.12"`: l'elemento scorre contro la pagina di quella quota della sua distanza dal
 *   centro dello schermo (`--py`, applicato con `translate` per non litigare con il `transform` di un ingresso).
 * - `data-progress`: `--vp` va da 0 a 1 mentre l'elemento attraversa lo schermo.
 * - `data-scrub`: `--sp` va da 0 a 1 mentre il paragrafo passa; le sue `.scrub-word` si accendono in fila.
 * - `data-hscroll`: sezione fissata mentre il suo `[data-hscroll-track]` scorre di lato (solo schermi larghi;
 *   sul telefono resta lo scorrimento col dito con aggancio).
 * - `data-stack`: card fisse che si impilano; ogni figlio riceve `--cover` (0 → 1) mentre la successiva lo copre.
 * - `data-marquee`: nastro di testo che gira da solo, accelera e si inclina con lo scorrimento.
 * - `--scroll` su <html>: quanto si è scesi nella pagina, per la linea di avanzamento.
 *
 * Cambiano solo transform, opacity e proprietà personalizzate, composte dalla GPU. Lo scorrimento morbido
 * (Lenis) si aggiunge solo con mouse o trackpad su una macchina capace; al tocco resta quello del telefono.
 * Con "riduci movimento" non parte niente.
 */
export function startScrollEngine(options: { smooth: boolean }): () => void {
  const root = document.documentElement;
  let lenis: Lenis | null = null;
  let disposed = false;
  let frame = 0;
  let lastY = window.scrollY;
  let lastT = performance.now();
  let velocity = 0;
  const wide = window.matchMedia("(min-width: 768px)");

  type Marquee = { el: HTMLElement; track: HTMLElement; x: number; half: number; speed: number };
  type HScroll = { el: HTMLElement; track: HTMLElement; distance: number };
  let parallax: HTMLElement[] = [];
  let progress: HTMLElement[] = [];
  let scrubs: HTMLElement[] = [];
  let stacks: HTMLElement[][] = [];
  let hscrolls: HScroll[] = [];
  let marquees: Marquee[] = [];

  const measure = () => {
    parallax = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    progress = Array.from(document.querySelectorAll<HTMLElement>("[data-progress]"));
    scrubs = Array.from(document.querySelectorAll<HTMLElement>("[data-scrub]"));
    for (const s of scrubs) {
      const words = s.querySelectorAll<HTMLElement>(".scrub-word");
      s.style.setProperty("--n", String(words.length));
      words.forEach((w, i) => w.style.setProperty("--i", String(i)));
    }
    stacks = Array.from(document.querySelectorAll<HTMLElement>("[data-stack]")).map(
      (el) => Array.from(el.children) as HTMLElement[],
    );
    hscrolls = Array.from(document.querySelectorAll<HTMLElement>("[data-hscroll]")).flatMap(
      (el) => {
        const track = el.querySelector<HTMLElement>("[data-hscroll-track]");
        if (!track) return [];
        if (!wide.matches) {
          el.style.height = "";
          el.removeAttribute("data-pinned");
          track.style.transform = "";
          return [];
        }
        el.setAttribute("data-pinned", "");
        const distance = Math.max(0, track.scrollWidth - window.innerWidth);
        // The section is as tall as the sideways trip, so a pixel of scroll moves the track by a pixel.
        el.style.height = `${distance + window.innerHeight}px`;
        return [{ el, track, distance }];
      },
    );
    const kept = new Map(marquees.map((m) => [m.el, m]));
    marquees = Array.from(document.querySelectorAll<HTMLElement>("[data-marquee]")).flatMap(
      (el) => {
        const track = el.firstElementChild as HTMLElement | null;
        if (!track) return [];
        // The content is written twice; looping at half the width makes the seam invisible.
        return [
          {
            el,
            track,
            x: kept.get(el)?.x ?? 0,
            half: track.scrollWidth / 2,
            speed: Number(el.dataset.marquee) || 40,
          },
        ];
      },
    );
    lenis?.resize();
  };

  const visible = (r: DOMRect, vh: number) => r.bottom > -vh * 0.25 && r.top < vh * 1.25;

  const update = (now: number) => {
    frame = 0;
    if (disposed) return;
    const vh = window.innerHeight;
    const y = lenis ? lenis.scroll : window.scrollY;
    const dt = Math.min(64, now - lastT) || 16;
    const raw = lenis ? lenis.velocity : ((y - lastY) / dt) * 16;
    velocity += (raw - velocity) * 0.18;
    lastY = y;
    lastT = now;

    const max = Math.max(1, root.scrollHeight - vh);
    root.style.setProperty("--scroll", (y / max).toFixed(4));

    for (const el of parallax) {
      const r = el.getBoundingClientRect();
      if (!visible(r, vh)) continue;
      const speed = Number(el.dataset.parallax) || 0.1;
      const offset = r.top + r.height / 2 - vh / 2;
      el.style.setProperty("--py", `${(offset * -speed).toFixed(1)}px`);
    }
    for (const el of progress) {
      const r = el.getBoundingClientRect();
      if (!visible(r, vh)) continue;
      const p = (vh - r.top) / (vh + r.height);
      el.style.setProperty("--vp", Math.min(1, Math.max(0, p)).toFixed(4));
    }
    for (const el of scrubs) {
      const r = el.getBoundingClientRect();
      if (!visible(r, vh)) continue;
      // Starts when the paragraph enters the lower part of the screen, done by the time it reaches the upper third.
      const p = (vh * 0.88 - r.top) / (r.height + vh * 0.5);
      el.style.setProperty("--sp", Math.min(1, Math.max(0, p)).toFixed(4));
    }
    for (const cards of stacks) {
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]!.getBoundingClientRect();
        if (!visible(card, vh)) continue;
        const next = cards[i + 1]?.getBoundingClientRect();
        const cover = next ? (card.bottom - next.top) / Math.max(1, card.height) : 0;
        cards[i]!.style.setProperty("--cover", Math.min(1, Math.max(0, cover)).toFixed(4));
      }
    }
    for (const h of hscrolls) {
      const r = h.el.getBoundingClientRect();
      if (!visible(r, vh)) continue;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
      h.track.style.transform = `translate3d(${(-p * h.distance).toFixed(1)}px, 0, 0)`;
      h.el.style.setProperty("--hp", p.toFixed(4));
    }
    const lean = Math.max(-8, Math.min(8, velocity * 0.35));
    for (const m of marquees) {
      const r = m.el.getBoundingClientRect();
      if (!visible(r, vh) || !m.half) continue;
      const boost = 1 + Math.min(6, Math.abs(velocity) * 0.25);
      const direction = velocity < -0.5 ? -1 : 1;
      m.x -= ((m.speed * boost * direction) / 1000) * dt;
      if (m.x <= -m.half) m.x += m.half;
      if (m.x > 0) m.x -= m.half;
      m.track.style.transform = `translate3d(${m.x.toFixed(1)}px, 0, 0) skewX(${(-lean).toFixed(2)}deg)`;
    }
    // The marquees run on their own, so the loop keeps going while one is on screen.
    if (marquees.length) schedule();
  };

  const schedule = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(update);
  };

  measure();
  schedule();
  window.addEventListener("scroll", schedule, { passive: true });
  const onResize = () => {
    measure();
    schedule();
  };
  window.addEventListener("resize", onResize);
  wide.addEventListener("change", onResize);
  // Images and fonts change heights after the first measure.
  const ro = new ResizeObserver(onResize);
  ro.observe(document.body);

  if (options.smooth) {
    void import("lenis").then(({ default: LenisClass }) => {
      if (disposed) return;
      lenis = new LenisClass({
        autoRaf: true,
        // Più reattivo: la pagina segue la rotella senza "galleggiare".
        lerp: 0.15,
        wheelMultiplier: 1.1,
        anchors: true,
        prevent: (node) => node.closest("[data-lenis-prevent], dialog, [role=dialog]") !== null,
      });
      lenis.on("scroll", schedule);
      window.__lenis = lenis;
      root.dataset.smooth = "";
    });
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", onResize);
    wide.removeEventListener("change", onResize);
    ro.disconnect();
    lenis?.destroy();
    delete window.__lenis;
    delete root.dataset.smooth;
  };
}

/** Rilegge la pagina dopo una navigazione: nuovi elementi da muovere, nuove altezze. */
export function refreshScrollEngine(): void {
  window.dispatchEvent(new Event("resize"));
}
