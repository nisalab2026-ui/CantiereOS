import { listSuppliers, SUPPLIER_SORTS, type SupplierRow } from "@cantiereos/core";
import { Truck } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { sectionGate } from "@/lib/permissions";

export const metadata: Metadata = { title: "Fornitori" };
const PATH = "/app/fornitori";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "suppliers.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;

  const params = parseListParams(sp, {
    sorts: SUPPLIER_SORTS,
    defaultSort: "name",
    filters: { status: ["active", "inactive"] },
  });
  const id = typeof sp.id === "string" ? sp.id : undefined;
  const page = await asCurrentUser((tx) =>
    listSuppliers(tx, access, {
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

  const columns: Column<SupplierRow>[] = [
    {
      key: "name",
      header: "Fornitore",
      sortKey: "name",
      render: (r) => <span className="font-medium">{r.displayName}</span>,
    },
    {
      key: "code",
      header: "Codice",
      sortKey: "code",
      render: (r) => <span className="font-mono text-xs">{r.code ?? "—"}</span>,
    },
    { key: "category", header: "Categoria", sortKey: "category", render: (r) => r.category ?? "—" },
    {
      key: "city",
      header: "Città",
      sortKey: "city",
      render: (r) => (r.city ? `${r.city}${r.province ? ` (${r.province})` : ""}` : "—"),
    },
    {
      key: "contact",
      header: "Contatti",
      className: "hidden lg:table-cell",
      render: (r) => (
        <div className="text-xs text-muted-foreground">
          {r.email && <p>{r.email}</p>}
          {r.phone && <p>{r.phone}</p>}
          {!r.email && !r.phone && "—"}
        </div>
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
      <PageHeader title="Fornitori" description="Anagrafica dei fornitori dell'azienda attiva." />
      <Card className="overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={params.q}
          placeholder="Cerca per nome, codice, categoria, città"
          filters={[
            {
              name: "status",
              label: "Stato",
              options: [
                { value: "active", label: "Attivi" },
                { value: "inactive", label: "Non attivi" },
              ],
            },
          ]}
          values={{ status: params.filters.status, id }}
        />
        <DataTable
          caption="Elenco fornitori"
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
              icon={Truck}
              title={filtered ? "Nessun fornitore trovato" : "Ancora nessun fornitore"}
              description={
                filtered
                  ? "Prova a cambiare la ricerca o i filtri."
                  : "I fornitori dell'azienda compariranno qui."
              }
            />
          }
        />
      </Card>
    </div>
  );
}
