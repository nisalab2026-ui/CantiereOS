"use client";

import type { FormCustomerOption } from "@cantiereos/core";
import { FilePlus2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Select } from "@/components/ui/input";
import { errorProp } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { createSubmissionAction } from "./actions";
import { useOpenFromUrl } from "@/lib/open-from-url";

/** "Nuovo modulo": modello, cliente e sede; i dati automatici li prende il server. */
export function NewSubmissionDialog({
  openFromUrl = false,
  templates,
  customers,
  defaults = {},
  triggerLabel = "Compila un modulo",
  variant = "primary",
}: {
  /** Apre la finestra se l'indirizzo ha ?crea=1 (menu «+ Nuovo»). */
  openFromUrl?: boolean;
  templates: { id: string; name: string }[];
  customers: FormCustomerOption[];
  defaults?: { templateId?: string; customerId?: string; projectId?: string };
  triggerLabel?: string;
  variant?: "primary" | "secondary";
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
        <Button variant={variant}>
          <FilePlus2 aria-hidden /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nuovo modulo"
        description="Scegli il modello e, se serve, il cliente e la sede: committente e indirizzi si compilano da soli."
      >
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Non ci sono modelli pubblicati. Creane uno in «Modelli» o parti da un modello pronto.
          </p>
        ) : (
          <NewSubmissionForm
            key={round}
            templates={templates}
            customers={customers}
            defaults={defaults}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewSubmissionForm({
  templates,
  customers,
  defaults,
}: {
  templates: { id: string; name: string }[];
  customers: FormCustomerOption[];
  defaults: { templateId?: string; customerId?: string; projectId?: string };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(createSubmissionAction, {});
  const [customerId, setCustomerId] = useState(defaults.customerId ?? "");
  useEffect(() => {
    if (state.createdId) router.push(`/app/moduli/${state.createdId}?nuovo=1`);
  }, [state.createdId, router]);
  const err = state.fieldErrors ?? {};
  const customer = customers.find((c) => c.id === customerId);
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      <FormField id="ns-templateId" label="Modello" required {...errorProp(err, "templateId")}>
        <Select
          id="ns-templateId"
          name="templateId"
          required
          defaultValue={defaults.templateId ?? (templates.length === 1 ? templates[0]!.id : "")}
        >
          {templates.length > 1 && <option value="">Scegli…</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="ns-customerId" label="Cliente" {...errorProp(err, "customerId")}>
          <Select
            id="ns-customerId"
            name="customerId"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Nessuno</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="ns-siteId" label="Sede" {...errorProp(err, "siteId")}>
          <Select id="ns-siteId" name="siteId" key={customerId} disabled={!customer?.sites.length}>
            <option value="">{customer?.sites.length ? "Nessuna" : "—"}</option>
            {customer?.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
        {customer && customer.projects.length > 0 && (
          <div className="sm:col-span-2">
            <FormField
              id="ns-projectId"
              label="Commessa"
              hint="Il modulo entra nel riepilogo della commessa."
              {...errorProp(err, "projectId")}
            >
              <Select
                id="ns-projectId"
                name="projectId"
                key={customerId}
                defaultValue={
                  customer.projects.some((p) => p.id === defaults.projectId)
                    ? defaults.projectId
                    : ""
                }
              >
                <option value="">Nessuna</option>
                {customer.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        )}
      </div>
      <FormField
        id="ns-title"
        label="Titolo"
        hint="Facoltativo: se vuoto si usa il nome del modello."
        {...errorProp(err, "title")}
      >
        <Input id="ns-title" name="title" maxLength={200} autoComplete="off" />
      </FormField>
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>Inizia la compilazione</SubmitButton>
      </div>
    </KeepValuesForm>
  );
}
