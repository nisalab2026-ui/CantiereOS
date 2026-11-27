import { listTasks, TASK_SORTS, type TaskRow } from "@cantiereos/core";
import { ListTodo } from "lucide-react";
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
import { formatDue, SUBJECT_HREF, SUBJECT_LABEL } from "../scadenze/deadline-bits";
import { TaskPriority, TaskStatusBadge } from "./task-bits";
import { TaskDialog } from "./task-form";

export const metadata: Metadata = { title: "Attività" };

const PATH = "/app/attivita";
const STATES = {
  overdue: "In ritardo",
  todo: "Da fare",
  in_progress: "In corso",
  done: "Completate",
  cancelled: "Annullate",
  all: "Tutte",
} as const;
const PRIORITIES = { urgent: "Urgente", high: "Alta", normal: "Normale", low: "Bassa" } as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { eliminata, ...sp } = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "tasks.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("tasks.write");

  const params = parseListParams(sp, {
    sorts: TASK_SORTS,
    defaultSort: "due",
    filters: {
      state: Object.keys(STATES),
      priority: Object.keys(PRIORITIES),
      assignee: ["me", "none"],
    },
  });
  const { page, options } = await asCurrentUser(async (tx) => ({
    page: await listTasks(tx, access, {
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      page: params.page,
      pageSize: params.pageSize,
      state: params.filters.state ?? "open",
      ...(params.filters.priority ? { priority: params.filters.priority } : {}),
      ...(params.filters.assignee ? { assignee: params.filters.assignee } : {}),
    }),
    options: canWrite ? await loadDeadlineOptions(tx, access) : null,
  }));
  const filtered = Boolean(
    params.q || params.filters.state || params.filters.priority || params.filters.assignee,
  );

  const columns: Column<TaskRow>[] = [
    {
      key: "title",
      header: "Attività",
      sortKey: "title",
      render: (r) => (
        <div className="min-w-0">
          <Link
            href={`${PATH}/${r.id}`}
            className="font-medium hover:underline"
            data-testid="task-link"
          >
            {r.title}
          </Link>
          <p className="mt-0.5">
            <TaskPriority priority={r.priority} />
          </p>
        </div>
      ),
    },
    {
      key: "subject",
      header: "Riferita a",
      className: "hidden md:table-cell",
      render: (r) =>
        r.subject ? (
          <div className="text-sm">
            {SUBJECT_HREF[r.subject.type] ? (
              <Link
                href={`${SUBJECT_HREF[r.subject.type]}/${r.subject.id}`}
                className="hover:underline"
              >
                {r.subject.name}
              </Link>
            ) : (
              r.subject.name
            )}
            <p className="text-xs text-muted-foreground">{SUBJECT_LABEL[r.subject.type]}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "assignee",
      header: "Assegnata a",
      className: "hidden lg:table-cell",
      render: (r) => r.assigneeName ?? <span className="text-muted-foreground">Nessuno</span>,
    },
    {
      key: "due",
      header: "Entro il",
      sortKey: "due",
      render: (r) =>
        r.dueDate ? (
          <span className="tabular-nums">{formatDue(r.dueDate)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "status",
      header: "Stato",
      render: (r) => <TaskStatusBadge status={r.status} overdue={r.overdue} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Attività"
        description="Lavori da fare assegnati alle persone dell'azienda, con priorità, data e collegamento a clienti, personale, fornitori o squadre."
        actions={
          <>
            <ExportButton section="tasks" params={sp} />
            {options && (
              <TaskDialog
                mode="create"
                openFromUrl
                subjects={options.subjects}
                members={options.members}
              />
            )}
          </>
        }
      />
      {eliminata === "1" && (
        <Notice>Attività eliminata. La sua cronologia resta nel registro attività.</Notice>
      )}
      <Card className="mt-4 overflow-hidden">
        <FilterBar
          pathname={PATH}
          q={params.q}
          placeholder="Cerca per titolo, dettagli, cliente, persona"
          filters={[
            {
              name: "state",
              label: "Stato",
              emptyLabel: "Aperte",
              options: Object.entries(STATES).map(([value, label]) => ({ value, label })),
            },
            {
              name: "priority",
              label: "Priorità",
              options: Object.entries(PRIORITIES).map(([value, label]) => ({ value, label })),
            },
            {
              name: "assignee",
              label: "Assegnatario",
              options: [
                { value: "me", label: "Assegnate a me" },
                { value: "none", label: "Senza assegnatario" },
              ],
            },
          ]}
          values={{
            state: params.filters.state,
            priority: params.filters.priority,
            assignee: params.filters.assignee,
          }}
        />
        <DataTable
          caption="Elenco attività"
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
                icon={ListTodo}
                title="Nessuna attività trovata"
                description="Prova a cambiare la ricerca o i filtri."
              />
            ) : (
              <EmptyState
                icon={ListTodo}
                title="Nessuna attività aperta"
                description={
                  canWrite
                    ? "Crea un'attività con «Nuova attività» e assegnala: la persona riceverà una notifica."
                    : "Le attività assegnate a te o all'azienda compariranno qui."
                }
              />
            )
          }
        />
      </Card>
    </div>
  );
}
