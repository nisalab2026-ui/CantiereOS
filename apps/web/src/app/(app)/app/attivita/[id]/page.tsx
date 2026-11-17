import { canUpdateTaskStatus, getRecordHistory, getTask } from "@cantiereos/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { Timeline } from "@/components/history/timeline";
import { Notice } from "@/components/ui";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { loadDeadlineOptions } from "@/lib/deadline-options";
import { formatDateTime } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { formatDue, SUBJECT_HREF, SUBJECT_LABEL } from "../../scadenze/deadline-bits";
import { DeleteTaskButton, TaskStatusButtons } from "../task-actions";
import { TaskPriority, TaskStatusBadge } from "../task-bits";
import { TaskDialog } from "../task-form";

export const metadata: Metadata = { title: "Attività" };

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { access, session } = await getAppContext();
  const gate = sectionGate(access, "tasks.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("tasks.write");
  const canDelete = access.permissions.has("tasks.delete");

  const data = await asCurrentUser(async (tx) => {
    const t = await getTask(tx, access, id);
    if (!t) return null;
    return {
      t,
      history: await getRecordHistory(tx, access, "tasks", id),
      options: canWrite ? await loadDeadlineOptions(tx, access, t.subject) : null,
    };
  });
  if (!data) notFound();
  const { t, history, options } = data;
  const open = t.status === "todo" || t.status === "in_progress";
  const canStatus = canUpdateTaskStatus(access, t, session.userId);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Attività", href: "/app/attivita" }, { label: t.title }]} />
      <PageHeader
        title={t.title}
        testId="task-title"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={t.status} overdue={t.overdue} />
            <TaskPriority priority={t.priority} />
            {t.dueDate && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">entro il {formatDue(t.dueDate)}</span>
              </>
            )}
          </span>
        }
        actions={
          canStatus || canWrite ? (
            <div key={`${t.id}-${t.status}`} className="flex flex-wrap justify-end gap-2">
              {canStatus && <TaskStatusButtons id={t.id} status={t.status} canManage={canWrite} />}
              {open && options && (
                <TaskDialog
                  mode="edit"
                  subjects={options.subjects}
                  members={options.members}
                  defaults={{
                    id: t.id,
                    version: new Date(t.updatedAt).toISOString(),
                    title: t.title,
                    description: t.description,
                    priority: t.priority,
                    dueDate: t.dueDate,
                    assigneeUserId: t.assigneeId,
                    ...(t.subject ? { subject: `${t.subject.type}:${t.subject.id}` } : {}),
                  }}
                />
              )}
              {canDelete && <DeleteTaskButton id={t.id} title={t.title} />}
            </div>
          ) : undefined
        }
      />
      {sp.creata === "1" && <Notice>Attività creata.</Notice>}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Dettagli" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Assegnata a",
                    value: t.assigneeName ?? <span className="text-muted-foreground">Nessuno</span>,
                  },
                  {
                    label: "Riferita a",
                    value: t.subject ? (
                      <>
                        {SUBJECT_HREF[t.subject.type] ? (
                          <Link
                            href={`${SUBJECT_HREF[t.subject.type]}/${t.subject.id}`}
                            className="font-medium hover:underline"
                          >
                            {t.subject.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{t.subject.name}</span>
                        )}
                        <span className="text-muted-foreground">
                          {" "}
                          · {SUBJECT_LABEL[t.subject.type]}
                        </span>
                      </>
                    ) : null,
                  },
                  {
                    label: "Creata",
                    value: `${formatDateTime(t.createdAt)}${t.createdByName ? ` da ${t.createdByName}` : ""}`,
                  },
                  { label: "Dettagli", value: t.description, wide: true },
                ]}
              />
            </CardBody>
          </Card>
          {t.status === "done" && (
            <Card>
              <CardHeader title="Completamento" />
              <CardBody>
                <DetailList
                  items={[
                    { label: "Completata da", value: t.completedByName },
                    { label: "Il", value: t.completedAt ? formatDateTime(t.completedAt) : null },
                    { label: "Note", value: t.completionNotes, wide: true },
                  ]}
                />
              </CardBody>
            </Card>
          )}
          <CommentsPanel table="tasks" id={t.id} />
        </div>
        <Card>
          <CardHeader
            title="Cronologia"
            description="Ogni modifica, con autore e valori prima e dopo."
          />
          <CardBody>
            <Timeline events={history} showRecord={false} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
