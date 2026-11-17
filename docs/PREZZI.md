# CantiereOS — Prezzi e piani

> Proposta del 17/11/2026, scelta da Claude su richiesta del committente ("il prezzo migliore con più
> possibilità di guadagno"). Valori in `apps/web/src/app/(marketing)/content.ts` (`PLANS`,
> `PRICING_EXTRAS`). Tutti i prezzi sono IVA esclusa.

## Decisione

| Piano       | Annuale (€/mese) | Mensile (€/mese) | Utenti inclusi | Massimo | Per chi                                     |
| ----------- | ---------------- | ---------------- | -------------- | ------- | ------------------------------------------- |
| Base        | 39               | 49               | 3              | 5       | artigiani e piccole imprese                 |
| **Impresa** | **89**           | **109**          | 15             | 30      | impresa con ufficio e squadre (consigliato) |
| Gruppo      | 189              | 229              | 40             | 80      | più aziende o squadre numerose              |

- Utente aggiuntivo: 9 €/mese, fino al massimo del piano. Oltre 80 utenti: offerta su misura.
- Avvio guidato con importazione dati: 390 € una tantum (incluso in Gruppo).
- Prova gratuita di 30 giorni con le funzioni di Impresa, senza carta di credito.
- Annuale: circa 2 mesi in regalo rispetto al mensile.

## Mercato (fonti consultate il 17/11/2026)

| Prodotto                             | Prezzo                                                           | Fonte                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| CantieriCloud Pro                    | 49 €/mese annuale (79 € mensile), titolare + 5 operai            | [cantiericloud.com](https://cantiericloud.com/)                                                 |
| Mela Works Pro                       | 12 €/utente/mese annuale; moduli extra 3–69 €                    | [cantiereonline.it](https://www.cantiereonline.it/blog/quanto-costa-software-gestione-cantiere) |
| PlanRadar                            | 26 €/mese (1 utente) – 89 €/mese                                 | stessa fonte                                                                                    |
| Fieldwire                            | 39–89 $/utente/mese                                              | [fieldwire.com](https://www.fieldwire.com/pricing/)                                             |
| Gestionali edili italiani            | 300–600 €/anno quelli di settore, oltre 600 € per imprese grandi | [trovaimpresa.com](https://trovaimpresa.com/quanto-costa-un-gestionale-edile)                   |
| Concorrente diretto (app rapportini) | 0–39 €/mese con limiti sui rapportini                            | analisi interna del 16/11/2026                                                                  |

## Perché questi numeri

1. **Base a 39 €** sta nella fascia che una piccola impresa riconosce (circa 470 €/anno, dentro i
   300–600 € di settore) e sotto CantieriCloud: abbassa la soglia d'ingresso.
2. **Impresa a 89 €** è il piano su cui si guadagna: per 15 persone costa circa 6 € a utente, meno
   di qualsiasi prodotto a utente (12–39 €), ma porta circa 1.070 €/anno per cliente. È evidenziato,
   al centro e con l'anello di luce (effetto "piano centrale").
3. **Gruppo a 189 €** fa da àncora: rende Impresa conveniente a colpo d'occhio e raccoglie chi
   gestisce più aziende (funzione che i concorrenti non hanno), con l'avvio guidato incluso.
4. **Tetto di 5 utenti su Base**: con 9 € per utente in più, da 6 persone in su Impresa è l'unica
   scelta. Il calcolo nella pagina lo mostra in modo trasparente.
5. **Leve senza svendere**: prova lunga (30 giorni) invece di un piano gratuito permanente, sconto
   annuale per incassare in anticipo e ridurre gli abbandoni, avvio guidato a pagamento come ricavo
   in più.
6. **Si differenzia per valore, non per sicurezza**: verifica in due passaggi, ruoli e isolamento
   dei dati sono in tutti i piani.

## Cosa manca prima di vendere davvero

- Nessun sistema di pagamento è collegato e i limiti dei piani (utenti, modelli, spazio) **non sono
  ancora applicati dal software**: servono il provider pagamenti (ROADMAP fase 7) e i controlli.
- Condizioni di prova, recesso e fatturazione vanno scritte nei termini di servizio.
- Da rivedere dopo i primi 20–30 clienti: conversione dalla prova e piano più scelto.
