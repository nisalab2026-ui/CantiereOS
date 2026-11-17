import { listActivity, listActivityActors, TABLE_LABELS } from "@cantiereos/core";
import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Timeline } from "@/components/history/timeline";
import { ExportButton } from "@/components/export-button";
import { Card, CardBody } from "@/components/ui/card";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { listHref, type SearchParams } from "@/lib/list-params";
import { sectionGate } from "@/lib/permissions";
import { IntegrityCheck } from "./integrity-check";

export const metadata: Metadata = { title: "Registro attività" };

const PATH = "/app/registro";
const SECTIONS = [
  "customers",
  "suppliers",
  "employees",
  "teams",
  "deadlines",
  "tasks",
  "comments",
  "payments",
  "communications",
  "form_submissions",
  "form_templates",
  "memberships",
  "invitations",
  "roles",
  "tenant_settings",
  "documents",
  "data_exports",
];
const VERBS = {
  created: "Creazioni",
  updated: "Modifiche",
  deleted: "Eliminazioni",
  exported: "Esportazioni",
} as const;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const isoDate = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "audit.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;

  const table = SECTIONS.includes(one(sp.sezione) ?? "") ? one(sp.sezione) : undefined;
  const verb = one(sp.operazione) as keyof typeof VERBS | undefined;
  const actors = await asCurrentUser((tx) => listActivityActors(tx, access));
  const actorId = actors.some((a) => a.id === one(sp.utente)) ? one(sp.utente) : undefined;
  const from = isoDate(one(sp.from));
  const to = isoDate(one(sp.to));
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const before = one(sp.prima);
  const page = await asCurrentUser((tx) =>
    listActivity(tx, access, {
      ...(table ? { table } : {}),
      ...(verb && VERBS[verb] ? { verb } : {}),
      ...(actorId ? { actorId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(q ? { q } : {}),
      ...(before ? { before } : {}),
      limit: 50,
    }),
  );

  return (
    <div>
      <PageHeader
        title="Registro attività"
        description="Ogni creazione, modifica ed eliminazione dell'azienda, con autore, data e valori prima e dopo. Il registro non è modificabile da nessun utente."
        actions={<ExportButton section="audit" params={sp} />}
      />
      <IntegrityCheck />
      <Card className="overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={q}
          placeholder="Cerca nei dati (nome, email, titolo…)"
          filters={[
            {
              name: "sezione",
              label: "Sezione",
              options: SECTIONS.map((s) => ({
                value: s,
                label: TABLE_LABELS[s]?.section ?? s,
              })).filter((o, i, all) => all.findIndex((x) => x.label === o.label) === i),
            },
            {
              name: "operazione",
              label: "Operazione",
              options: Object.entries(VERBS).map(([value, label]) => ({ value, label })),
            },
            {
              name: "utente",
              label: "Utente",
              options: actors.map((a) => ({ value: a.id, label: a.name })),
            },
          ]}
          values={{ sezione: table, operazione: verb, utente: actorId }}
          dateRange={{ label: "Periodo", from, to }}
        />
        <CardBody className="border-t border-border">
          {before && (
            <p className="mb-4 text-sm">
              <Link
                href={listHref(PATH, sp, { prima: null })}
                className="text-primary hover:underline"
              >
                Torna agli eventi più recenti
              </Link>
            </p>
          )}
          <Timeline
            events={page.events}
            emptyText="Nessun evento con questi filtri. Prova ad ampliare il periodo o a togliere un filtro."
          />
          {page.nextCursor && (
            <div className="mt-6 flex justify-center">
              <Link
                href={listHref(PATH, sp, { prima: page.nextCursor })}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
                data-testid="activity-more"
              >
                <ChevronDown className="size-4" aria-hidden /> Eventi precedenti
              </Link>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
