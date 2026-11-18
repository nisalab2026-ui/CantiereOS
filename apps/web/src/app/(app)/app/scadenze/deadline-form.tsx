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
import { createDeadlineAction, updateDeadlineAction } from "./actions";

export interface Option {
  id: string;
  name: string;
}
export type SubjectOptions = Record<"customer" | "supplier" | "employee" | "team", Option[] | null>;

export interface DeadlineDefaults {
  id?: string;
  version?: string;
  kind?: string;
  title?: string;
  description?: string | null;
  referenceCode?: string | null;
  dueDate?: string;
  remindDaysBefore?: number;
  recurrenceMonths?: number | null;
  subject?: string; // "tipo:id"
  responsibleUserId?: string | null;
}

const KINDS: [string, string][] = [
  ["certification", "Certificazione"],
  ["maintenance", "Manutenzione"],
  ["inspection", "Controllo periodico"],
  ["document", "Documento"],
  ["payment", "Pagamento"],
  ["contract", "Contratto"],
  ["other", "Altro"],
];

const SUBJECT_GROUPS: [keyof SubjectOptions, string][] = [
  ["customer", "Clienti"],
  ["employee", "Personale"],
  ["supplier", "Fornitori"],
  ["team", "Squadre"],
];

const RECURRENCE: [string, string][] = [
  ["", "Non si ripete"],
  ["1", "Ogni mese"],
  ["3", "Ogni 3 mesi"],
  ["6", "Ogni 6 mesi"],
  ["12", "Ogni anno"],
  ["24", "Ogni 2 anni"],
  ["36", "Ogni 3 anni"],
  ["60", "Ogni 5 anni"],
];

/** Pulsante + finestra per creare o modificare una scadenza. */
export function DeadlineDialog({
  mode,
  subjects,
  members,
  defaults,
  lockSubject = false,
  triggerLabel,
  afterCreateHref,
}: {
  mode: "create" | "edit";
  subjects: SubjectOptions;
  members: Option[];
  defaults?: DeadlineDefaults;
  /** Nella scheda di un cliente/dipendente il collegamento è già deciso. */
  lockSubject?: boolean;
  triggerLabel?: string;
  /** Torna al contesto d'origine dopo aver creato una scadenza collegata. */
  afterCreateHref?: string;
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
            <Plus aria-hidden /> {triggerLabel ?? "Nuova scadenza"}
          </Button>
        ) : (
          <Button variant="secondary">
            <Pencil aria-hidden /> Modifica
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Nuova scadenza" : "Modifica scadenza"}
        description="Certificazioni, manutenzioni, controlli, documenti, pagamenti. I campi con * sono obbligatori."
        className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
      >
        <DeadlineForm
          key={round}
          mode={mode}
          subjects={subjects}
          members={members}
          defaults={defaults ?? {}}
          lockSubject={lockSubject}
          {...(afterCreateHref ? { afterCreateHref } : {})}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeadlineForm({
  mode,
  subjects,
  members,
  defaults,
  lockSubject,
  afterCreateHref,
  onDone,
}: {
  mode: "create" | "edit";
  subjects: SubjectOptions;
  members: Option[];
  defaults: DeadlineDefaults;
  lockSubject: boolean;
  afterCreateHref?: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    mode === "create" ? createDeadlineAction : updateDeadlineAction,
    {},
  );
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    if (mode === "create")
      router.push(afterCreateHref ?? `/app/scadenze/${state.createdId}?creata=1`);
    else router.refresh();
  }, [state.createdId, mode, onDone, router, afterCreateHref]);
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("d", err, name);
  const lockedName =
    lockSubject && defaults.subject ? subjectName(subjects, defaults.subject) : null;

  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.version && <input type="hidden" name="version" value={defaults.version} />}
      <FormField id="d-title" label="Titolo" required {...errorProp(err, "title")}>
        <Input
          {...f("title")}
          defaultValue={defaults.title ?? ""}
          required
          maxLength={200}
          autoComplete="off"
          placeholder="Es. Revisione gru, Patentino PLE, Rinnovo DURC"
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="d-kind" label="Tipo" required {...errorProp(err, "kind")}>
          <Select {...f("kind")} defaultValue={defaults.kind ?? "certification"}>
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="d-dueDate" label="Data di scadenza" required {...errorProp(err, "dueDate")}>
          <Input {...f("dueDate")} type="date" defaultValue={defaults.dueDate ?? ""} required />
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
            id="d-subject"
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
        <FormField
          id="d-responsibleUserId"
          label="Responsabile"
          hint="Riceve gli avvisi. Se vuoto: chi gestisce le scadenze"
          {...errorProp(err, "responsibleUserId")}
        >
          <Select {...f("responsibleUserId")} defaultValue={defaults.responsibleUserId ?? ""}>
            <option value="">Nessuno</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          id="d-remindDaysBefore"
          label="Avvisa con anticipo (giorni)"
          {...errorProp(err, "remindDaysBefore")}
        >
          <Input
            {...f("remindDaysBefore")}
            type="number"
            min={0}
            max={365}
            inputMode="numeric"
            defaultValue={String(defaults.remindDaysBefore ?? 30)}
          />
        </FormField>
        <FormField
          id="d-recurrenceMonths"
          label="Ricorrenza"
          hint="Completandola si crea la successiva"
          {...errorProp(err, "recurrenceMonths")}
        >
          <Select {...f("recurrenceMonths")} defaultValue={String(defaults.recurrenceMonths ?? "")}>
            {RECURRENCE.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          id="d-referenceCode"
          label="Riferimento"
          hint="Numero certificato, matricola, protocollo"
          {...errorProp(err, "referenceCode")}
        >
          <Input
            {...f("referenceCode")}
            defaultValue={defaults.referenceCode ?? ""}
            maxLength={60}
            autoComplete="off"
          />
        </FormField>
      </div>
      <FormField id="d-description" label="Note" {...errorProp(err, "description")}>
        <Textarea
          {...f("description")}
          defaultValue={defaults.description ?? ""}
          maxLength={4000}
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
          {mode === "create" ? "Crea scadenza" : "Salva modifiche"}
        </SubmitButton>
      </div>
    </KeepValuesForm>
  );
}

function subjectName(subjects: SubjectOptions, key: string): string {
  const [type, id] = key.split(":") as [keyof SubjectOptions, string];
  return subjects[type]?.find((o) => o.id === id)?.name ?? "Elemento selezionato";
}
