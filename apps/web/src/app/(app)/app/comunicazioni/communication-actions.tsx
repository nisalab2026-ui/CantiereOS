"use client";

import { BellOff, CheckCircle2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteCommunicationAction, setFollowUpDoneAction } from "./actions";

export function FollowUpButton({ id, done }: { id: string; done: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={done ? "secondary" : "primary"}
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await setFollowUpDoneAction(id, !done);
            setError(r.error);
            router.refresh();
          })
        }
      >
        {done ? <BellOff aria-hidden /> : <CheckCircle2 aria-hidden />}
        {done ? "Richiamo di nuovo da fare" : "Richiamo fatto"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function DeleteCommunicationButton({ id, title }: { id: string; title: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger-outline">
          <Trash2 aria-hidden /> Elimina
        </Button>
      }
      title="Eliminare la comunicazione?"
      description={`«${title}» sparirà dal registro delle comunicazioni. La cronologia resta nel registro attività.`}
      confirmLabel="Elimina"
      action={() => deleteCommunicationAction(id)}
    />
  );
}
