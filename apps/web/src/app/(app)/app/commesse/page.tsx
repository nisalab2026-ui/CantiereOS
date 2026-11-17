import {
  listProjects,
  loadProjectFormOptions,
  PROJECT_KIND_LABELS,
  PROJECT_SORTS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type ProjectRow,
} from "@cantiereos/core";
import { HardHat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { sectionGate } from "@/lib/permissions";
import { formatDue } from "../scadenze/deadline-bits";
import { Money } from "../pagamenti/payment-bits";
import { ProjectStatusBadge } from "./project-bits";
import { ProjectDialog } from "./project-form";

export const metadata: Metadata = { title: "Commesse" };

const PATH = "/app/commesse";
const STATUS_FILTER: Record<string, string> = {
  closed: "Concluse e annullate",
  all: "Tutte",
  ...Object.fromEntries(PROJECT_STATUSES.map((s) => [s, PROJECT_STATUS_LABELS[s]])),
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { eliminata, ...sp } = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "projects.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("projects.write");
  const canFinance = access.permissions.has("projects.finance");

  const params = parseListParams(sp, {
    sorts: PROJECT_SORTS,
    defaultSort: "updated",
    filters: { status: Object.keys(STATUS_FILTER) },
  });
  const { page, options } = await asCurrentUser(async (tx) => ({
    page: await listProjects(tx, access, {
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      page: params.page,
      pageSize: params.pageSize,
      status: params.filters.status ?? "open",
    }),
    options: canWrite ? await loadProjectFormOptions(tx, access) : null,
  }));
  const filtered = Boolean(params.q || params.filters.status);

  const columns: Column<ProjectRow>[] = [
    {
      key: "code",
      header: "Commessa",
      sortKey: "code",
      render: (r) => (
        <div className="min-w-0">
          <Link
            href={`${PATH}/${r.id}`}
            className="font-medium hover:underline"
            data-testid="project-link"
          >
            <span className="mr-2 font-mono text-xs text-muted-foreground">{r.code}</span>
            {r.name}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {PROJECT_KIND_LABELS[r.kind]}
            {r.siteCount > 0 && ` · ${r.siteCount} ${r.siteCount === 1 ? "cantiere" : "cantieri"}`}
            {r.managerName && ` · ${r.managerName}`}
          </p>
          <p className="mt-1 sm:hidden">
            <ProjectStatusBadge status={r.status} />
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Cliente",
      sortKey: "customer",
      className: "hidden md:table-cell",
      render: (r) => (
        <Link href={`/app/clienti/${r.customer.id}`} className="text-sm hover:underline">
          {r.customer.name}
        </Link>
      ),
    },
    ...(canFinance
      ? [
          {
            key: "contract",
            header: "Contratto",
            className: "hidden text-right lg:table-cell",
            render: (r: ProjectRow) =>
              r.contractCents !== null ? (
                <Money cents={r.contractCents} className="block text-right" />
              ) : (
                <span className="block text-right text-muted-foreground">—</span>
              ),
          } satisfies Column<ProjectRow>,
        ]
      : []),
    {
      key: "start",
      header: "Periodo",
      sortKey: "start",
      className: "hidden sm:table-cell",
      render: (r) =>
        r.startDate || r.endDate ? (
          <span className="text-sm tabular-nums">
            {r.startDate ? formatDue(r.startDate) : "…"} – {r.endDate ? formatDue(r.endDate) : "…"}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "status",
      header: "Stato",
      className: "hidden sm:table-cell",
      render: (r) => <ProjectStatusBadge status={r.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Commesse"
        description="I lavori concordati con i clienti e i loro cantieri. Moduli, attività e documenti si collegano alla commessa e ne formano il riepilogo."
        actions={
          options ? (
            <ProjectDialog mode="create" options={options} canFinance={canFinance} />
          ) : undefined
        }
      />
      {eliminata === "1" && (
        <Notice>Commessa eliminata. La sua cronologia resta nel registro attività.</Notice>
      )}
      {options && options.customers.length === 0 && (
        <Notice>
          Per aprire una commessa serve almeno un cliente.{" "}
          <Link href="/app/clienti" className="font-medium underline">
            Vai ai clienti
          </Link>
        </Notice>
      )}
      <Card className="mt-4 overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={params.q}
          placeholder="Cerca per codice, nome o cliente"
          filters={[
            {
              name: "status",
              label: "Stato",
              emptyLabel: "Aperte",
              options: Object.entries(STATUS_FILTER).map(([value, label]) => ({ value, label })),
            },
          ]}
          values={{ status: params.filters.status }}
        />
        <DataTable
          caption="Elenco commesse"
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
                icon={HardHat}
                title="Nessuna commessa trovata"
                description="Prova a cambiare la ricerca o lo stato."
              />
            ) : (
              <EmptyState
                icon={HardHat}
                title="Nessuna commessa aperta"
                description={
                  canWrite
                    ? "Crea la prima con «Nuova commessa»: scegli il cliente, il tipo di lavoro e, se vuoi, il primo cantiere."
                    : "Le commesse dell'azienda compariranno qui."
                }
              />
            )
          }
        />
      </Card>
    </div>
  );
}
