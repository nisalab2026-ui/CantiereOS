"use client";

import { Printer, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteSubmissionAction, reopenSubmissionAction } from "./actions";

/** Stampa o "Salva come PDF" dal browser: la pagina ha un'impaginazione A4 dedicata. */
export function PrintButton({ label = "Stampa / PDF" }: { label?: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer aria-hidden /> {label}
    </Button>
  );
}

export function ReopenSubmissionButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmDialog
        trigger={
          <Button variant="secondary">
            <RotateCcw aria-hidden /> Riapri
          </Button>
        }
        title="Riaprire il modulo?"
        description="Tornerà modificabile. La riapertura resta nel registro attività con autore e ora; per renderlo di nuovo definitivo andrà richiuso."
        confirmLabel="Riapri"
        confirmVariant="primary"
        action={async () => {
          const r = await reopenSubmissionAction(id);
          start(() => {
            setError(r.error);
            router.refresh();
          });
        }}
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function DeleteSubmissionButton({ id, title }: { id: string; title: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger-outline">
          <Trash2 aria-hidden /> Elimina
        </Button>
      }
      title="Eliminare il modulo?"
      description={`«${title}» sparirà dagli elenchi. La sua cronologia resta consultabile nel registro attività.`}
      confirmLabel="Elimina"
      action={async () => {
        await deleteSubmissionAction(id);
      }}
    />
  );
}
