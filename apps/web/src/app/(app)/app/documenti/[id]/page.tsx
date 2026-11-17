import {
  folderPath,
  getDocument,
  getRecordHistory,
  listFolders,
  listSubjectOptions,
} from "@cantiereos/core";
import { Download, Eye, FileText, Lock, ScanText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { Timeline } from "@/components/history/timeline";
import { Notice } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { TabsNav } from "@/components/ui/tabs-nav";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { fileStorage } from "@/lib/storage";
import { SUBJECT_HREF, SUBJECT_LABEL } from "../../scadenze/deadline-bits";
import { ExpiryBadge } from "../document-bits";
import { DeleteDocumentButton, EditDocumentDialog } from "../document-edit";
import { CATEGORY_LABELS, folderOptions, formatBytes } from "../shared";
import { VersionUploadDialog } from "../upload-dialog";

export const metadata: Metadata = { title: "Documento" };

const TABS = ["panoramica", "storico"] as const;
type Tab = (typeof TABS)[number];
const PREVIEWABLE = /^(application\/pdf|image\/(jpeg|png|webp|gif))$/;

export default async function DocumentPage({
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
  const gate = sectionGate(access, "documents.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("documents.write");
  const canDelete = access.permissions.has("documents.delete");

  const data = await asCurrentUser(async (tx) => {
    const d = await getDocument(tx, access, id);
    if (!d) return null;
    return {
      d,
      folders: await listFolders(tx, access),
      subjects: canWrite ? await listSubjectOptions(tx, access) : null,
      history: tab === "storico" ? await getRecordHistory(tx, access, "documents", id) : null,
    };
  });
  if (!data) notFound();
  const { d, folders, subjects, history } = data;
  const base = `/app/documenti/${id}`;
  const path = folderPath(folders, d.folderId);
  const storageReady = fileStorage() !== null;
  const fileHref = (versionId: string, preview = false) =>
    `/app/documenti/file/${versionId}${preview ? "?anteprima=1" : ""}`;
  const canPreview = d.currentVersionId && d.mimeType && PREVIEWABLE.test(d.mimeType);

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Documenti", href: "/app/documenti" },
          ...path.map((f) => ({ label: f.name, href: `/app/documenti?folder=${f.id}` })),
          { label: d.title },
        ]}
      />
      <PageHeader
        title={d.title}
        testId="document-title"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge>{CATEGORY_LABELS[d.category]}</Badge>
            {d.isConfidential && (
              <Badge tone="warning">
                <Lock className="mr-1 inline size-3" aria-hidden />
                Riservato
              </Badge>
            )}
            {d.expiresOn && <ExpiryBadge row={d} />}
            {d.fileName && (
              <span>
                {d.fileName} · {formatBytes(d.sizeBytes)}
              </span>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {d.currentVersionId && (
              <a
                href={fileHref(d.currentVersionId)}
                className={buttonVariants({ variant: "primary" })}
                data-testid="download-current"
              >
                <Download aria-hidden /> Scarica
              </a>
            )}
            {canWrite && <VersionUploadDialog documentId={d.id} storageReady={storageReady} />}
            {canWrite && subjects && (
              <EditDocumentDialog
                doc={{
                  id: d.id,
                  version: new Date(d.updatedAt).toISOString(),
                  title: d.title,
                  category: d.category,
                  description: d.description,
                  folderId: d.folderId,
                  subject: d.subject ? `${d.subject.type}:${d.subject.id}` : "",
                  isConfidential: d.isConfidential,
                  expiresOn: d.expiresOn,
                }}
                folders={folderOptions(folders)}
                subjects={withCurrent(subjects, d.subject)}
                canConfidential={access.permissions.has("documents.confidential")}
              />
            )}
            {canDelete && <DeleteDocumentButton id={d.id} title={d.title} />}
          </div>
        }
      />
      {sp.caricato === "1" && (
        <Notice>
          Documento caricato e verificato. Il file è conservato in un archivio privato.
        </Notice>
      )}
      {!d.currentVersionId && (
        <Notice tone="warning">
          Il caricamento del file non è stato completato. Usa «Nuova versione» per caricarlo di
          nuovo.
        </Notice>
      )}
      <TabsNav
        label="Sezioni del documento"
        active={tab}
        tabs={[
          { key: "panoramica", label: "Panoramica", href: base },
          { key: "storico", label: "Storico", href: `${base}?tab=storico` },
        ]}
      />

      {tab === "panoramica" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader title="Anteprima" />
            <CardBody>
              {canPreview && d.currentVersionId ? (
                d.mimeType === "application/pdf" ? (
                  <iframe
                    src={fileHref(d.currentVersionId, true)}
                    title={`Anteprima di ${d.fileName ?? d.title}`}
                    className="h-[70vh] w-full rounded-md border border-border bg-white"
                    data-testid="document-preview"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmato di breve durata, niente ottimizzazione
                  <img
                    src={fileHref(d.currentVersionId, true)}
                    alt={`Anteprima di ${d.fileName ?? d.title}`}
                    className="max-h-[70vh] w-full rounded-md border border-border object-contain"
                    data-testid="document-preview"
                  />
                )
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                  <FileText className="size-8" aria-hidden />
                  <p>Anteprima non disponibile per questo tipo di file.</p>
                  {d.currentVersionId && (
                    <a href={fileHref(d.currentVersionId)} className="text-primary hover:underline">
                      Scarica il file
                    </a>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Dati del documento" />
              <CardBody>
                <DetailList
                  items={[
                    { label: "Categoria", value: CATEGORY_LABELS[d.category] },
                    {
                      label: "Cartella",
                      value: path.length ? path.map((f) => f.name).join(" / ") : null,
                    },
                    {
                      label: "Collegato a",
                      value: d.subject ? (
                        SUBJECT_HREF[d.subject.type] ? (
                          <Link
                            href={`${SUBJECT_HREF[d.subject.type]}/${d.subject.id}`}
                            className="hover:underline"
                          >
                            {SUBJECT_LABEL[d.subject.type]}: {d.subject.name}
                          </Link>
                        ) : (
                          `${SUBJECT_LABEL[d.subject.type]}: ${d.subject.name}`
                        )
                      ) : null,
                    },
                    { label: "Scadenza", value: d.expiresOn ? formatDate(d.expiresOn) : null },
                    {
                      label: "Promemoria",
                      value: d.deadlineId ? (
                        <Link href={`/app/scadenze/${d.deadlineId}`} className="hover:underline">
                          Nello scadenziario
                          {d.deadlineDue ? ` (${formatDate(d.deadlineDue)})` : ""}
                        </Link>
                      ) : null,
                    },
                    { label: "Descrizione", value: d.description, wide: true },
                    { label: "Caricato da", value: d.createdByName },
                    { label: "Creato il", value: formatDateTime(d.createdAt) },
                    { label: "Ultima modifica", value: formatDateTime(d.updatedAt) },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title={`Versioni (${d.versionList.filter((v) => v.status === "ready").length})`}
                description="Ogni file caricato resta consultabile; l'ultima verificata è quella corrente."
              />
              <CardBody>
                <ol className="divide-y divide-border text-sm" data-testid="version-list">
                  {d.versionList.map((v) => (
                    <li key={v.id} className="flex items-start gap-3 py-2">
                      <span className="mt-0.5 w-8 shrink-0 font-mono text-xs text-muted-foreground">
                        v{v.versionNo}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {v.originalName}
                          {v.id === d.currentVersionId && (
                            <Badge tone="success" className="ml-2">
                              Corrente
                            </Badge>
                          )}
                          {v.status === "rejected" && (
                            <Badge tone="danger" className="ml-2">
                              Rifiutato
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(v.createdAt)} · {v.createdByName ?? "—"}
                          {v.sizeBytes ? ` · ${formatBytes(v.sizeBytes)}` : ""}
                        </p>
                        {v.notes && <p className="text-xs">{v.notes}</p>}
                        {v.rejectReason && <p className="text-xs text-danger">{v.rejectReason}</p>}
                      </div>
                      {v.status === "ready" && (
                        <div className="flex shrink-0 gap-1">
                          {v.mimeType && PREVIEWABLE.test(v.mimeType) && (
                            <a
                              href={fileHref(v.id, true)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={buttonVariants({ variant: "ghost", size: "icon" })}
                              aria-label={`Apri v${v.versionNo}`}
                              title="Apri in una nuova scheda"
                            >
                              <Eye aria-hidden />
                            </a>
                          )}
                          <a
                            href={fileHref(v.id)}
                            className={buttonVariants({ variant: "ghost", size: "icon" })}
                            aria-label={`Scarica v${v.versionNo}`}
                            title="Scarica"
                          >
                            <Download aria-hidden />
                          </a>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Lettura automatica (OCR)"
                description="Estrazione di testo e dati dai documenti scansionati."
              />
              <CardBody className="flex items-start gap-3 text-sm">
                <ScanText className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
                <p className="text-muted-foreground">
                  Non configurata. Quando verrà collegato un servizio OCR, i dati letti saranno
                  proposti qui e andranno confermati prima di essere salvati.
                </p>
              </CardBody>
            </Card>
            <CommentsPanel table="documents" id={d.id} />
          </div>
        </div>
      )}

      {tab === "storico" && history && (
        <Card>
          <CardHeader
            title="Storico del documento"
            description="Modifiche, versioni caricate o rifiutate, download e anteprime, con autore e ora."
          />
          <CardBody>
            <Timeline events={history} showRecord={(e) => e.table !== "documents"} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/** Il soggetto collegato resta selezionabile anche se oggi è archiviato. */
function withCurrent(
  subjects: Awaited<ReturnType<typeof listSubjectOptions>>,
  current: { type: keyof typeof subjects; id: string; name: string } | null,
) {
  if (!current) return subjects;
  const list = subjects[current.type] ?? [];
  if (list.some((o) => o.id === current.id)) return subjects;
  return { ...subjects, [current.type]: [...list, { id: current.id, name: current.name }] };
}
