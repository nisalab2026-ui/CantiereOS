"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { titleFor } from "./navigation";

/**
 * «Recenti»: le ultime schede aperte (clienti, commesse, interventi…) per
 * riaprirle da ⌘K. Restano solo in questo browser, separate per azienda, e
 * contengono solo indirizzo e titolo della pagina: nessun dato viene inviato.
 */
export interface RecentItem {
  href: string;
  title: string;
  section: string;
}

const MAX = 8;
const key = (tenantId: string) => `cos.recent.${tenantId}`;

export function readRecent(tenantId: string): RecentItem[] {
  try {
    const raw = window.localStorage.getItem(key(tenantId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (i): i is RecentItem =>
          typeof i?.href === "string" &&
          i.href.startsWith("/app/") &&
          typeof i.title === "string" &&
          typeof i.section === "string",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function remember(tenantId: string, item: RecentItem) {
  try {
    const list = [item, ...readRecent(tenantId).filter((i) => i.href !== item.href)].slice(0, MAX);
    window.localStorage.setItem(key(tenantId), JSON.stringify(list));
  } catch {
    // archivio del browser non disponibile (navigazione privata): si rinuncia ai recenti
  }
}

/** Solo le schede di un elemento: /app/<sezione>/<id>, non elenchi né «nuovo»/«modifica». */
function isDetail(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "app" || parts.length !== 3) return false;
  return !["nuovo", "mappa", "modelli"].includes(parts[2] ?? "");
}

/** Registra la scheda aperta quando il suo titolo (h1) è disegnato. */
export function RecentTracker({ tenantId }: { tenantId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!isDetail(pathname)) return;
    const save = () => {
      const h1 = document.querySelector("main h1");
      const title = h1?.textContent?.trim();
      if (!title) return false;
      remember(tenantId, {
        href: pathname,
        title: title.slice(0, 120),
        section: titleFor(pathname),
      });
      return true;
    };
    if (save()) return;
    const obs = new MutationObserver(() => {
      if (save()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const stop = setTimeout(() => obs.disconnect(), 4000);
    return () => {
      obs.disconnect();
      clearTimeout(stop);
    };
  }, [pathname, tenantId]);
  return null;
}
