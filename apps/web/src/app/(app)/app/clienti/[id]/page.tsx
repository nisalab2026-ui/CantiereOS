import {
  getCustomer,
  getRecordHistory,
  listDeadlines,
  listTasks,
  listDocuments,
  listFolders,
  listSubjectOptions,
} from "@cantiereos/core";
import { Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/history/timeline";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { TabsNav } from "@/components/ui/tabs-nav";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { loadDeadlineOptions } from "@/lib/deadline-options";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { TaskMiniList } from "../../attivita/task-mini-list";
import { TaskDialog } from "../../attivita/task-form";
import { formatDateTime } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { fileStorage } from "@/lib/storage";
import { DocumentMiniList } from "../../documenti/document-mini-list";
import { folderOptions } from "../../documenti/shared";
import { UploadDialog } from "../../documenti/upload-dialog";
import { DeadlineDialog } from "../../scadenze/deadline-form";
import { DeadlineMiniList } from "../../scadenze/deadline-mini-list";
import { CustomerActiveButton, EditCustomerDialog } from "./customer-edit";

export const metadata: Metadata = { title: "Cliente" };

const PARTY_TYPES = { company: "Azienda", individual: "Privato", public_entity: "Ente pubblico" };
const TABS = ["panoramica", "scadenze", "documenti", "storico"] as const;
type Tab = (typeof TABS)[number];

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab)
    : "panoramica";
  const { access } = await getAppContext();
  const gate = sectionGate(access, "customers.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("customers.write");
  const canDeadlines = access.permissions.has("deadlines.read");
  const canDocuments = access.permissions.has("documents.read");
  const canUpload = access.permissions.has("documents.write");
  const canWriteDeadlines = access.permissions.has("deadlines.write");
  const canTasks = access.permissions.has("tasks.read");
  const canWriteTasks = access.permissions.has("tasks.write");

  const data = await asCurrentUser(async (tx) => {
    const c = await getCustomer(tx, access, id);
    if (!c) return null;
    return {
      c,
      openDeadlines: canDeadlines
        ? await listDeadlines(tx, access, { customerId: id, state: "open", pageSize: 100 })
        : null,
      allDeadlines:
        canDeadlines && tab === "scadenze"
          ? await listDeadlines(tx, access, {
              customerId: id,
              state: "all",
              sort: "due",
              dir: "desc",
              pageSize: 100,
            })
          : null,
      docs:
        canDocuments && tab === "documenti"
          ? await listDocuments(tx, access, { customerId: id, pageSize: 100 })
          : null,
      docOptions:
        canUpload && tab === "documenti"
          ? {
              folders: await listFolders(tx, access),
              subjects: await listSubjectOptions(tx, access),
            }
          : null,
      history: tab === "storico" ? await getRecordHistory(tx, access, "customers", id) : null,
      openTasks:
        canTasks && tab === "panoramica"
          ? await listTasks(tx, access, { customerId: id, state: "open", pageSize: 6 })
          : null,
      options: canWriteDeadlines || canWriteTasks ? await loadDeadlineOptions(tx, access) : null,
    };
  });
  if (!data) notFound();
  const { c, openDeadlines, allDeadlines, openTasks, history, options, docs, docOptions } = data;
  const base = `/app/clienti/${id}`;
  const overdue = openDeadlines?.rows.filter((r) => r.state === "overdue").length ?? 0;
  const address = [
    c.addressLine,
    [c.postalCode, c.city, c.province && `(${c.province})`].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      <Breadcrumbs items={[{ label: "Clienti", href: "/app/clienti" }, { label: c.displayName }]} />
      <PageHeader
        title={c.displayName}
        testId="customer-title"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {c.isActive ? <Badge tone="success">Attivo</Badge> : <Badge>Archiviato</Badge>}
            <span>{PARTY_TYPES[c.partyType]}</span>
            {c.code && <span className="font-mono text-xs">{c.code}</span>}
            {overdue > 0 && <Badge tone="danger">{overdue} scadenze in ritardo</Badge>}
          </span>
        }
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {options && canWriteDeadlines && (
              <DeadlineDialog
                mode="create"
                subjects={options.subjects}
                members={options.members}
                defaults={{ subject: `customer:${c.id}` }}
                lockSubject
                triggerLabel="Nuova scadenza"
              />
            )}
            {canWrite && (
              <EditCustomerDialog
                customer={{
                  id: c.id,
                  code: c.code,
                  partyType: c.partyType,
                  displayName: c.displayName,
                  legalName: c.legalName,
                  vatNumber: c.vatNumber,
                  taxCode: c.taxCode,
                  sdiCode: c.sdiCode,
                  pecEmail: c.pecEmail,
                  email: c.email,
                  phone: c.phone,
                  addressLine: c.addressLine,
                  postalCode: c.postalCode,
                  city: c.city,
                  province: c.province,
                  paymentTermsDays: c.paymentTermsDays,
                  notes: c.notes,
                  isActive: c.isActive,
                  version: new Date(c.updatedAt).toISOString(),
                }}
              />
            )}
            {canWrite && (
              <CustomerActiveButton id={c.id} name={c.displayName} active={c.isActive} />
            )}
          </div>
        }
      />
      <TabsNav
        label="Sezioni del cliente"
        active={tab}
        tabs={[
          { key: "panoramica", label: "Panoramica", href: base },
          ...(canDeadlines
            ? [
                {
                  key: "scadenze",
                  label: "Scadenze",
                  href: `${base}?tab=scadenze`,
                  count: openDeadlines?.total ?? 0,
                },
              ]
            : []),
          ...(canDocuments
            ? [{ key: "documenti", label: "Documenti", href: `${base}?tab=documenti` }]
            : []),
          { key: "storico", label: "Storico", href: `${base}?tab=storico` },
        ]}
      />

      {tab === "panoramica" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Dati anagrafici" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Ragione sociale", value: c.legalName },
                  {
                    label: "Partita IVA",
                    value: c.vatNumber && <span className="font-mono">{c.vatNumber}</span>,
                  },
                  {
                    label: "Codice fiscale",
                    value: c.taxCode && <span className="font-mono">{c.taxCode}</span>,
                  },
                  {
                    label: "Codice SDI",
                    value: c.sdiCode && <span className="font-mono">{c.sdiCode}</span>,
                  },
                  { label: "PEC", value: c.pecEmail },
                  {
                    label: "Pagamento",
                    value: c.paymentTermsDays != null ? `${c.paymentTermsDays} giorni` : null,
                  },
                  { label: "Note", value: c.notes, wide: true },
                  { label: "Creato il", value: formatDateTime(c.createdAt) },
                  { label: "Ultima modifica", value: formatDateTime(c.updatedAt) },
                ]}
              />
            </CardBody>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Contatti" />
              <CardBody className="space-y-2 text-sm">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-2 hover:underline">
                    <Mail className="size-4 text-muted-foreground" aria-hidden /> {c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-2 hover:underline">
                    <Phone className="size-4 text-muted-foreground" aria-hidden /> {c.phone}
                  </a>
                )}
                {address && (
                  <p className="flex items-center gap-2">
                    <MapPin className="size-4 text-muted-foreground" aria-hidden /> {address}
                  </p>
                )}
                {!c.email && !c.phone && !address && (
                  <p className="text-muted-foreground">Nessun contatto inserito.</p>
                )}
                {c.contacts.length > 0 && (
                  <ul className="mt-3 divide-y divide-border border-t border-border">
                    {c.contacts.map((p) => (
                      <li key={p.id} className="py-2">
                        <p className="font-medium">{p.name ?? "Referente"}</p>
                        <p className="text-xs text-muted-foreground">
                          {[p.role, p.email, p.phone].filter(Boolean).join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={`Sedi (${c.sites.length})`} />
              <CardBody className="text-sm">
                {c.sites.length === 0 ? (
                  <p className="text-muted-foreground">Nessuna sede registrata.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {c.sites.map((s) => (
                      <li key={s.id} className="py-2">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.address}, {s.city}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
            {openTasks && (
              <Card>
                <CardHeader
                  title="Attività aperte"
                  actions={
                    canWriteTasks && options ? (
                      <TaskDialog
                        mode="create"
                        subjects={options.subjects}
                        members={options.members}
                        defaults={{ subject: `customer:${c.id}` }}
                        lockSubject
                        triggerLabel="Nuova attività"
                      />
                    ) : undefined
                  }
                />
                <CardBody>
                  <TaskMiniList
                    rows={openTasks.rows}
                    emptyText="Nessuna attività aperta per questo cliente."
                  />
                </CardBody>
              </Card>
            )}
            {openDeadlines && (
              <Card>
                <CardHeader title="Prossime scadenze" />
                <CardBody>
                  <DeadlineMiniList
                    rows={openDeadlines.rows.slice(0, 5)}
                    emptyText="Nessuna scadenza aperta per questo cliente."
                  />
                </CardBody>
              </Card>
            )}
            <CommentsPanel table="customers" id={c.id} />
          </div>
        </div>
      )}

      {tab === "scadenze" && allDeadlines && (
        <Card>
          <CardHeader
            title="Tutte le scadenze"
            description="Aperte, completate e annullate, dalla più recente."
          />
          <CardBody>
            <DeadlineMiniList
              rows={allDeadlines.rows}
              emptyText="Nessuna scadenza registrata per questo cliente."
            />
          </CardBody>
        </Card>
      )}

      {tab === "documenti" && docs && (
        <Card>
          <CardHeader
            title="Documenti collegati"
            description="Contratti, certificati, verbali e foto collegati a questa scheda."
            actions={
              docOptions ? (
                <UploadDialog
                  folders={folderOptions(docOptions.folders)}
                  subjects={docOptions.subjects}
                  defaults={{ subject: `customer:${c.id}` }}
                  lockSubject
                  lockedSubjectName={c.displayName}
                  canConfidential={access.permissions.has("documents.confidential")}
                  canDeadline={access.permissions.has("deadlines.write")}
                  storageReady={fileStorage() !== null}
                  triggerLabel="Carica documento"
                />
              ) : undefined
            }
          />
          <CardBody>
            <DocumentMiniList rows={docs.rows} emptyText="Nessun documento collegato." />
          </CardBody>
        </Card>
      )}

      {tab === "storico" && history && (
        <Card>
          <CardHeader
            title="Storico del cliente"
            description="Modifiche ai dati e alle scadenze collegate, con autore e valori prima e dopo."
          />
          <CardBody>
            <Timeline events={history} showRecord={(e) => e.table !== "customers"} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
