"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { archiveTemplateAction, deleteTemplateAction } from "../../actions";

export function ArchiveTemplateButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          await archiveTemplateAction(id, !archived);
          router.refresh();
        })
      }
    >
      {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
      {archived ? "Riattiva" : "Archivia"}
    </Button>
  );
}

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger-outline">
          <Trash2 aria-hidden /> Elimina
        </Button>
      }
      title="Eliminare il modello?"
      description={`«${name}» non potrà più essere usato. I moduli già compilati con questo modello restano consultabili e stampabili.`}
      confirmLabel="Elimina"
      action={async () => {
        await deleteTemplateAction(id);
      }}
    />
  );
}
