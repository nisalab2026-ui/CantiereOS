import type { WorkReportOptions, WorkReportRow } from "@cantiereos/core";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { NewReportDialog } from "./new-report";
import { formatHours, ReportStatusBadge } from "./report-bits";

/**
 * In Panoramica, per chi lavora in cantiere: il rapportino di oggi in un tocco.
 * Per chi approva: quanti rapportini aspettano.
 */
export function TodayReportCard({
  today,
  projects,
  toApprove,
}: {
  today: WorkReportRow[] | null;
  projects: WorkReportOptions["projects"] | null;
  toApprove: number | null;
}) {
  return (
    <Card data-testid="today-report">
      <CardBody className="flex flex-wrap items-center gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardList className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Rapportino di oggi</p>
          {today && today.length > 0 ? (
            <ul className="mt-1 space-y-1 text-sm">
              {today.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/app/rapportini/${r.id}`} className="font-medium hover:underline">
                    {r.project.code} · {r.project.name}
                  </Link>
                  <ReportStatusBadge status={r.status} />
                  <span className="text-muted-foreground tabular-nums">{formatHours(r.hours)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Scegli la commessa: le tue ore sono già proposte, aggiungi lavori, foto e firma, poi
              invia.
            </p>
          )}
          {toApprove !== null && toApprove > 0 && (
            <Link
              href="/app/rapportini?status=submitted"
              className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
            >
              {toApprove === 1
                ? "1 rapportino da approvare"
                : `${toApprove} rapportini da approvare`}
            </Link>
          )}
        </div>
        {projects && (
          <div className="w-full sm:w-auto">
            {today && today.some((r) => r.status === "draft") ? (
              <Link
                href={`/app/rapportini/${today.find((r) => r.status === "draft")!.id}`}
                className={buttonVariants({ variant: "primary", size: "lg" })}
              >
                Continua il rapportino
              </Link>
            ) : (
              <NewReportDialog
                projects={projects}
                label="Compila il rapportino di oggi"
                size="lg"
              />
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
