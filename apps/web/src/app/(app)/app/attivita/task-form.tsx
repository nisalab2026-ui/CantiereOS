"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { errorProp, fieldAttrs } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import type { Option, SubjectOptions } from "../scadenze/deadline-form";
import { createTaskAction, updateTaskAction } from "./actions";

export interface TaskDefaults {
  id?: string;
  version?: string;
  title?: string;
  description?: string | null;
  priority?: string;
  dueDate?: string | null;
  assigneeUserId?: string | null;
  subject?: string; // "tipo:id"
}

const PRIORITIES: [string, string][] = [
  ["low", "Bassa"],
  ["normal", "Normale"],
  ["high", "Alta"],
  ["urgent", "Urgente"],
];

const SUBJECT_GROUPS: [keyof SubjectOptions, string][] = [
  ["customer", "Clienti"],
  ["employee", "Personale"],
  ["supplier", "Fornitori"],
  ["team", "Squadre"],
];

/** Pulsante + finestra per creare o modificare un'attività. */
export function TaskDialog({
  mode,
  subjects,
  members,
  defaults,
  lockSubject = false,
  triggerLabel,
}: {
  mode: "create" | "edit";
  subjects: SubjectOptions;
  members: Option[];
  defaults?: TaskDefaults;
  /** Nella scheda di un cliente/dipendente il collegamento è già deciso. */
  lockSubject?: boolean;
  triggerLabel?: string;
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
        {mode === "create" ? (
          <Button>
            <Plus aria-hidden /> {triggerLabel ?? "Nuova attività"}
          </Button>
        ) : (
          <Button variant="secondary">
            <Pencil aria-hidden /> Modifica
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Nuova attività" : "Modifica attività"}
        description="Un lavoro da fare, assegnato a una persona. Chi la riceve viene avvisato. I campi con * sono obbligatori."
        className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
      >
        <TaskForm
          key={round}
          mode={mode}
          subjects={subjects}
          members={members}
          defaults={defaults ?? {}}
          lockSubject={lockSubject}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({
  mode,
  subjects,
  members,
  defaults,
  lockSubject,
  onDone,
}: {
  mode: "create" | "edit";
  subjects: SubjectOptions;
  members: Option[];
  defaults: TaskDefaults;
  lockSubject: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    mode === "create" ? createTaskAction : updateTaskAction,
    {},
  );
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    if (mode === "create") router.push(`/app/attivita/${state.createdId}?creata=1`);
    else router.refresh();
  }, [state.createdId, mode, onDone, router]);
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("t", err, name);
  const lockedName =
    lockSubject && defaults.subject ? subjectName(subjects, defaults.subject) : null;

  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.version && <input type="hidden" name="version" value={defaults.version} />}
      <FormField id="t-title" label="Cosa c'è da fare" required {...errorProp(err, "title")}>
        <Input
          {...f("title")}
          defaultValue={defaults.title ?? ""}
          required
          maxLength={200}
          autoComplete="off"
          placeholder="Es. Sopralluogo, Preparare preventivo, Ordinare materiale"
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="t-assigneeUserId"
          label="Assegnata a"
          hint="Riceve una notifica"
          {...errorProp(err, "assigneeUserId")}
        >
          <Select {...f("assigneeUserId")} defaultValue={defaults.assigneeUserId ?? ""}>
            <option value="">Nessuno</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="t-dueDate" label="Entro il" {...errorProp(err, "dueDate")}>
          <Input {...f("dueDate")} type="date" defaultValue={defaults.dueDate ?? ""} />
        </FormField>
        <FormField id="t-priority" label="Priorità" {...errorProp(err, "priority")}>
          <Select {...f("priority")} defaultValue={defaults.priority ?? "normal"}>
            {PRIORITIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </FormField>
        {lockSubject && defaults.subject ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Riferita a</p>
            <p className="flex h-9 items-center rounded-sm border border-border bg-accent/40 px-3 text-sm">
              {lockedName}
            </p>
            <input type="hidden" name="subject" value={defaults.subject} />
          </div>
        ) : (
          <FormField
            id="t-subject"
            label="Riferita a"
            hint="Cliente, dipendente, fornitore o squadra"
            {...errorProp(err, "subject")}
          >
            <Select {...f("subject")} defaultValue={defaults.subject ?? ""}>
              <option value="">Nessun collegamento</option>
              {SUBJECT_GROUPS.map(([type, label]) =>
                subjects[type] && subjects[type].length > 0 ? (
                  <optgroup key={type} label={label}>
                    {subjects[type].map((o) => (
                      <option key={o.id} value={`${type}:${o.id}`}>
                        {o.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null,
              )}
            </Select>
          </FormField>
        )}
      </div>
      <FormField id="t-description" label="Dettagli" {...errorProp(err, "description")}>
        <Textarea
          {...f("description")}
          defaultValue={defaults.description ?? ""}
          maxLength={4000}
          placeholder="Indirizzo, materiali, persone da contattare…"
        />
      </FormField>
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2 pt-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>
          {mode === "create" ? "Crea attività" : "Salva modifiche"}
        </SubmitButton>
      </div>
    </KeepValuesForm>
  );
}

function subjectName(subjects: SubjectOptions, key: string): string {
  const [type, id] = key.split(":") as [keyof SubjectOptions, string];
  return subjects[type]?.find((o) => o.id === id)?.name ?? "Elemento selezionato";
}
