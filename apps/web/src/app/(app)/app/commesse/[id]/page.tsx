import {
  getProject,
  getRecordHistory,
  listFormCustomerOptions,
  listFormSubmissions,
  listFormTemplates,
  loadProjectFormOptions,
  PROJECT_KIND_LABELS,
} from "@cantiereos/core";
import { ClipboardCheck, FileText, ListTodo, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/history/timeline";
import { Notice } from "@/components/ui";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { centsToInput, Money } from "../../pagamenti/payment-bits";
import { formatDue } from "../../scadenze/deadline-bits";
import {
  DeleteProjectButton,
  FinancialsDialog,
  ProjectStatusMenu,
  RemoveSiteButton,
  SiteDialog,
} from "../project-actions";
import { ProjectStatusBadge, SiteStatusBadge } from "../project-bits";
import { ProjectDialog } from "../project-form";
import { FormMiniList } from "../../moduli/form-mini-list";
import { NewSubmissionDialog } from "../../moduli/new-submission";

export const metadata: Metadata = { title: "Commessa" };

const period = (from: string | null, to: string | null) =>
  from || to ? `${from ? formatDue(from) : "…"} – ${to ? formatDue(to) : "…"}` : null;

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "projects.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("projects.write");
  const canFinance = access.permissions.has("projects.finance");
  const canDelete = access.permissions.has("projects.delete");
  const canReadForms = access.permissions.has("forms.read");
  const canWriteForms = access.permissions.has("forms.write");

  const data = await asCurrentUser(async (tx) => {
    const p = await getProject(tx, access, id);
    if (!p) return null;
    return {
      p,
      history: await getRecordHistory(tx, access, "projects", id),
      options: canWrite ? await loadProjectFormOptions(tx, access) : null,
      forms: canReadForms
        ? await listFormSubmissions(tx, access, { projectId: id, pageSize: 10 })
        : null,
      formOptions: canWriteForms
        ? {
            templates: (await listFormTemplates(tx, access, { onlyPublished: true })).map((t) => ({
              id: t.id,
              name: t.name,
            })),
            customers: await listFormCustomerOptions(tx, access),
          }
        : null,
    };
  });
  if (!data) notFound();
  const { p, history, options, forms, formOptions } = data;
  const customerSites = options?.customers.find((c) => c.id === p.customer.id)?.sites ?? [];
  const f = p.financials;
  const margin =
    f && f.contractCents !== null && f.budgetCostCents !== null
      ? f.contractCents - f.budgetCostCents
      : null;
  const s = p.summary;
  const counters = [
    { label: "Attività aperte", value: s.tasksOpen, icon: ListTodo, perm: "tasks.read" },
    { label: "Attività completate", value: s.tasksDone, icon: ListTodo, perm: "tasks.read" },
    { label: "Moduli in bozza", value: s.formsDraft, icon: ClipboardCheck, perm: "forms.read" },
    { label: "Moduli chiusi", value: s.formsCompleted, icon: ClipboardCheck, perm: "forms.read" },
    { label: "Documenti", value: s.documents, icon: FileText, perm: "documents.read" },
  ].filter((c) => access.permissions.has(c.perm));

  return (
    <div>
      <Breadcrumbs
        items={[{ label: "Commesse", href: "/app/commesse" }, { label: `${p.code} ${p.name}` }]}
      />
      <PageHeader
        title={p.name}
        testId="project-title"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs" data-testid="project-code">
              {p.code}
            </span>
            <ProjectStatusBadge status={p.status} />
            <span aria-hidden>·</span>
            <Link href={`/app/clienti/${p.customer.id}`} className="hover:underline">
              {p.customer.name}
            </Link>
            <span aria-hidden>·</span>
            <span>{PROJECT_KIND_LABELS[p.kind]}</span>
          </span>
        }
        actions={
          canWrite || canDelete ? (
            <div key={`${p.id}-${p.status}`} className="flex flex-wrap justify-end gap-2">
              {canWrite && <ProjectStatusMenu id={p.id} status={p.status} />}
              {options && (
                <ProjectDialog
                  mode="edit"
                  options={options}
                  defaults={{
                    id: p.id,
                    version: new Date(p.updatedAt).toISOString(),
                    code: p.code,
                    name: p.name,
                    customerId: p.customer.id,
                    kind: p.kind,
                    status: p.status,
                    startDate: p.startDate,
                    endDate: p.endDate,
                    managerEmployeeId: p.managerEmployeeId,
                    description: p.description,
                  }}
                />
              )}
              {canDelete && <DeleteProjectButton id={p.id} title={`${p.code} ${p.name}`} />}
            </div>
          ) : undefined
        }
      />
      {sp.creata === "1" && <Notice>Commessa creata con il codice {p.code}.</Notice>}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Riepilogo"
              description="Calcolato da ciò che è collegato alla commessa e che puoi vedere."
            />
            <CardBody className="space-y-4">
              {f !== undefined && (
                <div className="grid gap-3 sm:grid-cols-3" data-testid="project-money">
                  <MoneyTile label="Contratto" cents={f?.contractCents ?? null} />
                  <MoneyTile label="Costo previsto" cents={f?.budgetCostCents ?? null} />
                  <MoneyTile
                    label="Margine previsto"
                    cents={margin}
                    hint={
                      margin !== null && f?.contractCents
                        ? `${((margin / f.contractCents) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}% del contratto`
                        : undefined
                    }
                    tone={margin !== null && margin < 0 ? "danger" : undefined}
                  />
                </div>
              )}
              {counters.length > 0 && (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="project-summary">
                  {counters.map((c) => (
                    <li
                      key={c.label}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <c.icon className="size-4 text-muted-foreground" aria-hidden />
                      <span className="font-mono text-lg font-semibold tabular-nums">
                        {c.value}
                      </span>
                      <span className="text-xs text-muted-foreground">{c.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              {canFinance && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {f?.notes ?? "Importi visibili solo a titolare, amministratori e ufficio."}
                  </p>
                  <FinancialsDialog
                    projectId={p.id}
                    defaults={{
                      contract: f?.contractCents != null ? centsToInput(f.contractCents) : "",
                      budgetCost: f?.budgetCostCents != null ? centsToInput(f.budgetCostCents) : "",
                      notes: f?.notes ?? "",
                    }}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`Cantieri (${p.sites.length})`}
              {...(canWrite
                ? {
                    actions: <SiteDialog projectId={p.id} customerSites={customerSites} />,
                  }
                : {})}
            />
            <CardBody>
              {p.sites.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessun cantiere.
                  {canWrite && " Aggiungi il luogo dove si lavora con «Aggiungi cantiere»."}
                </p>
              ) : (
                <ul className="divide-y divide-border" data-testid="site-list">
                  {p.sites.map((site) => (
                    <li key={site.id} className="py-3 first:pt-0 last:pb-0" data-testid="site-row">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-medium">
                            {site.name} <SiteStatusBadge status={site.status} />
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="size-3.5 shrink-0" aria-hidden />
                            {site.address || "Indirizzo non indicato"}
                          </p>
                          {period(site.startDate, site.endDate) && (
                            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                              {period(site.startDate, site.endDate)}
                            </p>
                          )}
                          {site.accessNotes && (
                            <p className="mt-1 text-xs">
                              <span className="text-muted-foreground">Accesso: </span>
                              {site.accessNotes}
                            </p>
                          )}
                          {site.safetyNotes && (
                            <p className="mt-0.5 text-xs">
                              <span className="text-muted-foreground">Sicurezza: </span>
                              {site.safetyNotes}
                            </p>
                          )}
                        </div>
                        {canWrite && (
                          <div className="flex gap-1">
                            <SiteDialog
                              projectId={p.id}
                              customerSites={customerSites}
                              site={{
                                id: site.id,
                                name: site.name,
                                siteName: site.name,
                                customerSiteId: site.customerSiteId,
                                addressLine: site.addressLine,
                                postalCode: site.postalCode,
                                city: site.city,
                                province: site.province,
                                siteStatus: site.status,
                                siteStartDate: site.startDate,
                                siteEndDate: site.endDate,
                                accessNotes: site.accessNotes,
                                safetyNotes: site.safetyNotes,
                              }}
                            />
                            <RemoveSiteButton projectId={p.id} siteId={site.id} name={site.name} />
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {forms && (
            <Card>
              <CardHeader
                title="Moduli e rapportini"
                {...(forms.total > forms.rows.length
                  ? { description: `Gli ultimi ${forms.rows.length} di ${forms.total}.` }
                  : {})}
                actions={
                  formOptions &&
                  formOptions.templates.length > 0 &&
                  p.status !== "completed" &&
                  p.status !== "cancelled" ? (
                    <NewSubmissionDialog
                      templates={formOptions.templates}
                      customers={formOptions.customers}
                      defaults={{ customerId: p.customer.id, projectId: p.id }}
                      triggerLabel="Compila"
                      variant="secondary"
                    />
                  ) : undefined
                }
              />
              <CardBody>
                <FormMiniList
                  rows={forms.rows}
                  emptyText="Nessun modulo collegato. Rapportini, verbali e checklist compilati per questa commessa compariranno qui."
                />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Dettagli" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Cliente",
                    value: (
                      <Link
                        href={`/app/clienti/${p.customer.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.customer.name}
                      </Link>
                    ),
                  },
                  { label: "Tipo", value: PROJECT_KIND_LABELS[p.kind] },
                  { label: "Periodo", value: period(p.startDate, p.endDate) },
                  { label: "Responsabile", value: p.managerName },
                  {
                    label: "Aperta",
                    value: `${formatDateTime(p.createdAt)}${p.createdByName ? ` da ${p.createdByName}` : ""}`,
                  },
                  {
                    label: "Chiusa",
                    value: p.closedAt ? formatDateTime(p.closedAt) : null,
                  },
                  { label: "Descrizione", value: p.description, wide: true },
                ]}
              />
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader
            title="Cronologia"
            description="Modifiche alla commessa, ai cantieri e agli importi, con autore e valori."
          />
          <CardBody>
            <Timeline events={history} showRecord={(e) => e.table !== "projects"} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function MoneyTile({
  label,
  cents,
  hint,
  tone,
}: {
  label: string;
  cents: number | null;
  hint?: string | undefined;
  tone?: "danger" | undefined;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {cents !== null ? (
        <Money
          cents={cents}
          className={`text-lg font-semibold ${tone === "danger" ? "text-danger" : ""}`}
        />
      ) : (
        <p className="text-lg text-muted-foreground" title="Non indicato">
          —
        </p>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
