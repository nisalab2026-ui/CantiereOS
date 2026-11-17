"use client";

import type { CustomerDetail } from "@cantiereos/core";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
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
import { setCustomerActiveAction, updateCustomerAction } from "./actions";

type Editable = Omit<CustomerDetail, "sites" | "contacts" | "createdAt" | "updatedAt"> & {
  version: string;
};

export function EditCustomerDialog({ customer }: { customer: Editable }) {
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
        <Button variant="secondary">
          <Pencil aria-hidden /> Modifica
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Modifica cliente"
        description="Ogni modifica viene registrata nello storico con il valore precedente."
        className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
      >
        <CustomerForm key={round} c={customer} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({ c, onDone }: { c: Editable; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(updateCustomerAction, {});
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    router.refresh();
  }, [state.createdId, onDone, router]);
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("ce", err, name);
  const text = (
    name: keyof Editable,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <FormField id={`ce-${name}`} label={label} {...errorProp(err, name)}>
      <Input
        {...f(name)}
        defaultValue={(c[name] as string | number | null) ?? ""}
        autoComplete="off"
        {...props}
      />
    </FormField>
  );
  return (
    <KeepValuesForm dispatch={action} className="space-y-5">
      <input type="hidden" name="id" value={c.id} />
      <input type="hidden" name="version" value={c.version} />
      <fieldset className="space-y-4">
        <legend className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Identità
        </legend>
        <FormField
          id="ce-displayName"
          label="Nome o ragione sociale"
          required
          {...errorProp(err, "displayName")}
        >
          <Input
            {...f("displayName")}
            defaultValue={c.displayName}
            required
            maxLength={300}
            autoComplete="off"
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="ce-partyType" label="Tipo" required>
            <Select {...f("partyType")} defaultValue={c.partyType}>
              <option value="company">Azienda</option>
              <option value="individual">Privato</option>
              <option value="public_entity">Ente pubblico</option>
            </Select>
          </FormField>
          {text("code", "Codice", { maxLength: 30 })}
          {text("legalName", "Ragione sociale completa", { maxLength: 300 })}
          {text("vatNumber", "Partita IVA", { maxLength: 20 })}
          {text("taxCode", "Codice fiscale", { maxLength: 16, className: "uppercase" })}
          {text("sdiCode", "Codice SDI", { maxLength: 7, className: "uppercase" })}
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Contatti e indirizzo
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("email", "Email", { type: "email", maxLength: 320 })}
          {text("pecEmail", "PEC", { type: "email", maxLength: 320 })}
          {text("phone", "Telefono", { type: "tel", maxLength: 40 })}
          {text("addressLine", "Indirizzo", { maxLength: 300 })}
          <div className="grid grid-cols-[6rem_1fr_4.5rem] gap-2 sm:col-span-2">
            {text("postalCode", "CAP", { maxLength: 5, inputMode: "numeric" })}
            {text("city", "Città", { maxLength: 120 })}
            {text("province", "Prov.", { maxLength: 2, className: "uppercase" })}
          </div>
          {text("paymentTermsDays", "Pagamento a (giorni)", {
            type: "number",
            min: 0,
            max: 365,
            inputMode: "numeric",
          })}
        </div>
      </fieldset>
      <FormField id="ce-notes" label="Note" {...errorProp(err, "notes")}>
        <Textarea {...f("notes")} defaultValue={c.notes ?? ""} maxLength={10000} />
      </FormField>
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>Salva modifiche</SubmitButton>
      </div>
    </KeepValuesForm>
  );
}

export function CustomerActiveButton({
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
      title="Archiviare il cliente?"
      description={`${name} non comparirà più tra i clienti attivi né nelle scelte dei moduli. Dati, scadenze e storico restano: puoi riattivarlo quando vuoi.`}
      confirmLabel="Archivia"
      confirmVariant="primary"
      action={async () => {
        await setCustomerActiveAction(id, false);
        router.refresh();
      }}
    />
  ) : (
    <Button
      variant="secondary"
      onClick={async () => {
        await setCustomerActiveAction(id, true);
        router.refresh();
      }}
    >
      <ArchiveRestore aria-hidden /> Riattiva
    </Button>
  );
}
