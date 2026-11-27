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
import type { Option } from "../scadenze/deadline-form";
import { createPaymentAction, updatePaymentAction } from "./actions";
import { useOpenFromUrl } from "@/lib/open-from-url";

export const METHODS: [string, string][] = [
  ["bank_transfer", "Bonifico"],
  ["riba", "Ri.Ba."],
  ["direct_debit", "Addebito diretto (SDD)"],
  ["card", "Carta"],
  ["cash", "Contanti"],
  ["check", "Assegno"],
  ["other", "Altro"],
];

export interface PaymentDefaults {
  id?: string;
  version?: string;
  direction?: "incoming" | "outgoing";
  description?: string;
  referenceCode?: string | null;
  amount?: string;
  dueDate?: string;
  method?: string | null;
  notes?: string | null;
  counterpartyId?: string | null;
}

/** Pulsante + finestra per registrare o modificare un pagamento atteso. */
export function PaymentDialog({
  openFromUrl = false,
  mode,
  customers,
  suppliers,
  defaults,
  lockCounterparty = false,
  triggerLabel,
}: {
  /** Apre la finestra se l'indirizzo ha ?crea=1 (menu «+ Nuovo»). */
  openFromUrl?: boolean;
  mode: "create" | "edit";
  customers: Option[] | null;
  suppliers: Option[] | null;
  defaults?: PaymentDefaults;
  /** Nella scheda del cliente la controparte è già decisa. */
  lockCounterparty?: boolean;
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
          <Button>
            <Plus aria-hidden /> {triggerLabel ?? "Nuovo pagamento"}
          </Button>
        ) : (
          <Button variant="secondary">
            <Pencil aria-hidden /> Modifica
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Nuovo pagamento atteso" : "Modifica pagamento"}
        description="Un importo da incassare da un cliente o da pagare a un fornitore. Serve a non perdere le scadenze: non muove denaro. I campi con * sono obbligatori."
        className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
      >
        <PaymentForm
          key={round}
          mode={mode}
          customers={customers}
          suppliers={suppliers}
          defaults={defaults ?? {}}
          lockCounterparty={lockCounterparty}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  mode,
  customers,
  suppliers,
  defaults,
  lockCounterparty,
  onDone,
}: {
  mode: "create" | "edit";
  customers: Option[] | null;
  suppliers: Option[] | null;
  defaults: PaymentDefaults;
  lockCounterparty: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    mode === "create" ? createPaymentAction : updatePaymentAction,
    {},
  );
  const [direction, setDirection] = useState<"incoming" | "outgoing">(
    defaults.direction ?? "incoming",
  );
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    if (mode === "create") router.push(`/app/pagamenti/${state.createdId}?creato=1`);
    else router.refresh();
  }, [state.createdId, mode, onDone, router]);
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("p", err, name);
  const parties = direction === "incoming" ? customers : suppliers;
  const lockedName = lockCounterparty
    ? [...(customers ?? []), ...(suppliers ?? [])].find((o) => o.id === defaults.counterpartyId)
        ?.name
    : null;

  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.version && <input type="hidden" name="version" value={defaults.version} />}
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Tipo *</legend>
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(
            [
              ["incoming", "Da incassare"],
              ["outgoing", "Da pagare"],
            ] as const
          ).map(([v, l]) => (
            <label
              key={v}
              className={`cursor-pointer rounded-sm px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                direction === v ? "bg-accent font-medium" : "text-muted-foreground"
              } ${lockCounterparty ? "pointer-events-none opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="direction"
                value={v}
                className="sr-only"
                checked={direction === v}
                onChange={() => setDirection(v)}
                disabled={lockCounterparty && direction !== v}
              />
              {l}
            </label>
          ))}
        </div>
        {lockCounterparty && <input type="hidden" name="direction" value={direction} />}
      </fieldset>
      <FormField id="p-description" label="Descrizione" required {...errorProp(err, "description")}>
        <Input
          {...f("description")}
          defaultValue={defaults.description ?? ""}
          required
          maxLength={200}
          autoComplete="off"
          placeholder={
            direction === "incoming" ? "Es. SAL 2 lavori condominio" : "Es. Noleggio ponteggi"
          }
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="p-amount"
          label="Importo (€)"
          required
          hint="Es. 1.250,00"
          {...errorProp(err, "amount")}
        >
          <Input
            {...f("amount")}
            defaultValue={defaults.amount ?? ""}
            required
            inputMode="decimal"
            autoComplete="off"
          />
        </FormField>
        <FormField id="p-dueDate" label="Data prevista" required {...errorProp(err, "dueDate")}>
          <Input {...f("dueDate")} type="date" defaultValue={defaults.dueDate ?? ""} required />
        </FormField>
        {lockCounterparty && defaults.counterpartyId ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">
              {direction === "incoming" ? "Cliente" : "Fornitore"}
            </p>
            <p className="flex h-9 items-center rounded-sm border border-border bg-accent/40 px-3 text-sm">
              {lockedName ?? "Elemento selezionato"}
            </p>
            <input type="hidden" name="counterpartyId" value={defaults.counterpartyId} />
          </div>
        ) : (
          <FormField
            id="p-counterpartyId"
            label={direction === "incoming" ? "Cliente" : "Fornitore"}
            {...errorProp(err, "counterpartyId")}
          >
            <Select
              {...f("counterpartyId")}
              key={direction}
              defaultValue={defaults.direction === direction ? (defaults.counterpartyId ?? "") : ""}
            >
              <option value="">Nessuno</option>
              {(parties ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField
          id="p-referenceCode"
          label="Riferimento"
          hint="N. fattura, SAL, ordine"
          {...errorProp(err, "referenceCode")}
        >
          <Input
            {...f("referenceCode")}
            defaultValue={defaults.referenceCode ?? ""}
            maxLength={60}
            autoComplete="off"
          />
        </FormField>
        <FormField id="p-method" label="Modalità" {...errorProp(err, "method")}>
          <Select {...f("method")} defaultValue={defaults.method ?? ""}>
            <option value="">Non indicata</option>
            {METHODS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField id="p-notes" label="Note" {...errorProp(err, "notes")}>
        <Textarea {...f("notes")} defaultValue={defaults.notes ?? ""} maxLength={4000} />
      </FormField>
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2 pt-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>
          {mode === "create" ? "Registra pagamento" : "Salva modifiche"}
        </SubmitButton>
      </div>
    </KeepValuesForm>
  );
}
