"use client";

import { CheckCircle2, CircleSlash, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Select } from "@/components/ui/input";
import { errorProp, fieldAttrs } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { deletePaymentAction, markPaidAction, setPaymentStatusAction } from "./actions";
import { METHODS } from "./payment-form";

/** "Registra incasso / pagamento": data, importo effettivo, modalità. */
export function MarkPaidButton({
  id,
  incoming,
  amount,
  method,
  today,
}: {
  id: string;
  incoming: boolean;
  /** importo previsto, già nel formato del campo */
  amount: string;
  method: string | null;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const label = incoming ? "Registra incasso" : "Registra pagamento";
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
          <CheckCircle2 aria-hidden /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`${label}?`}
        description="Verrà registrato chi l'ha segnato e quando. Se l'importo è diverso da quello previsto, indicalo."
      >
        <MarkPaidForm
          key={round}
          id={id}
          amount={amount}
          method={method}
          today={today}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidForm({
  id,
  amount,
  method,
  today,
  onDone,
}: {
  id: string;
  amount: string;
  method: string | null;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(markPaidAction, {});
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    router.refresh();
  }, [state.createdId, onDone, router]);
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("paid", err, name);
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="paid-paidOn" label="Data" required {...errorProp(err, "paidOn")}>
          <Input {...f("paidOn")} type="date" defaultValue={today} max={today} required />
        </FormField>
        <FormField id="paid-paidAmount" label="Importo (€)" {...errorProp(err, "paidAmount")}>
          <Input
            {...f("paidAmount")}
            defaultValue={amount}
            inputMode="decimal"
            autoComplete="off"
          />
        </FormField>
        <FormField id="paid-method" label="Modalità" {...errorProp(err, "method")}>
          <Select {...f("method")} defaultValue={method ?? ""}>
            <option value="">Non indicata</option>
            {METHODS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>Conferma</SubmitButton>
      </div>
    </KeepValuesForm>
  );
}

export function PaymentStatusButton({ id, to }: { id: string; to: "open" | "cancelled" }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  if (to === "open") {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="secondary"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await setPaymentStatusAction(id, "open");
              setError(r.error);
              router.refresh();
            })
          }
        >
          <RotateCcw aria-hidden /> Riapri
        </Button>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <ConfirmDialog
      trigger={
        <Button variant="secondary">
          <CircleSlash aria-hidden /> Annulla
        </Button>
      }
      title="Annullare il pagamento atteso?"
      description="Non sarà più considerato aperto né conteggiato nei totali. Resta nello storico e potrai riaprirlo."
      confirmLabel="Annulla pagamento"
      action={async () => {
        await setPaymentStatusAction(id, "cancelled");
        router.refresh();
      }}
    />
  );
}

export function DeletePaymentButton({ id, title }: { id: string; title: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger-outline">
          <Trash2 aria-hidden /> Elimina
        </Button>
      }
      title="Eliminare il pagamento?"
      description={`«${title}» sparirà dagli elenchi e dai totali. La sua cronologia resta consultabile nel registro attività.`}
      confirmLabel="Elimina"
      action={() => deletePaymentAction(id)}
    />
  );
}
