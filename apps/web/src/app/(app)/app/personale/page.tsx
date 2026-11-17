import { EMPLOYEE_SORTS, listEmployees, type EmployeeRow } from "@cantiereos/core";
import { HardHat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { EmployeeDialog } from "./employee-form";
import { Badge } from "@/components/ui/badge";
import { ExportButton } from "@/components/export-button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { sectionGate } from "@/lib/permissions";

export const metadata: Metadata = { title: "Personale" };
const PATH = "/app/personale";
const EMPLOYMENT = {
  employee: "Dipendente",
  contractor: "Collaboratore",
  temporary: "Temporaneo",
  intern: "Tirocinante",
} as const;

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { creato, ...sp } = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "employees.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;

  const params = parseListParams(sp, {
    sorts: EMPLOYEE_SORTS,
    defaultSort: "name",
    filters: { type: Object.keys(EMPLOYMENT), status: ["active", "inactive"] },
  });
  const id = typeof sp.id === "string" ? sp.id : undefined;
  const page = await asCurrentUser((tx) =>
    listEmployees(tx, access, {
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      page: params.page,
      pageSize: params.pageSize,
      ...(id ? { id } : {}),
      ...(params.filters.type ? { type: params.filters.type } : {}),
      ...(params.filters.status ? { status: params.filters.status as "active" | "inactive" } : {}),
    }),
  );
  const filtered = Boolean(params.q || params.filters.type || params.filters.status || id);

  const columns: Column<EmployeeRow>[] = [
    {
      key: "name",
      header: "Persona",
      sortKey: "name",
      render: (r) => (
        <div>
          <Link
            href={`${PATH}/${r.id}`}
            className="font-medium hover:underline"
            data-testid="employee-link"
          >
            {r.lastName} {r.firstName}
          </Link>
          {r.code && <p className="font-mono text-xs text-muted-foreground">{r.code}</p>}
        </div>
      ),
    },
    { key: "job", header: "Mansione", sortKey: "job", render: (r) => r.jobTitle ?? "—" },
    { key: "type", header: "Rapporto", render: (r) => EMPLOYMENT[r.employmentType] },
    {
      key: "teams",
      header: "Squadre",
      className: "hidden md:table-cell",
      render: (r) =>
        r.teams.length ? (
          <div className="flex flex-wrap gap-1">
            {r.teams.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        ) : (
          "—"
        ),
    },
    {
      key: "account",
      header: "Accesso app",
      className: "hidden lg:table-cell",
      render: (r) =>
        r.hasAccount ? (
          <Badge tone="info">Collegato</Badge>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
    {
      key: "status",
      header: "Stato",
      render: (r) =>
        r.isActive ? <Badge tone="success">Attivo</Badge> : <Badge>Non attivo</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Personale"
        description="Dipendenti e collaboratori dell'azienda attiva."
        actions={
          <>
            <ExportButton section="employees" params={sp} />
            {access.permissions.has("employees.write") && <EmployeeDialog mode="create" />}
          </>
        }
      />
      {creato === "1" && <Notice>Persona aggiunta.</Notice>}
      <Card className="overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={params.q}
          placeholder="Cerca per nome, codice, mansione"
          filters={[
            {
              name: "type",
              label: "Rapporto",
              options: Object.entries(EMPLOYMENT).map(([value, label]) => ({ value, label })),
            },
            {
              name: "status",
              label: "Stato",
              options: [
                { value: "active", label: "Attivi" },
                { value: "inactive", label: "Non attivi" },
              ],
            },
          ]}
          values={{ type: params.filters.type, status: params.filters.status, id }}
        />
        <DataTable
          caption="Elenco del personale"
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
            <EmptyState
              icon={HardHat}
              title={filtered ? "Nessuna persona trovata" : "Ancora nessuna scheda"}
              description={
                filtered
                  ? "Prova a cambiare la ricerca o i filtri."
                  : "Le schede del personale compariranno qui."
              }
            />
          }
        />
      </Card>
    </div>
  );
}
