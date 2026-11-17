import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { CtaBand, FaqList, PageIntro, SectionHeading } from "@/components/site/blocks";
import { Pricing } from "@/components/site/pricing";
import { getVerifiedSession } from "@/lib/auth";
import { PLANS, PRICING_EXTRAS, PRICING_FAQ } from "../content";

export const metadata: Metadata = {
  title: "Prezzi",
  description:
    "Tre piani con gli utenti inclusi, da 39 € al mese. Prova gratuita di 30 giorni senza carta di credito.",
};

/** Confronto: true = incluso, false = no, testo = quantità. */
const COMPARE: [string, (boolean | string)[]][] = [
  ["Utenti inclusi", ["3", "15", "40"]],
  ["Utenti massimi", ["5", "30", "80"]],
  [
    "Utente aggiuntivo",
    [
      `${PRICING_EXTRAS.extraUser} €/mese`,
      `${PRICING_EXTRAS.extraUser} €/mese`,
      `${PRICING_EXTRAS.extraUser} €/mese`,
    ],
  ],
  ["Clienti, fornitori, personale, squadre", [true, true, true]],
  ["Scadenze con ricorrenze e avvisi", [true, true, true]],
  ["Attività, calendario e commenti", [true, true, true]],
  ["Modelli di modulo compilabile", ["5", "Illimitati", "Illimitati"]],
  ["Archivio documenti", ["10 GB", "50 GB", "200 GB"]],
  ["Pagamenti attesi e incassi", [false, true, true]],
  ["Registro delle comunicazioni", [false, true, true]],
  ["Storico prima/dopo e registro attività", [false, true, true]],
  ["Esportazioni in Excel (CSV)", [false, true, true]],
  ["Più aziende con un accesso", [false, false, "Fino a 3"]],
  ["Verifica in due passaggi e ruoli", [true, true, true]],
  [
    "Avvio guidato e importazione dati",
    [`${PRICING_EXTRAS.onboarding} €`, `${PRICING_EXTRAS.onboarding} €`, "Incluso"],
  ],
  ["Assistenza", ["Email", "Email", "Prioritaria"]],
];

export default async function PricingPage() {
  const signedIn = await getVerifiedSession()
    .then(Boolean)
    .catch(() => false);
  return (
    <>
      <PageIntro
        eyebrow="Prezzi"
        title="Paghi per l'impresa,"
        accent="non per persona."
        lead={`Tre piani con gli utenti già inclusi. Provali gratis per ${PRICING_EXTRAS.trialDays} giorni con tutte le funzioni, senza carta di credito.`}
      />

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Pricing plans={PLANS} extraUser={PRICING_EXTRAS.extraUser} signedIn={signedIn} />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="Confronto" title="Cosa c'è in ogni piano." />
        <div className="mt-10 overflow-x-auto rounded-3xl border border-border bg-card" data-reveal>
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">Confronto dei piani</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-5 py-4 text-left font-medium text-muted-foreground">
                  Funzione
                </th>
                {PLANS.map((p) => (
                  <th
                    key={p.id}
                    scope="col"
                    className={`px-5 py-4 text-center font-semibold ${p.recommended ? "text-primary" : ""}`}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([label, values]) => (
                <tr key={label} className="border-b border-border last:border-0 hover:bg-accent/40">
                  <th scope="row" className="px-5 py-3.5 text-left font-normal">
                    {label}
                  </th>
                  {values.map((v, i) => (
                    <td key={i} className="px-5 py-3.5 text-center">
                      {v === true ? (
                        <Check className="mx-auto size-4 text-success" aria-label="Incluso" />
                      ) : v === false ? (
                        <Minus
                          className="mx-auto size-4 text-muted-foreground/50"
                          aria-label="Non incluso"
                        />
                      ) : (
                        v
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading center eyebrow="Domande sui prezzi" title="Senza sorprese." />
        <div className="mt-12">
          <FaqList items={PRICING_FAQ} />
        </div>
      </section>

      <CtaBand signedIn={signedIn} />
    </>
  );
}
