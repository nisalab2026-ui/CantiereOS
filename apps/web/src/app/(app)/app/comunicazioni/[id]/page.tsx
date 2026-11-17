import { getCommunication, getRecordHistory } from "@cantiereos/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/history/timeline";
import { Notice } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { loadDeadlineOptions } from "@/lib/deadline-options";
import { formatDateTime, romeLocalDateTime } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { formatDue, SUBJECT_LABEL } from "../../scadenze/deadline-bits";
import { DeleteCommunicationButton, FollowUpButton } from "../communication-actions";
import { ChannelLabel, RELATED_HREF } from "../communication-bits";
import { CommunicationDialog } from "../communication-form";

export const metadata: Metadata = { title: "Comunicazione" };

export default async function CommunicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "communications.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("communications.write");
  const canDelete = access.permissions.has("communications.delete");

  const data = await asCurrentUser(async (tx) => {
    const c = await getCommunication(tx, access, id);
    if (!c) return null;
    return {
      c,
      history: await getRecordHistory(tx, access, "communications", id),
      options: canWrite ? await loadDeadlineOptions(tx, access, c.related) : null,
    };
  });
  if (!data) notFound();
  const { c, history, options } = data;

  return (
    <div>
      <Breadcrumbs
        items={[{ label: "Comunicazioni", href: "/app/comunicazioni" }, { label: c.subject }]}
      />
      <PageHeader
        title={c.subject}
        testId="communication-title"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <ChannelLabel channel={c.channel} direction={c.direction} />
            <span aria-hidden>·</span>
            <span className="tabular-nums">{formatDateTime(c.occurredAt)}</span>
            {c.followUpDate &&
              (c.followUpDone ? (
                <Badge tone="success">Richiamo fatto</Badge>
              ) : (
                <Badge tone={c.followUpOverdue ? "danger" : "warning"} data-testid="follow-up">
                  Da richiamare il {formatDue(c.followUpDate)}
                </Badge>
              ))}
          </span>
        }
        actions={
          canWrite ? (
            <div key={`${c.id}-${c.followUpDone}`} className="flex flex-wrap justify-end gap-2">
              {c.followUpDate && <FollowUpButton id={c.id} done={c.followUpDone} />}
              {options && (
                <CommunicationDialog
                  mode="edit"
                  subjects={options.subjects}
                  now={romeLocalDateTime()}
                  defaults={{
                    id: c.id,
                    version: new Date(c.updatedAt).toISOString(),
                    channel: c.channel,
                    direction: c.direction,
                    occurredAt: romeLocalDateTime(c.occurredAt),
                    subject: c.subject,
                    body: c.body,
                    contactName: c.contactName,
                    ...(c.related ? { related: `${c.related.type}:${c.related.id}` } : {}),
                    followUpDate: c.followUpDate,
                  }}
                />
              )}
              {canDelete && <DeleteCommunicationButton id={c.id} title={c.subject} />}
            </div>
          ) : undefined
        }
      />
      {sp.creata === "1" && <Notice>Comunicazione registrata.</Notice>}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Dettagli" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Con",
                    value: c.related ? (
                      <>
                        {RELATED_HREF[c.related.type] ? (
                          <Link
                            href={`${RELATED_HREF[c.related.type]}/${c.related.id}`}
                            className="font-medium hover:underline"
                          >
                            {c.related.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{c.related.name}</span>
                        )}
                        <span className="text-muted-foreground">
                          {" "}
                          · {SUBJECT_LABEL[c.related.type]}
                        </span>
                      </>
                    ) : null,
                  },
                  { label: "Referente", value: c.contactName },
                  {
                    label: "Registrata",
                    value: `${formatDateTime(c.createdAt)}${c.createdByName ? ` da ${c.createdByName}` : ""}`,
                  },
                  {
                    label: "Contenuto",
                    value: c.body ? <span className="whitespace-pre-wrap">{c.body}</span> : null,
                    wide: true,
                  },
                ]}
              />
            </CardBody>
          </Card>
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
