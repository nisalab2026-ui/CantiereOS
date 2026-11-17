"use client";

import type { WorkItemLine, WorkReportStatus, WorkReportTransition } from "@cantiereos/core";
import { Check, Euro, Printer, RotateCcw, Send, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Textarea } from "@/components/ui/input";
import { centsToInput } from "../../pagamenti/payment-bits";
import { changeStatusAction, deleteReportAction, savePricesAction } from "../actions";

/** Pulsanti di stato: compaiono solo quelli permessi; il database ricontrolla chi può. */
export function ReportStatusActions({
  id,
  status,
  isAuthor,
  canWrite,
  canApprove,
  canDelete,
}: {
  id: string;
  status: WorkReportStatus;
  isAuthor: boolean;
  canWrite: boolean;
  canApprove: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (a: WorkReportTransition) =>
    start(async () => {
      const r = await changeStatusAction(id, a);
      setError(r.error);
      router.refresh();
    });
  const author = isAuthor || canApprove;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={`/app/rapportini/${id}/stampa`}
          target="_blank"
          className={buttonVariants({ variant: "secondary" })}
        >
          <Printer aria-hidden /> Stampa / PDF
        </Link>
        {status === "draft" && canWrite && author && (
          <Button loading={pending} onClick={() => run("submit")} data-testid="submit-report">
            <Send aria-hidden /> Invia per l&apos;approvazione
          </Button>
        )}
        {status === "submitted" && canWrite && author && !canApprove && (
          <Button variant="secondary" loading={pending} onClick={() => run("withdraw")}>
            <Undo2 aria-hidden /> Ritira
          </Button>
        )}
        {status === "submitted" && canApprove && (
          <>
            <ReturnDialog id={id} />
            <Button loading={pending} onClick={() => run("approve")} data-testid="approve-report">
              <Check aria-hidden /> Approva
            </Button>
          </>
        )}
        {status === "approved" && canApprove && (
          <ConfirmDialog
            trigger={
              <Button variant="secondary">
                <RotateCcw aria-hidden /> Riapri
              </Button>
            }
            title="Riaprire il rapportino?"
            description="Torna bozza: ore e materiali escono dai costi della commessa finché non viene approvato di nuovo."
            confirmLabel="Riapri"
            confirmVariant="primary"
            action={async () => {
              const r = await changeStatusAction(id, "reopen");
              setError(r.error);
              router.refresh();
            }}
          />
        )}
        {canDelete && status !== "invoiced" && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" aria-label="Elimina il rapportino">
                <Trash2 aria-hidden />
              </Button>
            }
            title="Eliminare il rapportino?"
            description="Sparisce dagli elenchi e dai costi della commessa. La cronologia resta nel registro attività."
            confirmLabel="Elimina"
            action={async () => {
              const r = await deleteReportAction(id);
              setError(r.error);
            }}
          />
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function ReturnDialog({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Undo2 aria-hidden /> Restituisci
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Restituisci per correzioni"
        description="Il rapportino torna bozza all'autore, con la tua indicazione bene in vista."
      >
        <FormField id="rr-reason" label="Cosa va sistemato" required {...(error ? { error } : {})}>
          <Textarea
            id="rr-reason"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">Annulla</Button>
          </DialogClose>
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await changeStatusAction(id, "return", reason);
                if (r.error) return setError(r.fieldErrors?.reason ?? r.error);
                setOpen(false);
                router.refresh();
              })
            }
          >
            Restituisci
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Prezzi delle voci anche a rapportino approvato (solo projects.finance). */
export function PricesDialog({ id, items }: { id: string; items: WorkItemLine[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((i) => [i.id, i.unitCostCents != null ? centsToInput(i.unitCostCents) : ""]),
    ),
  );
  const [state, setState] = useState<{ error?: string; fieldErrors?: Record<string, string> }>({});
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Euro aria-hidden /> Prezzi
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Prezzi unitari"
        description="Servono per il costo reale della commessa. Li vedete solo tu e l'amministrazione."
      >
        <div className="space-y-3">
          {items.map((i) => (
            <FormField
              key={i.id}
              id={`pr-${i.id}`}
              label={`${i.description} (${i.quantity.toLocaleString("it-IT")} ${i.unit ?? ""})`}
              {...(state.fieldErrors?.[i.id] ? { error: state.fieldErrors[i.id]! } : {})}
            >
              <Input
                id={`pr-${i.id}`}
                inputMode="decimal"
                placeholder="€ unitario"
                value={prices[i.id] ?? ""}
                onChange={(e) => setPrices((p) => ({ ...p, [i.id]: e.target.value }))}
              />
            </FormField>
          ))}
        </div>
        <FormAlert error={state.error} />
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">Annulla</Button>
          </DialogClose>
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await savePricesAction(id, prices);
                setState(r);
                if (!r.error) {
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            Salva i prezzi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
