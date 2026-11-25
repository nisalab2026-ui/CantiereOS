import { getFormTemplate, getRecordHistory, FORM_CATEGORY_LABELS } from "@cantiereos/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/history/timeline";
import { Notice } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import Link from "next/link";
import { sectionGate } from "@/lib/permissions";
import { FormDocument } from "../../form-document";
import { ArchiveTemplateButton, DeleteTemplateButton } from "./template-actions";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Modello di modulo" };

export default async function FormTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { access, company } = await getAppContext();
  const gate = sectionGate(access, "forms.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canManage = access.permissions.has("forms.manage");
  const canDelete = access.permissions.has("forms.delete");

  const data = await asCurrentUser(async (tx) => {
    const t = await getFormTemplate(tx, access, id);
    if (!t) return null;
    return { t, history: await getRecordHistory(tx, access, "form_templates", id) };
  });
  if (!data) notFound();
  const { t, history } = data;

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Moduli", href: "/app/moduli" },
          { label: "Modelli", href: "/app/moduli/modelli" },
          { label: t.name },
        ]}
      />
      <PageHeader
        title={t.name}
        testId="template-title"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{FORM_CATEGORY_LABELS[t.category]}</span>
            {t.currentVersion ? (
              <Badge tone="success" data-testid="template-version">
                Versione {t.currentVersion} in uso
              </Badge>
            ) : (
              <Badge tone="warning" data-testid="template-version">
                Mai pubblicato
              </Badge>
            )}
            {t.isArchived && <Badge>Archiviato</Badge>}
          </span>
        }
        actions={
          canManage || canDelete ? (
            <div className="flex flex-wrap justify-end gap-2">
              {canManage && <ArchiveTemplateButton id={t.id} archived={t.isArchived} />}
              {canDelete && <DeleteTemplateButton id={t.id} name={t.name} />}
            </div>
          ) : undefined
        }
      />
      {sp.nuovo === "1" && (
        <Notice>
          Modello creato. Sistema campi e testi, poi «Pubblica»: da quel momento si potrà compilare.
        </Notice>
      )}
      {!canManage && sectionGate(access, "forms.manage") === "mfa" && (
        <Notice>
          Stai vedendo l'anteprima. Per modificare il modello serve la verifica in due passaggi:{" "}
          <Link
            href="/account/sicurezza"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            verifica ora
          </Link>
          .
        </Notice>
      )}
      <div className="mt-4">
        {canManage ? (
          <TemplateEditor
            id={t.id}
            version={new Date(t.updatedAt).toISOString()}
            published={Boolean(t.currentVersion)}
            companyName={company.name}
            initial={{
              name: t.name,
              description: t.description ?? "",
              category: t.category,
              definition: t.draftDefinition,
            }}
          />
        ) : (
          <Card>
            <CardBody>
              <FormDocument
                definition={t.draftDefinition}
                values={{}}
                blank
                heading={{
                  kicker: FORM_CATEGORY_LABELS[t.category],
                  title: t.name,
                  description: t.description ?? undefined,
                  company: company.name,
                }}
              />
            </CardBody>
          </Card>
        )}
      </div>
      <Card className="mt-4">
        <CardHeader title="Cronologia" description="Modifiche e versioni pubblicate." />
        <CardBody>
          <Timeline events={history} showRecord={false} />
        </CardBody>
      </Card>
    </div>
  );
}
