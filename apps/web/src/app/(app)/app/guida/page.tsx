import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { getAppContext } from "@/lib/auth";
import { GUIDE } from "./content";
import { GuideBrowser } from "./guide-browser";

export const metadata: Metadata = { title: "Guida" };

/**
 * Guida all'uso. Mostra solo le voci delle parti dell'app che l'utente può
 * usare (o sbloccare con la verifica in due passaggi), così nessuno legge
 * istruzioni per pulsanti che non vedrà mai.
 */
export default async function GuidePage() {
  const { access } = await getAppContext();
  const can = (p?: string) =>
    !p || access.permissions.has(p) || access.permissionsRequiringMfa.has(p);
  const topics = GUIDE.filter((t) => can(t.permission));

  return (
    <div>
      <PageHeader
        title="Guida"
        description="Come si usa CantiereOS, sezione per sezione. Cerca una parola o apri una domanda."
      />
      <GuideBrowser topics={topics} />
    </div>
  );
}
