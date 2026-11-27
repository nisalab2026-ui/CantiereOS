import {
  listWorkReports,
  loadWorkReportOptions,
  WORK_REPORT_STATUS_LABELS,
  WORK_REPORT_STATUSES,
  type WorkReportRow,
} from "@cantiereos/core";
import { ClipboardList } from "lucide-react";
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
import { NewReportDialog } from "./new-report";
import { formatHours, formatReportDate, ReportStatusBadge } from "./report-bits";

export const metadata: Metadata = { title: "Rapportini" };

const PATH = "/app/rapportini";
const STATUS_FILTER: Record<string, string> = {
  all: "Tutti",
  ...Object.fromEntries(WORK_REPORT_STATUSES.map((s) => [s, WORK_REPORT_STATUS_LABELS[s]])),
};
const WHO_FILTER: Record<string, string> = { mine: "Solo i miei" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { eliminato, ...sp } = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "work_reports.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("work_reports.write");
  const canApprove = access.permissions.has("work_reports.approve");

  const params = parseListParams(sp, {
    sorts: ["date"] as const,
    defaultSort: "date",
    filters: { status: Object.keys(STATUS_FILTER), who: Object.keys(WHO_FILTER) },
  });
  const { page, options } = await asCurrentUser(async (tx) => ({
    page: await listWorkReports(tx, access, {
      q: params.q,
      page: params.page,
      pageSize: params.pageSize,
      status: params.filters.status ?? "open",
      mine: params.filters.who === "mine",
    }),
    options: canWrite ? await loadWorkReportOptions(tx, access) : null,
  }));
  const filtered = Boolean(params.q || params.filters.status || params.filters.who);

  const columns: Column<WorkReportRow>[] = [
    {
      key: "number",
      header: "Rapportino",
      render: (r) => (
        <div className="min-w-0">
          <Link
            href={`${PATH}/${r.id}`}
            className="font-medium hover:underline"
            data-testid="report-link"
          >
            <span className="mr-2 font-mono text-xs text-muted-foreground">{r.number}</span>
            {formatReportDate(r.reportDate)}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {r.authorName ?? "—"}
            {r.people > 0 && ` · ${r.people} ${r.people === 1 ? "persona" : "persone"}`}
          </p>
          <p className="mt-1 sm:hidden">
            <ReportStatusBadge status={r.status} />{" "}
            <span className="text-xs">{formatHours(r.hours)}</span>
          </p>
        </div>
      ),
    },
    {
      key: "project",
      header: "Commessa",
      className: "hidden md:table-cell",
      render: (r) => (
        <div className="min-w-0 text-sm">
          <Link href={`/app/commesse/${r.project.id}`} className="hover:underline">
            <span className="mr-1.5 font-mono text-xs text-muted-foreground">{r.project.code}</span>
            {r.project.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {r.customerName}
            {r.siteName && ` · ${r.siteName}`}
          </p>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Ore",
      align: "right",
      className: "hidden text-right sm:table-cell",
      render: (r) => <span className="block text-right tabular-nums">{formatHours(r.hours)}</span>,
    },
    {
      key: "status",
      header: "Stato",
      className: "hidden sm:table-cell",
      render: (r) => <ReportStatusBadge status={r.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Rapportini"
        description={
          canApprove
            ? "Le giornate di lavoro sulle commesse: ore, materiali, foto e firma del cliente. Approva quelli inviati: solo gli approvati entrano nei costi della commessa."
            : "Le giornate di lavoro sulle commesse: ore, materiali, foto e firma del cliente. Compila e invia per l'approvazione."
        }
        actions={options ? <NewReportDialog projects={options.projects} openFromUrl /> : undefined}
      />
      {eliminato === "1" && (
        <Notice>Rapportino eliminato. La sua cronologia resta nel registro attività.</Notice>
      )}
      <Card className="mt-4 overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={params.q}
          placeholder="Cerca per numero, commessa, cliente o lavori"
          filters={[
            {
              name: "status",
              label: "Stato",
              emptyLabel: "Da completare (bozze e inviati)",
              options: Object.entries(STATUS_FILTER).map(([value, label]) => ({ value, label })),
            },
            {
              name: "who",
              label: "Autore",
              emptyLabel: "Tutti",
              options: Object.entries(WHO_FILTER).map(([value, label]) => ({ value, label })),
            },
          ]}
          values={{ status: params.filters.status, who: params.filters.who }}
        />
        <DataTable
          caption="Elenco rapportini"
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
                icon={ClipboardList}
                title="Nessun rapportino trovato"
                description="Prova a cambiare la ricerca o i filtri."
              />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="Nessun rapportino da completare"
                description={
                  canWrite
                    ? "Crea il primo con «Nuovo rapportino»: scegli la commessa e il giorno, poi aggiungi ore e materiali."
                    : "I rapportini dell'azienda compariranno qui."
                }
              />
            )
          }
        />
      </Card>
    </div>
  );
}
