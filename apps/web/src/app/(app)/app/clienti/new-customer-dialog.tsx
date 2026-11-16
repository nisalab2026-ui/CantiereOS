"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/input";
import type { FormState } from "@/lib/messages";
import { createCustomerAction } from "./actions";

/** "Nuovo cliente": compare solo se il server conferma customers.write. */
export function NewCustomerDialog() {
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
        <Button>
          <Plus aria-hidden /> Nuovo cliente
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nuovo cliente"
        description="I campi con * sono obbligatori. Gli altri puoi completarli dopo."
      >
        <CustomerForm key={round} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState<FormState, FormData>(createCustomerAction, {});
  useEffect(() => {
    if (state.createdId) {
      onDone();
      router.push(`/app/clienti?id=${state.createdId}&creato=1`);
    }
  }, [state.createdId, onDone, router]);
  const err = state.fieldErrors ?? {};
  const field = (name: string) => ({
    id: `c-${name}`,
    name,
    "aria-invalid": err[name] ? true : undefined,
    "aria-describedby": err[name] ? `c-${name}-error` : undefined,
  });
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormField
        id="c-displayName"
        label="Nome o ragione sociale"
        required
        {...(err.displayName ? { error: err.displayName } : {})}
      >
        <Input {...field("displayName")} required maxLength={300} autoComplete="off" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="c-partyType" label="Tipo" required>
          <Select {...field("partyType")} defaultValue="company">
            <option value="company">Azienda</option>
            <option value="individual">Privato</option>
            <option value="public_entity">Ente pubblico</option>
          </Select>
        </FormField>
        <FormField
          id="c-code"
          label="Codice"
          hint="Facoltativo, es. C001"
          {...(err.code ? { error: err.code } : {})}
        >
          <Input {...field("code")} maxLength={30} autoComplete="off" />
        </FormField>
        <FormField
          id="c-vatNumber"
          label="Partita IVA"
          {...(err.vatNumber ? { error: err.vatNumber } : {})}
        >
          <Input {...field("vatNumber")} maxLength={20} autoComplete="off" />
        </FormField>
        <FormField id="c-email" label="Email" {...(err.email ? { error: err.email } : {})}>
          <Input {...field("email")} type="email" maxLength={320} autoComplete="off" />
        </FormField>
        <FormField id="c-phone" label="Telefono" {...(err.phone ? { error: err.phone } : {})}>
          <Input {...field("phone")} type="tel" maxLength={40} autoComplete="off" />
        </FormField>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <FormField id="c-city" label="Città" {...(err.city ? { error: err.city } : {})}>
            <Input {...field("city")} maxLength={120} autoComplete="off" />
          </FormField>
          <FormField
            id="c-province"
            label="Prov."
            {...(err.province ? { error: err.province } : {})}
          >
            <Input {...field("province")} maxLength={2} autoComplete="off" className="uppercase" />
          </FormField>
        </div>
      </div>
      {state.error && (
        <p
          role="alert"
          data-testid="form-error"
          className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton>Crea cliente</SubmitButton>
      </div>
    </form>
  );
}
