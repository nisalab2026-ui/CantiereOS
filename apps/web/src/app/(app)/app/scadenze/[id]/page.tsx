import { getDeadline, getRecordHistory } from "@cantiereos/core";
import { ArrowLeft, ArrowRight, Repeat } from "lucide-react";
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
import {
  CompleteDeadlineButton,
  DeadlineStatusButton,
  DeleteDeadlineButton,
} from "../deadline-actions";
import {
  daysText,
  DeadlineStateBadge,
  formatDue,
  SUBJECT_HREF,
  SUBJECT_LABEL,
} from "../deadline-bits";
import { DeadlineDialog } from "../deadline-form";

export const metadata: Metadata = { title: "Scadenza" };

const KIND_ONE: Record<string, string> = {
  certification: "Certificazione",
  maintenance: "Manutenzione",
  inspection: "Controllo periodico",
  document: "Documento",
  payment: "Pagamento",
  contract: "Contratto",
  other: "Altro",
};

export default async function DeadlinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "deadlines.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("deadlines.write");
  const canDelete = access.permissions.has("deadlines.delete");

  const data = await asCurrentUser(async (tx) => {
    const d = await getDeadline(tx, access, id);
    if (!d) return null;
    return {
      d,
      history: await getRecordHistory(tx, access, "deadlines", id),
      options: canWrite ? await loadDeadlineOptions(tx, access, d.subject) : null,
    };
  });
  if (!data) notFound();
  const { d, history, options } = data;
  const open = d.state !== "done" && d.state !== "cancelled";

  return (
    <div>
      <Breadcrumbs items={[{ label: "Scadenze", href: "/app/scadenze" }, { label: d.title }]} />
      <PageHeader
        title={d.title}
        testId="deadline-title"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <DeadlineStateBadge state={d.state} />
            <span>{KIND_ONE[d.kind]}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {formatDue(d.dueDate)}
              {daysText(d) ? ` (${daysText(d)})` : ""}
            </span>
          </span>
        }
        actions={
          canWrite ? (
            <div key={d.id} className="flex flex-wrap justify-end gap-2">
              {open && <CompleteDeadlineButton id={d.id} recurring={Boolean(d.recurrenceMonths)} />}
              {open && options && (
                <DeadlineDialog
                  mode="edit"
                  subjects={options.subjects}
                  members={options.members}
                  defaults={{
                    id: d.id,
                    version: new Date(d.updatedAt).toISOString(),
                    kind: d.kind,
                    title: d.title,
                    description: d.description,
                    referenceCode: d.referenceCode,
                    dueDate: d.dueDate,
                    remindDaysBefore: d.remindDaysBefore,
                    recurrenceMonths: d.recurrenceMonths,
                    ...(d.subject ? { subject: `${d.subject.type}:${d.subject.id}` } : {}),
                    responsibleUserId: d.responsibleId,
                  }}
                />
              )}
              {open && <DeadlineStatusButton id={d.id} to="cancelled" />}
              {d.state === "cancelled" && <DeadlineStatusButton id={d.id} to="open" />}
              {d.state === "done" && !d.nextId && <DeadlineStatusButton id={d.id} to="open" />}
              {canDelete && <DeleteDeadlineButton id={d.id} title={d.title} />}
            </div>
          ) : undefined
        }
      />
      {sp.creata === "1" && <Notice>Scadenza creata.</Notice>}
      {sp.completata === "1" && <Notice>Scadenza completata.</Notice>}
      {sp.successiva === "1" && (
        <Notice>Scadenza precedente completata: questa è la prossima, già pianificata.</Notice>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Dettagli" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Riferita a",
                    value: d.subject ? (
                      <>
                        {SUBJECT_HREF[d.subject.type] ? (
                          <Link
                            href={`${SUBJECT_HREF[d.subject.type]}/${d.subject.id}`}
                            className="font-medium hover:underline"
                          >
                            {d.subject.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{d.subject.name}</span>
                        )}
                        <span className="text-muted-foreground">
                          {" "}
                          · {SUBJECT_LABEL[d.subject.type]}
                        </span>
                      </>
                    ) : null,
                  },
                  { label: "Responsabile", value: d.responsibleName },
                  { label: "Riferimento", value: d.referenceCode },
                  { label: "Avviso", value: `${d.remindDaysBefore} giorni prima` },
                  {
                    label: "Ricorrenza",
                    value: d.recurrenceMonths ? (
                      <span className="inline-flex items-center gap-1">
                        <Repeat className="size-3.5" aria-hidden />
                        {d.recurrenceMonths === 12
                          ? "Ogni anno"
                          : d.recurrenceMonths % 12 === 0
                            ? `Ogni ${d.recurrenceMonths / 12} anni`
                            : `Ogni ${d.recurrenceMonths} mesi`}
                      </span>
                    ) : (
                      "Non si ripete"
                    ),
                  },
                  { label: "Creata il", value: formatDateTime(d.createdAt) },
                  { label: "Note", value: d.description, wide: true },
                ]}
              />
            </CardBody>
          </Card>
          {d.state === "done" && (
            <Card>
              <CardHeader title="Completamento" />
              <CardBody>
                <DetailList
                  items={[
                    { label: "Completata da", value: d.completedByName },
                    { label: "Il", value: d.completedAt ? formatDateTime(d.completedAt) : null },
                    { label: "Note", value: d.completionNotes, wide: true },
                  ]}
                />
              </CardBody>
            </Card>
          )}
          {(d.previousId || d.nextId) && (
            <Card>
              <CardHeader title="Ricorrenze collegate" />
              <CardBody className="flex flex-wrap gap-3 text-sm">
                {d.previousId && (
                  <Link
                    href={`/app/scadenze/${d.previousId}`}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    <ArrowLeft className="size-4" aria-hidden /> Scadenza precedente
                  </Link>
                )}
                {d.nextId && (
                  <Link
                    href={`/app/scadenze/${d.nextId}`}
                    className="inline-flex items-center gap-1 hover:underline"
                    data-testid="next-deadline"
                  >
                    Scadenza successiva <ArrowRight className="size-4" aria-hidden />
                  </Link>
                )}
              </CardBody>
            </Card>
          )}
          <CommentsPanel table="deadlines" id={d.id} />
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
