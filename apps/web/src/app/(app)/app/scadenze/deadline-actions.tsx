"use client";

import { CheckCircle2, CircleSlash, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Textarea } from "@/components/ui/input";
import type { FormState } from "@/lib/messages";
import { completeDeadlineAction, deleteDeadlineAction, setDeadlineStatusAction } from "./actions";

/** "Segna come completata", con note facoltative; se ricorrente apre la successiva. */
export function CompleteDeadlineButton({ id, recurring }: { id: string; recurring: boolean }) {
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
          <CheckCircle2 aria-hidden /> Segna come completata
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Completare la scadenza?"
        description={
          recurring
            ? "Verrà registrato chi l'ha completata e quando. Essendo ricorrente, si crea subito la prossima scadenza."
            : "Verrà registrato chi l'ha completata e quando."
        }
      >
        <CompleteForm key={round} id={id} />
      </DialogContent>
    </Dialog>
  );
}

function CompleteForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(completeDeadlineAction, {});
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <FormField
        id="complete-notes"
        label="Note (facoltative)"
        hint="Es. esito del controllo, numero del nuovo certificato"
      >
        <Textarea id="complete-notes" name="notes" maxLength={4000} />
      </FormField>
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>Completa</SubmitButton>
      </div>
    </KeepValuesForm>
  );
}

export function DeadlineStatusButton({ id, to }: { id: string; to: "open" | "cancelled" }) {
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
              const r = await setDeadlineStatusAction(id, "open");
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
          <CircleSlash aria-hidden /> Annulla scadenza
        </Button>
      }
      title="Annullare la scadenza?"
      description="Non sarà più considerata aperta né genererà avvisi. Resta nello storico e potrai riaprirla."
      confirmLabel="Annulla scadenza"
      action={async () => {
        await setDeadlineStatusAction(id, "cancelled");
        router.refresh();
      }}
    />
  );
}

export function DeleteDeadlineButton({ id, title }: { id: string; title: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger-outline">
          <Trash2 aria-hidden /> Elimina
        </Button>
      }
      title="Eliminare la scadenza?"
      description={`«${title}» sparirà dagli elenchi. La sua cronologia resta consultabile nel registro attività.`}
      confirmLabel="Elimina"
      action={() => deleteDeadlineAction(id)}
    />
  );
}
