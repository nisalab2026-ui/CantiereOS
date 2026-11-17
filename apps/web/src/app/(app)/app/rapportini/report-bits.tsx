import { WORK_REPORT_STATUS_LABELS, type WorkReportStatus } from "@cantiereos/core";
import { Badge } from "@/components/ui/badge";

const TONES: Record<WorkReportStatus, "info" | "success" | "warning" | "neutral"> = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  invoiced: "info",
};

export function ReportStatusBadge({ status }: { status: WorkReportStatus }) {
  return (
    <Badge tone={TONES[status]} data-testid="report-status">
      {WORK_REPORT_STATUS_LABELS[status]}
    </Badge>
  );
}

/** 8 → "8 h", 7.5 → "7,5 h" */
export function formatHours(h: number): string {
  return `${h.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;
}

/** "2026-11-17" → "mar 17 nov 2026" */
export function formatReportDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Rome",
  });
}
