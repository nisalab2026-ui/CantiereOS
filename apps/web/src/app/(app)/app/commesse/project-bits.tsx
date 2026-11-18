import {
  PROJECT_STATUS_LABELS,
  SITE_STATUS_LABELS,
  type ProjectStatus,
  type SiteStatus,
} from "@cantiereos/core";
import { Badge } from "@/components/ui/badge";

const TONES: Record<ProjectStatus, "info" | "success" | "warning" | "neutral"> = {
  quote: "info",
  active: "success",
  suspended: "warning",
  completed: "neutral",
  cancelled: "neutral",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge tone={TONES[status]} data-testid="project-status">
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}

const SITE_TONES: Record<SiteStatus, "info" | "success" | "warning" | "neutral"> = {
  planned: "info",
  active: "success",
  suspended: "warning",
  closed: "neutral",
};

export function SiteStatusBadge({ status }: { status: SiteStatus }) {
  return <Badge tone={SITE_TONES[status]}>{SITE_STATUS_LABELS[status]}</Badge>;
}
