"use client";

import { CheckCircle2, CircleSlash, Play, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Textarea } from "@/components/ui/input";
import type { FormState } from "@/lib/messages";
import { deleteTaskAction, setTaskStatusAction } from "./actions";

/**
 * Pulsanti di stato di un'attività. Compaiono solo se il server ha confermato
 * che l'utente può aggiornarla; il database ricontrolla comunque.
 */
export function TaskStatusButtons({
  id,
  status,
  canManage,
}: {
  id: string;
  status: string;
  /** tasks.write: può anche annullare */
  canManage: boolean;
}) {
  const open = status === "todo" || status === "in_progress";
  return (
    <>
      {open && <CompleteTaskButton id={id} />}
      {status === "todo" && (
        <QuickStatus id={id} to="in_progress" label="Inizia" icon={<Play aria-hidden />} />
      )}
      {!open && <QuickStatus id={id} to="todo" label="Riapri" icon={<RotateCcw aria-hidden />} />}
      {open && canManage && <CancelTaskButton id={id} />}
    </>
  );
}

function QuickStatus({
  id,
  to,
  label,
  icon,
}: {
  id: string;
  to: string;
  label: string;
  icon: React.ReactNode;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(setTaskStatusAction, {});
  useEffect(() => {
    if (state.createdId) router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={to} />
      <Button type="submit" variant="secondary" loading={pending}>
        {icon} {label}
      </Button>
      {state.error && (
        <p role="alert" className="max-w-56 text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

function CompleteTaskButton({ id }: { id: string }) {
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
        title="Completare l'attività?"
        description="Verrà registrato chi l'ha completata e quando."
      >
        <CompleteForm key={round} id={id} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CompleteForm({ id, onDone }: { id: string; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(setTaskStatusAction, {});
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    router.refresh();
  }, [state.createdId, onDone, router]);
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value="done" />
      <FormField
        id="task-complete-notes"
        label="Note (facoltative)"
        hint="Es. esito, materiale usato, cosa resta da fare"
      >
        <Textarea id="task-complete-notes" name="notes" maxLength={4000} />
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

function CancelTaskButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="secondary">
          <CircleSlash aria-hidden /> Annulla attività
        </Button>
      }
      title="Annullare l'attività?"
      description="Non comparirà più tra quelle aperte. Resta nello storico e potrai riaprirla."
      confirmLabel="Annulla attività"
      action={async () => {
        const form = new FormData();
        form.set("id", id);
        form.set("status", "cancelled");
        await setTaskStatusAction({}, form);
        router.refresh();
      }}
    />
  );
}

export function DeleteTaskButton({ id, title }: { id: string; title: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger-outline">
          <Trash2 aria-hidden /> Elimina
        </Button>
      }
      title="Eliminare l'attività?"
      description={`«${title}» sparirà dagli elenchi. La sua cronologia resta consultabile nel registro attività.`}
      confirmLabel="Elimina"
      action={() => deleteTaskAction(id)}
    />
  );
}
