"use client";

import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { errorProp, fieldAttrs } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { createEmployeeAction, setEmployeeActiveAction, updateEmployeeAction } from "./actions";

export interface EmployeeDefaults {
  id: string;
  version: string;
  firstName: string;
  lastName: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  employmentType: string;
  hireDate: string | null;
  terminationDate: string | null;
  notes: string | null;
}

export function EmployeeDialog({
  mode,
  defaults,
}: {
  mode: "create" | "edit";
  defaults?: EmployeeDefaults;
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
            <Plus aria-hidden /> Nuova persona
          </Button>
        ) : (
          <Button variant="secondary">
            <Pencil aria-hidden /> Modifica
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Nuova persona" : "Modifica persona"}
        description="Dipendente o collaboratore. I campi con * sono obbligatori."
        className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
      >
        <EmployeeForm key={round} mode={mode} d={defaults} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EmployeeForm({
  mode,
  d,
  onDone,
}: {
  mode: "create" | "edit";
  d: EmployeeDefaults | undefined;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    mode === "create" ? createEmployeeAction : updateEmployeeAction,
    {},
  );
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    if (mode === "create") router.push(`/app/personale/${state.createdId}?creato=1`);
    else router.refresh();
  }, [state.createdId, mode, onDone, router]);
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("e", err, name);
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      {d && <input type="hidden" name="id" value={d.id} />}
      {d && <input type="hidden" name="version" value={d.version} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="e-firstName" label="Nome" required {...errorProp(err, "firstName")}>
          <Input
            {...f("firstName")}
            defaultValue={d?.firstName ?? ""}
            required
            maxLength={100}
            autoComplete="off"
          />
        </FormField>
        <FormField id="e-lastName" label="Cognome" required {...errorProp(err, "lastName")}>
          <Input
            {...f("lastName")}
            defaultValue={d?.lastName ?? ""}
            required
            maxLength={100}
            autoComplete="off"
          />
        </FormField>
        <FormField
          id="e-jobTitle"
          label="Mansione"
          hint="Es. Elettricista, Capocantiere"
          {...errorProp(err, "jobTitle")}
        >
          <Input
            {...f("jobTitle")}
            defaultValue={d?.jobTitle ?? ""}
            maxLength={100}
            autoComplete="off"
          />
        </FormField>
        <FormField
          id="e-employmentType"
          label="Tipo di rapporto"
          required
          {...errorProp(err, "employmentType")}
        >
          <Select {...f("employmentType")} defaultValue={d?.employmentType ?? "employee"}>
            <option value="employee">Dipendente</option>
            <option value="contractor">Collaboratore</option>
            <option value="temporary">Temporaneo</option>
            <option value="intern">Tirocinante</option>
          </Select>
        </FormField>
        <FormField id="e-code" label="Matricola" {...errorProp(err, "code")}>
          <Input {...f("code")} defaultValue={d?.code ?? ""} maxLength={30} autoComplete="off" />
        </FormField>
        <FormField id="e-email" label="Email" {...errorProp(err, "email")}>
          <Input
            {...f("email")}
            type="email"
            defaultValue={d?.email ?? ""}
            maxLength={320}
            autoComplete="off"
          />
        </FormField>
        <FormField id="e-phone" label="Telefono" {...errorProp(err, "phone")}>
          <Input
            {...f("phone")}
            type="tel"
            defaultValue={d?.phone ?? ""}
            maxLength={40}
            autoComplete="off"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-2">
          <FormField id="e-hireDate" label="Assunzione" {...errorProp(err, "hireDate")}>
            <Input {...f("hireDate")} type="date" defaultValue={d?.hireDate ?? ""} />
          </FormField>
          <FormField
            id="e-terminationDate"
            label="Cessazione"
            {...errorProp(err, "terminationDate")}
          >
            <Input {...f("terminationDate")} type="date" defaultValue={d?.terminationDate ?? ""} />
          </FormField>
        </div>
      </div>
      <FormField id="e-notes" label="Note" {...errorProp(err, "notes")}>
        <Textarea {...f("notes")} defaultValue={d?.notes ?? ""} maxLength={2000} />
      </FormField>
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>
          {mode === "create" ? "Aggiungi" : "Salva modifiche"}
        </SubmitButton>
      </div>
    </KeepValuesForm>
  );
}

export function EmployeeActiveButton({
  id,
  name,
  active,
}: {
  id: string;
  name: string;
  active: boolean;
}) {
  const router = useRouter();
  return active ? (
    <ConfirmDialog
      trigger={
        <Button variant="secondary">
          <Archive aria-hidden /> Archivia
        </Button>
      }
      title="Archiviare la persona?"
      description={`${name} non comparirà più tra il personale attivo né nelle scelte dei moduli. Scheda, scadenze e storico restano.`}
      confirmLabel="Archivia"
      confirmVariant="primary"
      action={async () => {
        await setEmployeeActiveAction(id, false);
        router.refresh();
      }}
    />
  ) : (
    <Button
      variant="secondary"
      onClick={async () => {
        await setEmployeeActiveAction(id, true);
        router.refresh();
      }}
    >
      <ArchiveRestore aria-hidden /> Riattiva
    </Button>
  );
}
