import { listCommunications, type CommunicationRow } from "@cantiereos/core";
import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { ExportButton } from "@/components/export-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { loadDeadlineOptions } from "@/lib/deadline-options";
import { formatDateTime, romeLocalDateTime } from "@/lib/format";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { sectionGate } from "@/lib/permissions";
import { formatDue, SUBJECT_LABEL } from "../scadenze/deadline-bits";
import { ChannelLabel, RELATED_HREF } from "./communication-bits";
import { CommunicationDialog } from "./communication-form";

export const metadata: Metadata = { title: "Comunicazioni" };

const PATH = "/app/comunicazioni";
const CHANNELS = {
  phone: "Telefonate",
  email: "Email",
  pec: "PEC",
  meeting: "Incontri",
  letter: "Lettere",
  message: "Messaggi",
  other: "Altro",
} as const;
const DIRECTIONS = { inbound: "Ricevute", outbound: "Inviate" } as const;
const isoDate = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { eliminata, ...sp } = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "communications.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("communications.write");

  const params = parseListParams(sp, {
    sorts: ["date"] as const,
    defaultSort: "date",
    filters: {
      channel: Object.keys(CHANNELS),
      direction: Object.keys(DIRECTIONS),
      followUp: ["pending"],
    },
  });
  const from = isoDate(sp.from);
  const to = isoDate(sp.to);
  const { page, options } = await asCurrentUser(async (tx) => ({
    page: await listCommunications(tx, access, {
      q: params.q,
      dir: params.sort === "date" && sp.dir === "asc" ? "asc" : "desc",
      page: params.page,
      pageSize: params.pageSize,
      ...(params.filters.channel ? { channel: params.filters.channel } : {}),
      ...(params.filters.direction ? { direction: params.filters.direction } : {}),
      ...(params.filters.followUp ? { followUp: params.filters.followUp } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    options: canWrite ? await loadDeadlineOptions(tx, access) : null,
  }));
  const filtered = Boolean(
    params.q ||
    params.filters.channel ||
    params.filters.direction ||
    params.filters.followUp ||
    from ||
    to,
  );

  const columns: Column<CommunicationRow>[] = [
    {
      key: "subject",
      header: "Comunicazione",
      render: (r) => (
        <div className="min-w-0">
          <Link
            href={`${PATH}/${r.id}`}
            className="font-medium hover:underline"
            data-testid="communication-link"
          >
            {r.subject}
          </Link>
          <p className="mt-0.5">
            <ChannelLabel channel={r.channel} direction={r.direction} />
          </p>
        </div>
      ),
    },
    {
      key: "related",
      header: "Con",
      className: "hidden md:table-cell",
      render: (r) =>
        r.related ? (
          <div className="text-sm">
            {RELATED_HREF[r.related.type] ? (
              <Link
                href={`${RELATED_HREF[r.related.type]}/${r.related.id}`}
                className="hover:underline"
              >
                {r.related.name}
              </Link>
            ) : (
              r.related.name
            )}
            <p className="text-xs text-muted-foreground">
              {[SUBJECT_LABEL[r.related.type], r.contactName].filter(Boolean).join(" · ")}
            </p>
          </div>
        ) : (
          <span className="text-sm">
            {r.contactName ?? <span className="text-muted-foreground">—</span>}
          </span>
        ),
    },
    {
      key: "date",
      header: "Data",
      sortKey: "date",
      render: (r) => <span className="tabular-nums">{formatDateTime(r.occurredAt)}</span>,
    },
    {
      key: "followUp",
      header: "Richiamo",
      className: "hidden lg:table-cell",
      render: (r) =>
        r.followUpDate ? (
          r.followUpDone ? (
            <Badge tone="success">Fatto</Badge>
          ) : (
            <Badge tone={r.followUpOverdue ? "danger" : "warning"}>
              {formatDue(r.followUpDate)}
            </Badge>
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "author",
      header: "Registrata da",
      className: "hidden xl:table-cell",
      render: (r) => r.createdByName ?? <span className="text-muted-foreground">—</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Comunicazioni"
        description="Registro di telefonate, email, PEC, incontri e messaggi con clienti, fornitori e personale, con i richiami da fare. Le comunicazioni si registrano, non partono da qui."
        actions={
          <>
            <ExportButton section="communications" params={sp} />
            {options && (
              <CommunicationDialog
                mode="create"
                openFromUrl
                subjects={options.subjects}
                now={romeLocalDateTime()}
              />
            )}
          </>
        }
      />
      {eliminata === "1" && (
        <Notice>Comunicazione eliminata. La sua cronologia resta nel registro attività.</Notice>
      )}
      <Card className="mt-4 overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={params.q}
          placeholder="Cerca per oggetto, testo, referente, cliente"
          filters={[
            {
              name: "channel",
              label: "Canale",
              options: Object.entries(CHANNELS).map(([value, label]) => ({ value, label })),
            },
            {
              name: "direction",
              label: "Direzione",
              options: Object.entries(DIRECTIONS).map(([value, label]) => ({ value, label })),
            },
            {
              name: "followUp",
              label: "Richiami",
              options: [{ value: "pending", label: "Da richiamare" }],
            },
          ]}
          values={{
            channel: params.filters.channel,
            direction: params.filters.direction,
            followUp: params.filters.followUp,
          }}
          dateRange={{ label: "Data", from, to }}
        />
        <DataTable
          caption="Registro comunicazioni"
          columns={columns}
          rows={page.rows}
          total={page.total}
          page={page.page}
          pageSize={page.pageSize}
          sort={params.sort}
          dir={sp.dir === "asc" ? "asc" : "desc"}
          pathname={PATH}
          searchParams={sp}
          empty={
            filtered ? (
              <EmptyState
                icon={MessagesSquare}
                title="Nessuna comunicazione trovata"
                description="Prova a cambiare la ricerca, i filtri o l'intervallo di date."
              />
            ) : (
              <EmptyState
                icon={MessagesSquare}
                title="Registro vuoto"
                description={
                  canWrite
                    ? "Annota telefonate, email e incontri con «Registra comunicazione»: restano collegati alla scheda del cliente o del fornitore."
                    : "Le comunicazioni registrate dall'azienda compariranno qui."
                }
              />
            )
          }
        />
      </Card>
    </div>
  );
}
