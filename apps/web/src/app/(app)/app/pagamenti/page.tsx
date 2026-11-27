import { listPayments, PAYMENT_SORTS, type PaymentRow } from "@cantiereos/core";
import { Wallet } from "lucide-react";
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
import { formatDue } from "../scadenze/deadline-bits";
import { Money, PaymentDirection, PaymentStateBadge } from "./payment-bits";
import { PaymentDialog } from "./payment-form";

export const metadata: Metadata = { title: "Pagamenti" };

const PATH = "/app/pagamenti";
const STATES = {
  overdue: "In ritardo",
  paid: "Pagati",
  cancelled: "Annullati",
  all: "Tutti",
} as const;
const DIRECTIONS = { incoming: "Da incassare", outgoing: "Da pagare" } as const;
const isoDate = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { eliminato, ...sp } = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "payments.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("payments.write");

  const params = parseListParams(sp, {
    sorts: PAYMENT_SORTS,
    defaultSort: "due",
    filters: { state: Object.keys(STATES), direction: Object.keys(DIRECTIONS) },
  });
  const from = isoDate(sp.from);
  const to = isoDate(sp.to);
  const { page, options } = await asCurrentUser(async (tx) => ({
    page: await listPayments(tx, access, {
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      page: params.page,
      pageSize: params.pageSize,
      state: params.filters.state ?? "open",
      ...(params.filters.direction ? { direction: params.filters.direction } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    options: canWrite ? await loadDeadlineOptions(tx, access) : null,
  }));
  const filtered = Boolean(
    params.q || params.filters.state || params.filters.direction || from || to,
  );

  const columns: Column<PaymentRow>[] = [
    {
      key: "description",
      header: "Pagamento",
      sortKey: "description",
      render: (r) => (
        <div className="min-w-0">
          <Link
            href={`${PATH}/${r.id}`}
            className="font-medium hover:underline"
            data-testid="payment-link"
          >
            {r.description}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <PaymentDirection direction={r.direction} />
            {r.referenceCode && <span>{r.referenceCode}</span>}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs sm:hidden">
            <PaymentStateBadge state={r.state} />
            <span className="tabular-nums text-muted-foreground">{formatDue(r.dueDate)}</span>
          </p>
        </div>
      ),
    },
    {
      key: "counterparty",
      header: "Controparte",
      className: "hidden md:table-cell",
      render: (r) =>
        r.counterparty ? (
          r.counterparty.type === "customer" ? (
            <Link href={`/app/clienti/${r.counterparty.id}`} className="text-sm hover:underline">
              {r.counterparty.name}
            </Link>
          ) : (
            <span className="text-sm">{r.counterparty.name}</span>
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "amount",
      header: "Importo",
      sortKey: "amount",
      align: "right",
      className: "text-right",
      render: (r) => (
        <div className="text-right">
          <Money cents={r.amountCents} className="font-medium" />
          {r.paidAmountCents !== null && r.paidAmountCents !== r.amountCents && (
            <p className="text-xs text-muted-foreground">
              pagati <Money cents={r.paidAmountCents} />
            </p>
          )}
        </div>
      ),
    },
    {
      key: "due",
      header: "Data prevista",
      sortKey: "due",
      className: "hidden sm:table-cell",
      render: (r) => <span className="tabular-nums">{formatDue(r.dueDate)}</span>,
    },
    {
      key: "state",
      header: "Stato",
      className: "hidden sm:table-cell",
      render: (r) => <PaymentStateBadge state={r.state} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Pagamenti"
        description="Incassi attesi dai clienti e pagamenti da fare ai fornitori, con date e solleciti. Non è contabilità: nessun movimento bancario viene eseguito."
        actions={
          <>
            <ExportButton section="payments" params={sp} />
            {options && (
              <PaymentDialog
                mode="create"
                openFromUrl
                customers={options.subjects.customer}
                suppliers={options.subjects.supplier}
              />
            )}
          </>
        }
      />
      {eliminato === "1" && (
        <Notice>Pagamento eliminato. La sua cronologia resta nel registro attività.</Notice>
      )}
      {page.total > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="payment-totals">
          <div className="rounded-md border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Da incassare (righe filtrate)</p>
            <Money cents={page.totals.incomingCents} className="text-xl font-semibold" />
          </div>
          <div className="rounded-md border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Da pagare (righe filtrate)</p>
            <Money cents={page.totals.outgoingCents} className="text-xl font-semibold" />
          </div>
        </div>
      )}
      <Card className="mt-4 overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={params.q}
          placeholder="Cerca per descrizione, riferimento, cliente, fornitore"
          filters={[
            {
              name: "state",
              label: "Stato",
              emptyLabel: "Aperti",
              options: Object.entries(STATES).map(([value, label]) => ({ value, label })),
            },
            {
              name: "direction",
              label: "Tipo",
              options: Object.entries(DIRECTIONS).map(([value, label]) => ({ value, label })),
            },
          ]}
          values={{ state: params.filters.state, direction: params.filters.direction }}
          dateRange={{ label: "Data prevista", from, to }}
        />
        <DataTable
          caption="Elenco pagamenti"
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
                icon={Wallet}
                title="Nessun pagamento trovato"
                description="Prova a cambiare la ricerca, i filtri o l'intervallo di date."
              />
            ) : (
              <EmptyState
                icon={Wallet}
                title="Nessun pagamento aperto"
                description={
                  canWrite
                    ? "Registra SAL, fatture da incassare e pagamenti ai fornitori con «Nuovo pagamento»: compariranno nel calendario e in panoramica."
                    : "I pagamenti attesi dell'azienda compariranno qui."
                }
              />
            )
          }
        />
      </Card>
    </div>
  );
}
