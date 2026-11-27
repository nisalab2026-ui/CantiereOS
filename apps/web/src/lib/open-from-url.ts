"use client";

import { useEffect, useRef } from "react";

/** Parametro dell'indirizzo che apre la finestra di creazione di un elenco. */
export const CREATE_PARAM = "crea";

/**
 * Apre una finestra di creazione quando l'indirizzo contiene `?crea=1`
 * (dal menu «+ Nuovo» o da ⌘K), poi toglie il parametro dall'indirizzo, così
 * un ricaricamento o il tasto indietro non la riaprono. Solo comodità: il
 * server ricontrolla il permesso a ogni salvataggio.
 */
export function useOpenFromUrl(enabled: boolean, open: () => void): void {
  const fn = useRef(open);
  fn.current = open;
  useEffect(() => {
    if (!enabled) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(CREATE_PARAM) !== "1") return;
    url.searchParams.delete(CREATE_PARAM);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    fn.current();
  }, [enabled]);
}
