"use client";

import type { WorkOrderStatus, WorkOrderTransition } from "@cantiereos/core";
import { Ban, CheckCircle2, Pause, Play, RotateCcw, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { deleteWorkOrderAction, workOrderNotesAction, workOrderStatusAction } from "./actions";

/**
 * Un'azione principale alla volta (Inizia → Completa), le altre accanto.
 * Compaiono solo i passaggi permessi; il database ricontrolla.
 */
export function WorkOrderStatusActions({
  id,
  status,
  isMine,
  canPlan,
  canDelete = false,
  size = "md",
}: {
  id: string;
  status: WorkOrderStatus;
  isMine: boolean;
  canPlan: boolean;
  canDelete?: boolean;
  /** "lg" = pulsanti grandi per il telefono */
  size?: "md" | "lg";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const field = isMine || canPlan;
  const run = (a: WorkOrderTransition, reason?: string) =>
    start(async () => {
      const r = await workOrderStatusAction(id, a, reason);
      setError(r.error ?? Object.values(r.fieldErrors ?? {})[0]);
      setMessage(r.message);
      router.refresh();
    });
  const big = size === "lg" ? "h-12 w-full text-base" : "";

  return (
    <div className={cn("flex flex-col gap-2", size === "md" && "items-end")}>
      <div className={cn("flex flex-wrap gap-2", size === "lg" ? "flex-col" : "justify-end")}>
        {field && status === "scheduled" && (
          <Button
            className={big}
            loading={pending}
            onClick={() => run("start")}
            data-testid="wo-start"
          >
            <Play aria-hidden /> Inizia
          </Button>
        )}
        {field && (status === "in_progress" || status === "suspended") && (
          <Button
            className={big}
            loading={pending}
            onClick={() => run("complete")}
            data-testid="wo-complete"
          >
            <CheckCircle2 aria-hidden /> Completa
          </Button>
        )}
        {field && status === "suspended" && (
          <Button
            variant="secondary"
            className={big}
            loading={pending}
            onClick={() => run("resume")}
          >
            <Play aria-hidden /> Riprendi
          </Button>
        )}
        {field && (status === "scheduled" || status === "in_progress") && (
          <ReasonDialog
            title="Sospendi l'intervento"
            description="Scrivi perché: l'ufficio lo vede subito."
            label="Sospendi"
            icon={<Pause aria-hidden />}
            className={big}
            onConfirm={(r) => run("suspend", r)}
            testId="wo-suspend"
          />
        )}
        {canPlan &&
          (status === "scheduled" || status === "in_progress" || status === "suspended") && (
            <ReasonDialog
              title="Annulla l'intervento"
              description="La squadra riceve un avviso con il motivo."
              label="Annulla intervento"
              icon={<Ban aria-hidden />}
              className={big}
              onConfirm={(r) => run("cancel", r)}
              danger
            />
          )}
        {canPlan && status === "completed" && (
          <Button
            variant="secondary"
            className={big}
            loading={pending}
            onClick={() => run("reopen")}
          >
            <RotateCcw aria-hidden /> Riapri
          </Button>
        )}
        {canPlan && status === "cancelled" && (
          <Button
            variant="secondary"
            className={big}
            loading={pending}
            onClick={() => run("restore")}
          >
            <RotateCcw aria-hidden /> Ripristina
          </Button>
        )}
        {canDelete && (
          <ConfirmDialog
            trigger={
              <Button variant="secondary" className={big}>
                <Trash2 aria-hidden /> Elimina
              </Button>
            }
            title="Eliminare l'intervento?"
            description="Sparisce dal calendario della squadra. La cronologia resta nel registro attività."
            confirmLabel="Elimina"
            action={async () => {
              const r = await deleteWorkOrderAction(id);
              if (r?.error) setError(r.error);
            }}
          />
        )}
      </div>
      <FormAlert error={error} message={message} />
    </div>
  );
}

function ReasonDialog({
  title,
  description,
  label,
  icon,
  className,
  onConfirm,
  danger = false,
  testId,
}: {
  title: string;
  description: string;
  label: string;
  icon: React.ReactNode;
  className: string;
  onConfirm: (reason: string) => void;
  danger?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className={className} data-testid={testId}>
          {icon} {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            onConfirm(reason.trim());
            setOpen(false);
          }}
        >
          <FormField id="wo-reason" label="Motivo" required>
            <Textarea
              id="wo-reason"
              required
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Es. Manca il ricambio, cliente assente"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary" type="button">
                Indietro
              </Button>
            </DialogClose>
            <Button type="submit" variant={danger ? "danger" : "primary"}>
              {label}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Note dal campo: le scrive chi è in squadra, le legge l'ufficio. */
export function FieldNotes({
  id,
  notes,
  canEdit,
}: {
  id: string;
  notes: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(notes ?? "");
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ error?: string; message?: string }>({});
  if (!canEdit) {
    return notes ? (
      <p className="text-sm whitespace-pre-line">{notes}</p>
    ) : (
      <p className="text-sm text-muted-foreground">Nessuna nota.</p>
    );
  }
  return (
    <div className="space-y-2">
      <Textarea
        aria-label="Note dal campo"
        rows={3}
        maxLength={4000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Cosa hai trovato, cosa manca, cosa serve la prossima volta"
        data-testid="wo-notes"
      />
      <div className="flex items-center justify-between gap-2">
        <FormAlert error={state.error} message={state.message} />
        <Button
          variant="secondary"
          size="sm"
          loading={pending}
          disabled={value === (notes ?? "")}
          onClick={() =>
            start(async () => {
              const r = await workOrderNotesAction(id, value);
              setState({
                ...(r.error ? { error: r.error } : {}),
                ...(r.message ? { message: r.message } : {}),
              });
              router.refresh();
            })
          }
        >
          <Save aria-hidden /> Salva note
        </Button>
      </div>
    </div>
  );
}
