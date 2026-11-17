"use client";

import type { WorkReportOptions } from "@cantiereos/core";
import { ClipboardPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Select } from "@/components/ui/input";
import { errorProp } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { createReportAction } from "./actions";

const todayRome = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

/** "Nuovo rapportino": commessa, cantiere e giorno; il numero lo assegna il database. */
export function NewReportDialog({
  projects,
  defaultProjectId,
  variant = "primary",
  label = "Nuovo rapportino",
  size = "md",
}: {
  projects: WorkReportOptions["projects"];
  defaultProjectId?: string;
  variant?: "primary" | "secondary";
  label?: string;
  size?: "md" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setRound((r) => r + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className="w-full sm:w-auto" data-testid="new-report">
          <ClipboardPlus aria-hidden /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nuovo rapportino"
        description="Una giornata di lavoro su una commessa: dopo aggiungi ore, materiali, foto e firma del cliente."
      >
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Non ci sono commesse aperte. Il rapportino si collega sempre a una commessa: aprila
            prima in «Commesse».
          </p>
        ) : (
          <NewReportForm
            key={round}
            projects={projects}
            {...(defaultProjectId ? { defaultProjectId } : {})}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewReportForm({
  projects,
  defaultProjectId,
}: {
  projects: WorkReportOptions["projects"];
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(createReportAction, {});
  const [projectId, setProjectId] = useState(
    defaultProjectId ?? (projects.length === 1 ? projects[0]!.id : ""),
  );
  useEffect(() => {
    if (state.createdId) router.push(`/app/rapportini/${state.createdId}?nuovo=1`);
  }, [state.createdId, router]);
  const err = state.fieldErrors ?? {};
  const project = projects.find((p) => p.id === projectId);
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      <FormField id="nr-projectId" label="Commessa" required {...errorProp(err, "projectId")}>
        <Select
          id="nr-projectId"
          name="projectId"
          required
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">Scegli…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name} ({p.customerName})
            </option>
          ))}
        </Select>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="nr-projectSiteId" label="Cantiere" {...errorProp(err, "projectSiteId")}>
          <Select
            id="nr-projectSiteId"
            name="projectSiteId"
            key={projectId}
            disabled={!project?.sites.length}
            defaultValue={project?.sites.length === 1 ? project.sites[0]!.id : ""}
          >
            <option value="">{project?.sites.length ? "Nessuno in particolare" : "—"}</option>
            {project?.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="nr-reportDate" label="Giorno" required {...errorProp(err, "reportDate")}>
          <Input
            id="nr-reportDate"
            name="reportDate"
            type="date"
            required
            defaultValue={todayRome()}
          />
        </FormField>
      </div>
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>Crea e compila</SubmitButton>
      </div>
    </KeepValuesForm>
  );
}
