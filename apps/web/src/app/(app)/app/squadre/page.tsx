import { listTeams, TEAM_SORTS, type TeamRow } from "@cantiereos/core";
import { UsersRound } from "lucide-react";
import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "Squadre" };
const PATH = "/app/squadre";

export default async function TeamsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "teams.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;

  const params = parseListParams(sp, {
    sorts: TEAM_SORTS,
    defaultSort: "name",
    filters: { status: ["active", "inactive"] },
  });
  const id = typeof sp.id === "string" ? sp.id : undefined;
  const page = await asCurrentUser((tx) =>
    listTeams(tx, access, {
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      page: params.page,
      pageSize: params.pageSize,
      ...(id ? { id } : {}),
      ...(params.filters.status ? { status: params.filters.status as "active" | "inactive" } : {}),
    }),
  );
  const filtered = Boolean(params.q || params.filters.status || id);

  const columns: Column<TeamRow>[] = [
    {
      key: "name",
      header: "Squadra",
      sortKey: "name",
      render: (r) => (
        <span className="inline-flex items-center gap-2 font-medium">
          <span
            className="size-2.5 rounded-full border border-border"
            style={{ backgroundColor: r.color ?? "transparent" }}
            aria-hidden
          />
          {r.name}
        </span>
      ),
    },
    { key: "leader", header: "Caposquadra", render: (r) => r.leader ?? "—" },
    {
      key: "members",
      header: "Componenti",
      sortKey: "members",
      align: "right",
      render: (r) => r.members,
    },
    {
      key: "status",
      header: "Stato",
      render: (r) =>
        r.isActive ? <Badge tone="success">Attiva</Badge> : <Badge>Non attiva</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Squadre"
        description="Squadre operative e loro composizione."
        actions={<ExportButton section="teams" params={sp} />}
      />
      <Card className="overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={params.q}
          placeholder="Cerca per nome"
          filters={[
            {
              name: "status",
              label: "Stato",
              options: [
                { value: "active", label: "Attive" },
                { value: "inactive", label: "Non attive" },
              ],
            },
          ]}
          values={{ status: params.filters.status, id }}
        />
        <DataTable
          caption="Elenco squadre"
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
              icon={UsersRound}
              title={filtered ? "Nessuna squadra trovata" : "Ancora nessuna squadra"}
              description={
                filtered
                  ? "Prova a cambiare la ricerca o i filtri."
                  : "Le squadre dell'azienda compariranno qui."
              }
            />
          }
        />
      </Card>
    </div>
  );
}
