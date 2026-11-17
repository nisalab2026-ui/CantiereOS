import { CUSTOMER_SORTS, listCustomers, type CustomerRow } from "@cantiereos/core";
import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
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
import { NewCustomerDialog } from "./new-customer-dialog";

export const metadata: Metadata = { title: "Clienti" };

const PARTY_TYPES = {
  company: "Azienda",
  individual: "Privato",
  public_entity: "Ente pubblico",
} as const;
const PATH = "/app/clienti";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { creato, ...sp } = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "customers.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("customers.write");

  const params = parseListParams(sp, {
    sorts: CUSTOMER_SORTS,
    defaultSort: "name",
    filters: { type: Object.keys(PARTY_TYPES), status: ["active", "inactive"] },
  });
  const id = typeof sp.id === "string" ? sp.id : undefined;
  const page = await asCurrentUser((tx) =>
    listCustomers(tx, access, {
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

  const columns: Column<CustomerRow>[] = [
    {
      key: "name",
      header: "Cliente",
      sortKey: "name",
      render: (r) => (
        <div>
          <Link
            href={`${PATH}/${r.id}`}
            className="font-medium hover:underline"
            data-testid="customer-link"
          >
            {r.displayName}
          </Link>
          {r.vatNumber && <p className="font-mono text-xs text-muted-foreground">{r.vatNumber}</p>}
        </div>
      ),
    },
    {
      key: "code",
      header: "Codice",
      sortKey: "code",
      render: (r) => <span className="font-mono text-xs">{r.code ?? "—"}</span>,
    },
    { key: "type", header: "Tipo", render: (r) => PARTY_TYPES[r.partyType] },
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
    { key: "sites", header: "Sedi", align: "right", render: (r) => r.sites },
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
        title="Clienti"
        description="Anagrafica dei clienti dell'azienda attiva."
        actions={
          <>
            <ExportButton section="customers" params={sp} />
            {canWrite && <NewCustomerDialog />}
          </>
        }
      />
      {creato === "1" && id && <Notice>Cliente creato.</Notice>}
      <Card className="mt-4 overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={params.q}
          placeholder="Cerca per nome, codice, partita IVA, città"
          filters={[
            {
              name: "type",
              label: "Tipo",
              options: Object.entries(PARTY_TYPES).map(([value, label]) => ({ value, label })),
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
          caption="Elenco clienti"
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
                icon={Building2}
                title="Nessun cliente trovato"
                description="Prova a cambiare la ricerca o i filtri."
              />
            ) : (
              <EmptyState
                icon={Building2}
                title="Ancora nessun cliente"
                description={
                  canWrite
                    ? "Crea il primo cliente con il pulsante «Nuovo cliente»."
                    : "I clienti dell'azienda compariranno qui."
                }
              />
            )
          }
        />
      </Card>
    </div>
  );
}
