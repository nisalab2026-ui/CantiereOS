import {
  DOCUMENT_SORTS,
  folderPath,
  listDocuments,
  listFolders,
  listSubjectOptions,
  type DocumentRow,
  type FolderRow,
} from "@cantiereos/core";
import { FileText, Folder, FolderOpen, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportButton } from "@/components/export-button";
import { Notice } from "@/components/ui";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { sectionGate } from "@/lib/permissions";
import { fileStorage } from "@/lib/storage";
import { SUBJECT_HREF } from "../scadenze/deadline-bits";
import { DeleteFolderButton, FolderDialog } from "./folder-controls";
import { CATEGORY_LABELS, folderOptions, formatBytes } from "./shared";
import { ExpiryBadge } from "./document-bits";
import { UploadDialog } from "./upload-dialog";

export const metadata: Metadata = { title: "Documenti" };

const PATH = "/app/documenti";
const EXPIRY = { expired: "Scaduti", expiring: "In scadenza (30 giorni)", none: "Senza scadenza" };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { eliminato, cartella_eliminata, ...sp } = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "documents.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("documents.write");
  const canDelete = access.permissions.has("documents.delete");

  const params = parseListParams(sp, {
    sorts: DOCUMENT_SORTS,
    defaultSort: "updated",
    filters: { category: Object.keys(CATEGORY_LABELS), expiry: Object.keys(EXPIRY) },
  });
  const folderParam = typeof sp.folder === "string" ? sp.folder : undefined;
  const { page, folders, subjects } = await asCurrentUser(async (tx) => ({
    page: await listDocuments(tx, access, {
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      page: params.page,
      pageSize: params.pageSize,
      ...(folderParam ? { folder: folderParam } : {}),
      ...(params.filters.category ? { category: params.filters.category } : {}),
      ...(params.filters.expiry ? { expiry: params.filters.expiry } : {}),
    }),
    folders: await listFolders(tx, access),
    subjects: canWrite ? await listSubjectOptions(tx, access) : null,
  }));
  const current = folders.find((f) => f.id === folderParam) ?? null;
  const path = folderPath(folders, current?.id);
  const filtered = Boolean(params.q || params.filters.category || params.filters.expiry);
  const storageReady = fileStorage() !== null;

  const columns: Column<DocumentRow>[] = [
    {
      key: "title",
      header: "Documento",
      sortKey: "title",
      render: (r) => (
        <div className="flex min-w-0 items-start gap-2.5">
          <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <Link
              href={`${PATH}/${r.id}`}
              className="font-medium hover:underline"
              data-testid="document-link"
            >
              {r.title}
            </Link>
            {r.isConfidential && (
              <Lock className="ml-1.5 inline size-3.5 text-warning" aria-label="Riservato" />
            )}
            <p className="truncate text-xs text-muted-foreground">
              {r.fileName
                ? `${r.fileName} · ${formatBytes(r.sizeBytes)}${r.versions > 1 ? ` · ${r.versions} versioni` : ""}`
                : "Caricamento non completato"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Categoria",
      sortKey: "category",
      className: "hidden md:table-cell",
      render: (r) => <span className="text-sm">{CATEGORY_LABELS[r.category]}</span>,
    },
    {
      key: "subject",
      header: "Collegato a",
      className: "hidden lg:table-cell",
      render: (r) =>
        r.subject ? (
          SUBJECT_HREF[r.subject.type] ? (
            <Link
              href={`${SUBJECT_HREF[r.subject.type]}/${r.subject.id}`}
              className="text-sm hover:underline"
            >
              {r.subject.name}
            </Link>
          ) : (
            <span className="text-sm">{r.subject.name}</span>
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "expires",
      header: "Scadenza",
      sortKey: "expires",
      render: (r) => <ExpiryBadge row={r} />,
    },
    {
      key: "updated",
      header: "Aggiornato",
      sortKey: "updated",
      className: "hidden sm:table-cell",
      render: (r) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDateTime(r.updatedAt)}
        </span>
      ),
    },
  ];

  return (
    <div>
      {path.length > 0 && (
        <Breadcrumbs
          items={[
            { label: "Documenti", href: PATH },
            ...path.map((f) => ({ label: f.name, href: `${PATH}?folder=${f.id}` })),
          ]}
        />
      )}
      <PageHeader
        title={current ? current.name : "Documenti"}
        description={
          current
            ? `${current.documents} documenti in questa cartella.`
            : "Archivio dell'azienda: contratti, certificati, verbali, foto. File privati, versioni e scadenze."
        }
        actions={
          <>
            <ExportButton section="documents" params={sp} />
            {canWrite && (
              <FolderDialog mode="create" parentId={current?.id} parentName={current?.name} />
            )}
            {canWrite && subjects && (
              <UploadDialog
                openFromUrl
                folders={folderOptions(folders)}
                subjects={subjects}
                defaults={current ? { folderId: current.id } : {}}
                canConfidential={access.permissions.has("documents.confidential")}
                canDeadline={access.permissions.has("deadlines.write")}
                storageReady={storageReady}
              />
            )}
          </>
        }
      />
      {!storageReady && (
        <Notice tone="warning">
          Archiviazione file non configurata: puoi consultare l&apos;archivio, ma per caricare file
          l&apos;amministratore deve configurare lo storage dei documenti.
        </Notice>
      )}
      {eliminato === "1" && (
        <Notice>Documento eliminato. La sua cronologia resta nel registro attività.</Notice>
      )}
      {cartella_eliminata === "1" && <Notice>Cartella eliminata.</Notice>}
      <div className="mt-4 grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="h-fit p-2" data-testid="folder-tree">
          <nav aria-label="Cartelle">
            <FolderLink href={PATH} active={!folderParam} icon="open" label="Tutti i documenti" />
            <FolderLink
              href={`${PATH}?folder=root`}
              active={folderParam === "root"}
              icon="closed"
              label="Senza cartella"
            />
            <FolderTree folders={folders} activeId={current?.id} />
          </nav>
          {current && canWrite && (
            <div className="mt-2 flex flex-wrap justify-end gap-1 border-t border-border pt-2">
              <FolderDialog mode="rename" folder={{ id: current.id, name: current.name }} />
              {canDelete && <DeleteFolderButton id={current.id} name={current.name} />}
            </div>
          )}
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <FilterBar
            pathname={PATH}
            q={params.q}
            placeholder="Cerca per titolo, nome del file, cliente, persona"
            keep={{ folder: folderParam }}
            filters={[
              {
                name: "category",
                label: "Categoria",
                options: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              },
              {
                name: "expiry",
                label: "Scadenza",
                options: Object.entries(EXPIRY).map(([value, label]) => ({ value, label })),
              },
            ]}
            values={{ category: params.filters.category, expiry: params.filters.expiry }}
          />
          <DataTable
            caption="Elenco documenti"
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
                icon={FileText}
                title={filtered ? "Nessun documento trovato" : "Nessun documento qui"}
                description={
                  filtered
                    ? "Prova a cambiare la ricerca o i filtri."
                    : canWrite
                      ? "Carica i primi documenti con «Carica documenti»: puoi sceglierne più di uno insieme."
                      : "I documenti dell'azienda compariranno qui."
                }
              />
            }
          />
        </Card>
      </div>
    </div>
  );
}

function FolderLink({
  href,
  active,
  label,
  icon,
  depth = 0,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: "open" | "closed";
  depth?: number;
  count?: number;
}) {
  const Icon = icon === "open" || active ? FolderOpen : Folder;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
        active && "bg-accent font-medium text-foreground",
        !active && "text-muted-foreground",
      )}
      style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      )}
    </Link>
  );
}

function FolderTree({
  folders,
  activeId,
}: {
  folders: FolderRow[];
  activeId?: string | undefined;
}) {
  const children = new Map<string | null, FolderRow[]>();
  for (const f of folders) {
    const k = f.parentId && folders.some((p) => p.id === f.parentId) ? f.parentId : null;
    children.set(k, [...(children.get(k) ?? []), f]);
  }
  const out: React.ReactNode[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      out.push(
        <FolderLink
          key={f.id}
          href={`${PATH}?folder=${f.id}`}
          active={f.id === activeId}
          icon="closed"
          label={f.name}
          depth={depth}
          count={f.documents}
        />,
      );
      if (depth < 20) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  if (out.length === 0) {
    return <p className="px-2 py-2 text-xs text-muted-foreground">Ancora nessuna cartella.</p>;
  }
  return <div className="mt-1 border-t border-border pt-1">{out}</div>;
}
