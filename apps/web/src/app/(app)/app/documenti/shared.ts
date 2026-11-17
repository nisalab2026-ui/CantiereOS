/** Costanti e tipi condivisi tra pagine server e componenti client dell'archivio. */
export interface Option {
  id: string;
  name: string;
}
export type SubjectOptions = Record<"customer" | "supplier" | "employee" | "team", Option[] | null>;

export interface FolderOption {
  id: string;
  /** Percorso leggibile, es. "Clienti / Bianchi / Contratti" */
  label: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  contract: "Contratto",
  certificate: "Certificato",
  invoice: "Fattura o ricevuta",
  report: "Verbale o rapporto",
  photo: "Foto",
  identity: "Documento d'identità",
  safety: "Sicurezza (DVR, POS, DURC)",
  permit: "Permesso o autorizzazione",
  manual: "Manuale o scheda tecnica",
  other: "Altro",
};
export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS);

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Elenco piatto delle cartelle con il percorso completo, ordinato. */
export function folderOptions(
  folders: { id: string; parentId: string | null; name: string }[],
): FolderOption[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const label = (id: string): string => {
    const parts: string[] = [];
    let cur = byId.get(id);
    while (cur && parts.length < 25) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(" / ");
  };
  return folders
    .map((f) => ({ id: f.id, label: label(f.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, "it"));
}
