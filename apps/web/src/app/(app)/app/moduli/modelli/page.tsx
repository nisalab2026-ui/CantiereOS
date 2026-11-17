import { allFields, FORM_CATEGORY_LABELS, FORM_LIBRARY, listFormTemplates } from "@cantiereos/core";
import { LayoutTemplate, Library } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { NewTemplateDialog } from "./new-template";

export const metadata: Metadata = { title: "Modelli di modulo" };

export default async function FormTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "forms.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const manageGate = sectionGate(access, "forms.manage");
  const canManage = manageGate === "ok";
  const templates = await asCurrentUser((tx) =>
    listFormTemplates(tx, access, { includeArchived: true }),
  );
  const used = new Set(templates.map((t) => t.name.toLowerCase()));

  return (
    <div>
      <Breadcrumbs items={[{ label: "Moduli", href: "/app/moduli" }, { label: "Modelli" }]} />
      <PageHeader
        title="Modelli di modulo"
        description="I fogli che oggi stampi e compili a mano, trasformati in moduli digitali. Le modifiche valgono solo dopo «Pubblica»: i moduli già compilati restano com'erano."
        actions={canManage ? <NewTemplateDialog /> : undefined}
      />
      {sp.eliminato === "1" && (
        <Notice>Modello eliminato. I moduli già compilati restano consultabili.</Notice>
      )}
      {manageGate === "mfa" && (
        <Notice>Per creare o modificare i modelli serve la verifica in due passaggi.</Notice>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="overflow-hidden">
          <CardHeader title="I tuoi modelli" />
          {templates.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={LayoutTemplate}
                title="Nessun modello"
                description={
                  canManage
                    ? "Parti da un modello pronto qui accanto oppure creane uno nuovo."
                    : "Chi gestisce i moduli non ha ancora creato modelli."
                }
              />
            </CardBody>
          ) : (
            <ul className="divide-y divide-border" data-testid="template-list">
              {templates.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/app/moduli/modelli/${t.id}`}
                      className="font-medium hover:underline"
                      data-testid="template-link"
                    >
                      {t.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {FORM_CATEGORY_LABELS[t.category]} · {t.submissionCount}{" "}
                      {t.submissionCount === 1 ? "modulo compilato" : "moduli compilati"} ·
                      modificato il {formatDateTime(t.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.isArchived && <Badge>Archiviato</Badge>}
                    {t.currentVersion ? (
                      <Badge tone="success">Versione {t.currentVersion}</Badge>
                    ) : (
                      <Badge tone="warning">Mai pubblicato</Badge>
                    )}
                    {t.currentVersion && t.hasDraftChanges && (
                      <Badge tone="info">Modifiche in bozza</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="self-start">
          <CardHeader
            title="Modelli pronti"
            description="Punti di partenza già impostati: ne crei una copia e la adatti."
          />
          <CardBody className="space-y-4">
            {FORM_LIBRARY.map((e) => (
              <div
                key={e.key}
                className="cos-tilt rounded-lg border border-border bg-accent/30 p-4"
                data-testid="library-entry"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                    <Library className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{e.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {e.definition.sections.length} sezioni · {allFields(e.definition).length}{" "}
                      campi
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{e.description}</p>
                {canManage && (
                  <div className="mt-3">
                    <NewTemplateDialog
                      library={{
                        key: e.key,
                        name: used.has(e.name.toLowerCase()) ? `${e.name} (copia)` : e.name,
                        category: e.category,
                        description: e.description,
                      }}
                      variant="secondary"
                    />
                  </div>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Trasformare in automatico un PDF o una foto in modulo richiede un servizio di
              riconoscimento del testo (OCR/IA), oggi non configurato.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
