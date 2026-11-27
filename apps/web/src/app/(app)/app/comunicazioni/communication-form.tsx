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
import type { SubjectOptions } from "../scadenze/deadline-form";
import { createCommunicationAction, updateCommunicationAction } from "./actions";
import { useOpenFromUrl } from "@/lib/open-from-url";

export interface CommunicationDefaults {
  id?: string;
  version?: string;
  channel?: string;
  direction?: "inbound" | "outbound";
  occurredAt?: string;
  subject?: string;
  body?: string | null;
  contactName?: string | null;
  related?: string; // "tipo:id"
  followUpDate?: string | null;
}

const CHANNELS: [string, string][] = [
  ["phone", "Telefonata"],
  ["email", "Email"],
  ["pec", "PEC"],
  ["meeting", "Incontro"],
  ["letter", "Lettera"],
  ["message", "Messaggio"],
  ["other", "Altro"],
];

const GROUPS: ["customer" | "supplier" | "employee", string][] = [
  ["customer", "Clienti"],
  ["supplier", "Fornitori"],
  ["employee", "Personale"],
];

/** Pulsante + finestra per registrare o modificare una comunicazione. */
export function CommunicationDialog({
  openFromUrl = false,
  mode,
  subjects,
  defaults,
  now,
  lockRelated = false,
  lockedName,
  triggerLabel,
}: {
  /** Apre la finestra se l'indirizzo ha ?crea=1 (menu «+ Nuovo»). */
  openFromUrl?: boolean;
  mode: "create" | "edit";
  subjects: SubjectOptions;
  defaults?: CommunicationDefaults;
  /** data e ora attuali in Italia, per il valore iniziale */
  now: string;
  lockRelated?: boolean;
  lockedName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  useOpenFromUrl(openFromUrl, () => {
    setOpen(true);
    setRound((r) => r + 1);
  });
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
          <Button variant={lockRelated ? "secondary" : "primary"}>
            <Plus aria-hidden /> {triggerLabel ?? "Registra comunicazione"}
          </Button>
        ) : (
          <Button variant="secondary">
            <Pencil aria-hidden /> Modifica
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Registra comunicazione" : "Modifica comunicazione"}
        description="Annota telefonate, email, incontri e accordi presi. CantiereOS registra la comunicazione, non la invia. I campi con * sono obbligatori."
        className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
      >
        <CommunicationForm
          key={round}
          mode={mode}
          subjects={subjects}
          defaults={{ occurredAt: now, ...defaults }}
          lockRelated={lockRelated}
          lockedName={lockedName}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CommunicationForm({
  mode,
  subjects,
  defaults,
  lockRelated,
  lockedName,
  onDone,
}: {
  mode: "create" | "edit";
  subjects: SubjectOptions;
  defaults: CommunicationDefaults;
  lockRelated: boolean;
  lockedName: string | undefined;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    mode === "create" ? createCommunicationAction : updateCommunicationAction,
    {},
  );
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    if (mode === "create" && !lockRelated) {
      router.push(`/app/comunicazioni/${state.createdId}?creata=1`);
    } else router.refresh();
  }, [state.createdId, mode, lockRelated, onDone, router]);
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("c", err, name);

  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.version && <input type="hidden" name="version" value={defaults.version} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="c-channel" label="Canale" required {...errorProp(err, "channel")}>
          <Select {...f("channel")} defaultValue={defaults.channel ?? "phone"}>
            {CHANNELS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="c-direction" label="Direzione" required {...errorProp(err, "direction")}>
          <Select {...f("direction")} defaultValue={defaults.direction ?? "inbound"}>
            <option value="inbound">Ricevuta</option>
            <option value="outbound">Inviata / fatta da noi</option>
          </Select>
        </FormField>
      </div>
      <FormField id="c-subject" label="Oggetto" required {...errorProp(err, "subject")}>
        <Input
          {...f("subject")}
          defaultValue={defaults.subject ?? ""}
          required
          maxLength={200}
          autoComplete="off"
          placeholder="Es. Richiesta preventivo, Sollecito pagamento SAL 2"
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="c-occurredAt" label="Data e ora" required {...errorProp(err, "occurredAt")}>
          <Input
            {...f("occurredAt")}
            type="datetime-local"
            defaultValue={defaults.occurredAt ?? ""}
            required
          />
        </FormField>
        {lockRelated && defaults.related ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Con</p>
            <p className="flex h-9 items-center rounded-sm border border-border bg-accent/40 px-3 text-sm">
              {lockedName ?? "Elemento selezionato"}
            </p>
            <input type="hidden" name="related" value={defaults.related} />
          </div>
        ) : (
          <FormField
            id="c-related"
            label="Con"
            hint="Cliente, fornitore o dipendente"
            {...errorProp(err, "related")}
          >
            <Select {...f("related")} defaultValue={defaults.related ?? ""}>
              <option value="">Nessun collegamento</option>
              {GROUPS.map(([type, label]) =>
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
          id="c-contactName"
          label="Referente"
          hint="Chi ha chiamato o scritto"
          {...errorProp(err, "contactName")}
        >
          <Input
            {...f("contactName")}
            defaultValue={defaults.contactName ?? ""}
            maxLength={120}
            autoComplete="off"
          />
        </FormField>
        <FormField
          id="c-followUpDate"
          label="Da richiamare il"
          hint="Compare nel calendario"
          {...errorProp(err, "followUpDate")}
        >
          <Input {...f("followUpDate")} type="date" defaultValue={defaults.followUpDate ?? ""} />
        </FormField>
      </div>
      <FormField id="c-body" label="Contenuto" {...errorProp(err, "body")}>
        <Textarea
          {...f("body")}
          defaultValue={defaults.body ?? ""}
          maxLength={8000}
          rows={5}
          placeholder="Cosa è stato detto o scritto, accordi presi"
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
          {mode === "create" ? "Registra" : "Salva modifiche"}
        </SubmitButton>
      </div>
    </KeepValuesForm>
  );
}
