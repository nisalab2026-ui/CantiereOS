import {
  listFormCustomerOptions,
  listFormSubmissions,
  listFormTemplates,
  type FormSubmissionRow,
} from "@cantiereos/core";
import { ClipboardCheck, LayoutTemplate } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportButton } from "@/components/export-button";
import { Notice } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { sectionGate } from "@/lib/permissions";
import { FormStatusBadge } from "./form-bits";
import { NewSubmissionDialog } from "./new-submission";

export const metadata: Metadata = { title: "Moduli" };

const PATH = "/app/moduli";
const STATUSES = { draft: "In compilazione", completed: "Chiusi" } as const;

export default async function FormsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { eliminato, ...sp } = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "forms.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("forms.write");
  const canManage =
    access.permissions.has("forms.manage") || access.permissionsRequiringMfa.has("forms.manage");

  const templates = await asCurrentUser((tx) =>
    listFormTemplates(tx, access, { includeArchived: true }),
  );
  const params = parseListParams(sp, {
    sorts: ["updated"] as const,
    defaultSort: "updated",
    filters: { status: Object.keys(STATUSES), template: templates.map((t) => t.id) },
  });
  const { page, customers } = await asCurrentUser(async (tx) => ({
    page: await listFormSubmissions(tx, access, {
      q: params.q,
      page: params.page,
      pageSize: params.pageSize,
      ...(params.filters.status ? { status: params.filters.status } : {}),
      ...(params.filters.template ? { templateId: params.filters.template } : {}),
    }),
    customers: canWrite ? await listFormCustomerOptions(tx, access) : [],
  }));
  const usable = templates.filter((t) => t.currentVersion && !t.isArchived);
  const filtered = Boolean(params.q || params.filters.status || params.filters.template);

  const columns: Column<FormSubmissionRow>[] = [
    {
      key: "title",
      header: "Modulo",
      render: (r) => (
        <div className="min-w-0">
          <Link
            href={`${PATH}/${r.id}`}
            className="font-medium hover:underline"
            data-testid="form-link"
          >
            {r.title}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[r.templateName, r.subjectCode && `Impianto ${r.subjectCode}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 sm:hidden">
            <FormStatusBadge status={r.status} />
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Cliente",
      className: "hidden md:table-cell",
      render: (r) =>
        r.customer ? (
          <div className="text-sm">
            <Link href={`/app/clienti/${r.customer.id}`} className="hover:underline">
              {r.customer.name}
            </Link>
            {r.site && <p className="text-xs text-muted-foreground">{r.site.name}</p>}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "updated",
      header: "Ultima modifica",
      className: "hidden lg:table-cell",
      render: (r) => (
        <div className="text-sm">
          <span className="tabular-nums">{formatDateTime(r.updatedAt)}</span>
          {r.createdByName && <p className="text-xs text-muted-foreground">{r.createdByName}</p>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Stato",
      className: "hidden sm:table-cell",
      render: (r) => <FormStatusBadge status={r.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Moduli"
        description="Verbali, checklist e ispezioni compilati dal telefono o dal PC al posto della carta. Ogni azienda crea i propri modelli; un modulo chiuso non si modifica più."
        actions={
          <>
            <ExportButton section="forms" params={sp} />
            <Link href={`${PATH}/modelli`} className={buttonVariants({ variant: "secondary" })}>
              <LayoutTemplate aria-hidden /> Modelli
            </Link>
            {canWrite && (
              <NewSubmissionDialog
                openFromUrl
                templates={usable.map((t) => ({ id: t.id, name: t.name }))}
                customers={customers}
              />
            )}
          </>
        }
      />
      {eliminato === "1" && (
        <Notice>Modulo eliminato. La sua cronologia resta nel registro attività.</Notice>
      )}
      <Card className="mt-4 overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={params.q}
          placeholder="Cerca per titolo, impianto, cliente"
          filters={[
            {
              name: "status",
              label: "Stato",
              options: Object.entries(STATUSES).map(([value, label]) => ({ value, label })),
            },
            {
              name: "template",
              label: "Modello",
              options: templates.map((t) => ({ value: t.id, label: t.name })),
            },
          ]}
          values={{ status: params.filters.status, template: params.filters.template }}
        />
        <DataTable
          caption="Moduli compilati"
          columns={columns}
          rows={page.rows}
          total={page.total}
          page={page.page}
          pageSize={page.pageSize}
          sort={params.sort}
          dir="desc"
          pathname={PATH}
          searchParams={sp}
          empty={
            filtered ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Nessun modulo trovato"
                description="Prova a cambiare la ricerca o i filtri."
              />
            ) : (
              <EmptyState
                icon={ClipboardCheck}
                title="Ancora nessun modulo"
                description={
                  usable.length
                    ? "Usa «Compila un modulo»: lo puoi compilare dal telefono anche in cantiere, con la firma sul display."
                    : canManage
                      ? "Prima crea un modello in «Modelli»: puoi partire da quelli pronti, come l'ispezione della linea vita."
                      : "Chi gestisce i moduli deve prima pubblicare un modello."
                }
              />
            )
          }
        />
      </Card>
    </div>
  );
}
