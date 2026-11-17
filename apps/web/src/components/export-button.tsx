import type { ExportSection } from "@cantiereos/core";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SearchParams } from "@/lib/list-params";

/**
 * Pulsante "Esporta CSV": invia in POST la sezione e i filtri della pagina
 * corrente; il server ricontrolla permessi e filtri e registra l'esportazione
 * nello storico. Funziona anche senza JavaScript.
 */
export function ExportButton({
  section,
  params,
  label = "Esporta CSV",
}: {
  section: ExportSection;
  params: SearchParams;
  label?: string;
}) {
  const hidden = Object.entries(params).flatMap(([k, v]) =>
    typeof v === "string" && v !== "" && k !== "page" ? [[k, v] as const] : [],
  );
  return (
    <form method="post" action="/app/esporta" data-testid="export-form">
      <input type="hidden" name="section" value={section} />
      {hidden.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button
        type="submit"
        variant="secondary"
        title="Scarica le righe filtrate in un file CSV apribile con Excel. L'esportazione viene registrata nello storico."
      >
        <Download aria-hidden /> {label}
      </Button>
    </form>
  );
}
