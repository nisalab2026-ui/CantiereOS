import {
  getEmployee,
  getRecordHistory,
  listDeadlines,
  listTasks,
  listCommunications,
  listDocuments,
  listFolders,
  listSubjectOptions,
} from "@cantiereos/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/history/timeline";
import { Notice } from "@/components/ui";
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
import { CommunicationDialog } from "../../comunicazioni/communication-form";
import { CommunicationMiniList } from "../../comunicazioni/communication-mini-list";
import { formatDate, formatDateTime, romeLocalDateTime } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { fileStorage } from "@/lib/storage";
import { DocumentMiniList } from "../../documenti/document-mini-list";
import { folderOptions } from "../../documenti/shared";
import { UploadDialog } from "../../documenti/upload-dialog";
import { DeadlineDialog } from "../../scadenze/deadline-form";
import { DeadlineMiniList } from "../../scadenze/deadline-mini-list";
import { EmployeeActiveButton, EmployeeDialog } from "../employee-form";

export const metadata: Metadata = { title: "Persona" };

const EMPLOYMENT = {
  employee: "Dipendente",
  contractor: "Collaboratore",
  temporary: "Temporaneo",
  intern: "Tirocinante",
};
const TABS = ["panoramica", "scadenze", "documenti", "storico"] as const;
type Tab = (typeof TABS)[number];

export default async function EmployeePage({
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
  const gate = sectionGate(access, "employees.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("employees.write");
  const canDeadlines = access.permissions.has("deadlines.read");
  const canDocuments = access.permissions.has("documents.read");
  const canUpload = access.permissions.has("documents.write");
  const canWriteDeadlines = access.permissions.has("deadlines.write");
  const canTasks = access.permissions.has("tasks.read");
  const canWriteTasks = access.permissions.has("tasks.write");
  const canComms = access.permissions.has("communications.read");
  const canWriteComms = access.permissions.has("communications.write");

  const data = await asCurrentUser(async (tx) => {
    const e = await getEmployee(tx, access, id);
    if (!e) return null;
    return {
      e,
      open: canDeadlines
        ? await listDeadlines(tx, access, { employeeId: id, state: "open", pageSize: 100 })
        : null,
      all:
        canDeadlines && tab === "scadenze"
          ? await listDeadlines(tx, access, {
              employeeId: id,
              state: "all",
              sort: "due",
              dir: "desc",
              pageSize: 100,
            })
          : null,
      docs:
        canDocuments && tab === "documenti"
          ? await listDocuments(tx, access, { employeeId: id, pageSize: 100 })
          : null,
      docOptions:
        canUpload && tab === "documenti"
          ? {
              folders: await listFolders(tx, access),
              subjects: await listSubjectOptions(tx, access),
            }
          : null,
      history: tab === "storico" ? await getRecordHistory(tx, access, "employees", id) : null,
      openTasks:
        canTasks && tab === "panoramica"
          ? await listTasks(tx, access, { employeeId: id, state: "open", pageSize: 6 })
          : null,
      comms:
        canComms && tab === "panoramica"
          ? await listCommunications(tx, access, { employeeId: id, pageSize: 5 })
          : null,
      options:
        canWriteDeadlines || canWriteTasks || canWriteComms
          ? await loadDeadlineOptions(tx, access)
          : null,
    };
  });
  if (!data) notFound();
  const { e, open, all, openTasks, comms, history, options, docs, docOptions } = data;
  const name = `${e.firstName} ${e.lastName}`;
  const base = `/app/personale/${id}`;
  const overdue = open?.rows.filter((r) => r.state === "overdue").length ?? 0;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Personale", href: "/app/personale" }, { label: name }]} />
      <PageHeader
        title={name}
        testId="employee-title"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {e.isActive ? <Badge tone="success">Attivo</Badge> : <Badge>Archiviato</Badge>}
            <span>{e.jobTitle ?? EMPLOYMENT[e.employmentType]}</span>
            {e.code && <span className="font-mono text-xs">{e.code}</span>}
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
                defaults={{ subject: `employee:${e.id}`, kind: "certification" }}
                lockSubject
                triggerLabel="Nuova scadenza"
              />
            )}
            {canWrite && (
              <EmployeeDialog
                mode="edit"
                defaults={{
                  id: e.id,
                  version: new Date(e.updatedAt).toISOString(),
                  firstName: e.firstName,
                  lastName: e.lastName,
                  code: e.code,
                  email: e.email,
                  phone: e.phone,
                  jobTitle: e.jobTitle,
                  employmentType: e.employmentType,
                  hireDate: e.hireDate,
                  terminationDate: e.terminationDate,
                  notes: e.notes,
                }}
              />
            )}
            {canWrite && <EmployeeActiveButton id={e.id} name={name} active={e.isActive} />}
          </div>
        }
      />
      {sp.creato === "1" && (
        <Notice>Persona aggiunta. Ora puoi registrare le sue certificazioni e scadenze.</Notice>
      )}
      <TabsNav
        label="Sezioni della persona"
        active={tab}
        tabs={[
          { key: "panoramica", label: "Panoramica", href: base },
          ...(canDeadlines
            ? [
                {
                  key: "scadenze",
                  label: "Scadenze e certificazioni",
                  href: `${base}?tab=scadenze`,
                  count: open?.total ?? 0,
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
            <CardHeader title="Dati della persona" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Tipo di rapporto", value: EMPLOYMENT[e.employmentType] },
                  { label: "Mansione", value: e.jobTitle },
                  {
                    label: "Email",
                    value: e.email && (
                      <a href={`mailto:${e.email}`} className="hover:underline">
                        {e.email}
                      </a>
                    ),
                  },
                  {
                    label: "Telefono",
                    value: e.phone && (
                      <a href={`tel:${e.phone}`} className="hover:underline">
                        {e.phone}
                      </a>
                    ),
                  },
                  { label: "Assunzione", value: e.hireDate ? formatDate(e.hireDate) : null },
                  {
                    label: "Cessazione",
                    value: e.terminationDate ? formatDate(e.terminationDate) : null,
                  },
                  {
                    label: "Account CantiereOS",
                    value: e.hasAccount ? "Collegato" : "Nessun account",
                  },
                  {
                    label: "Squadre",
                    value: e.teams.length ? e.teams.map((t) => t.name).join(", ") : null,
                  },
                  { label: "Note", value: e.notes, wide: true },
                  { label: "Ultima modifica", value: formatDateTime(e.updatedAt) },
                ]}
              />
            </CardBody>
          </Card>
          <div className="space-y-4">
            {open && (
              <Card>
                <CardHeader
                  title="Prossime scadenze"
                  description="Certificazioni, corsi, visite mediche."
                />
                <CardBody>
                  <DeadlineMiniList
                    rows={open.rows.slice(0, 6)}
                    emptyText="Nessuna scadenza aperta per questa persona."
                  />
                </CardBody>
              </Card>
            )}
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
                        defaults={{ subject: `employee:${e.id}` }}
                        lockSubject
                        triggerLabel="Nuova attività"
                      />
                    ) : undefined
                  }
                />
                <CardBody>
                  <TaskMiniList
                    rows={openTasks.rows}
                    emptyText="Nessuna attività aperta collegata a questa persona."
                  />
                </CardBody>
              </Card>
            )}
            {comms && (
              <Card>
                <CardHeader
                  title="Comunicazioni recenti"
                  actions={
                    canWriteComms && options ? (
                      <CommunicationDialog
                        mode="create"
                        subjects={options.subjects}
                        now={romeLocalDateTime()}
                        defaults={{ related: `employee:${e.id}` }}
                        lockRelated
                        lockedName={name}
                        triggerLabel="Registra"
                      />
                    ) : undefined
                  }
                />
                <CardBody>
                  <CommunicationMiniList
                    rows={comms.rows}
                    emptyText="Nessuna comunicazione registrata con questa persona."
                  />
                </CardBody>
              </Card>
            )}
            <CommentsPanel table="employees" id={e.id} />
          </div>
        </div>
      )}

      {tab === "scadenze" && all && (
        <Card>
          <CardHeader
            title="Scadenze e certificazioni"
            description="Aperte, completate e annullate, dalla più recente."
          />
          <CardBody>
            <DeadlineMiniList
              rows={all.rows}
              emptyText="Nessuna scadenza registrata per questa persona."
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
                  defaults={{ subject: `employee:${e.id}` }}
                  lockSubject
                  lockedSubjectName={name}
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
          <CardHeader title="Storico" description="Modifiche ai dati e alle scadenze collegate." />
          <CardBody>
            <Timeline events={history} showRecord={(ev) => ev.table !== "employees"} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
