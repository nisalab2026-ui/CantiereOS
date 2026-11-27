import { DEADLINE_SORTS, listDeadlines, type DeadlineRow } from "@cantiereos/core";
import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { ExportButton } from "@/components/export-button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { loadDeadlineOptions } from "@/lib/deadline-options";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { sectionGate } from "@/lib/permissions";
import {
  daysText,
  DeadlineStateBadge,
  formatDue,
  SUBJECT_HREF,
  SUBJECT_LABEL,
} from "./deadline-bits";
import { DeadlineDialog } from "./deadline-form";

export const metadata: Metadata = { title: "Scadenze" };

const PATH = "/app/scadenze";
const KINDS = {
  certification: "Certificazioni",
  maintenance: "Manutenzioni",
  inspection: "Controlli periodici",
  document: "Documenti",
  payment: "Pagamenti",
  contract: "Contratti",
  other: "Altro",
} as const;
const KIND_ONE: Record<string, string> = {
  certification: "Certificazione",
  maintenance: "Manutenzione",
  inspection: "Controllo periodico",
  document: "Documento",
  payment: "Pagamento",
  contract: "Contratto",
  other: "Altro",
};
const STATES = {
  overdue: "In ritardo",
  due_soon: "In scadenza",
  done: "Completate",
  cancelled: "Annullate",
  all: "Tutte",
} as const;
const isoDate = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { eliminata, ...sp } = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "deadlines.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("deadlines.write");

  const params = parseListParams(sp, {
    sorts: DEADLINE_SORTS,
    defaultSort: "due",
    filters: {
      state: Object.keys(STATES),
      kind: Object.keys(KINDS),
      responsible: ["me", "none"],
    },
  });
  const from = isoDate(sp.from);
  const to = isoDate(sp.to);
  const { page, options } = await asCurrentUser(async (tx) => ({
    page: await listDeadlines(tx, access, {
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      page: params.page,
      pageSize: params.pageSize,
      state: params.filters.state ?? "open",
      ...(params.filters.kind ? { kind: params.filters.kind } : {}),
      ...(params.filters.responsible
        ? { responsible: params.filters.responsible as "me" | "none" }
        : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    options: canWrite ? await loadDeadlineOptions(tx, access) : null,
  }));
  const filtered = Boolean(
    params.q ||
    params.filters.kind ||
    params.filters.responsible ||
    params.filters.state ||
    from ||
    to,
  );

  const columns: Column<DeadlineRow>[] = [
    {
      key: "title",
      header: "Scadenza",
      sortKey: "title",
      render: (r) => (
        <div className="min-w-0">
          <Link
            href={`${PATH}/${r.id}`}
            className="font-medium hover:underline"
            data-testid="deadline-link"
          >
            {r.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {KIND_ONE[r.kind]}
            {r.referenceCode ? ` · ${r.referenceCode}` : ""}
            {r.recurrenceMonths ? " · ricorrente" : ""}
          </p>
        </div>
      ),
    },
    {
      key: "subject",
      header: "Riferita a",
      className: "hidden md:table-cell",
      render: (r) =>
        r.subject ? (
          <div className="text-sm">
            {SUBJECT_HREF[r.subject.type] ? (
              <Link
                href={`${SUBJECT_HREF[r.subject.type]}/${r.subject.id}`}
                className="hover:underline"
              >
                {r.subject.name}
              </Link>
            ) : (
              r.subject.name
            )}
            <p className="text-xs text-muted-foreground">{SUBJECT_LABEL[r.subject.type]}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "responsible",
      header: "Responsabile",
      className: "hidden lg:table-cell",
      render: (r) => r.responsibleName ?? <span className="text-muted-foreground">Nessuno</span>,
    },
    {
      key: "due",
      header: "Data",
      sortKey: "due",
      render: (r) => (
        <div className="tabular-nums">
          <p>{formatDue(r.dueDate)}</p>
          {daysText(r) && <p className="text-xs text-muted-foreground">{daysText(r)}</p>}
        </div>
      ),
    },
    { key: "state", header: "Stato", render: (r) => <DeadlineStateBadge state={r.state} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Scadenze"
        description="Certificazioni, manutenzioni, controlli periodici, documenti e pagamenti in un unico scadenziario."
        actions={
          <>
            <ExportButton section="deadlines" params={sp} />
            {options && (
              <DeadlineDialog
                mode="create"
                openFromUrl
                subjects={options.subjects}
                members={options.members}
              />
            )}
          </>
        }
      />
      {eliminata === "1" && (
        <Notice>Scadenza eliminata. La sua cronologia resta nel registro attività.</Notice>
      )}
      <Card className="mt-4 overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={params.q}
          placeholder="Cerca per titolo, riferimento, cliente, dipendente"
          filters={[
            {
              name: "state",
              label: "Stato",
              emptyLabel: "Aperte",
              options: Object.entries(STATES).map(([value, label]) => ({ value, label })),
            },
            {
              name: "kind",
              label: "Tipo",
              options: Object.entries(KINDS).map(([value, label]) => ({ value, label })),
            },
            {
              name: "responsible",
              label: "Responsabile",
              options: [
                { value: "me", label: "Assegnate a me" },
                { value: "none", label: "Senza responsabile" },
              ],
            },
          ]}
          values={{
            state: params.filters.state,
            kind: params.filters.kind,
            responsible: params.filters.responsible,
          }}
          dateRange={{ label: "Scadenza", from, to }}
        />
        <DataTable
          caption="Elenco scadenze"
          columns={columns}
          rows={page.rows}
          total={page.total}
          page={page.page}
          pageSize={page.pageSize}
          sort={params.sort}
          dir={params.dir}
          pathname={PATH}
          searchParams={sp}
          empty={
            filtered ? (
              <EmptyState
                icon={CalendarClock}
                title="Nessuna scadenza trovata"
                description="Prova a cambiare la ricerca, i filtri o l'intervallo di date."
              />
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="Nessuna scadenza aperta"
                description={
                  canWrite
                    ? "Aggiungi certificazioni, manutenzioni e controlli con «Nuova scadenza»: riceverai gli avvisi prima della data."
                    : "Le scadenze dell'azienda compariranno qui."
                }
              />
            )
          }
        />
      </Card>
    </div>
  );
}
