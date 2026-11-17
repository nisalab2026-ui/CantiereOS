import type { FormStatus } from "@cantiereos/core";
import { Badge } from "@/components/ui/badge";

export function FormStatusBadge({ status }: { status: FormStatus }) {
  return status === "completed" ? (
    <Badge tone="success" data-testid="form-status">
      Chiuso
    </Badge>
  ) : (
    <Badge tone="warning" data-testid="form-status">
      In compilazione
    </Badge>
  );
}
