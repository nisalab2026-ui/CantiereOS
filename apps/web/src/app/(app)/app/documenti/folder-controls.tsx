"use client";

import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input } from "@/components/ui/input";
import { errorProp } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { createFolderAction, deleteFolderAction, renameFolderAction } from "./actions";

/** Nuova cartella (dentro quella aperta, se c'è) oppure rinomina di una cartella. */
export function FolderDialog({
  mode,
  parentId,
  parentName,
  folder,
}: {
  mode: "create" | "rename";
  parentId?: string | undefined;
  parentName?: string | undefined;
  folder?: { id: string; name: string };
}) {
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
        {mode === "create" ? (
          <Button variant="secondary">
            <FolderPlus aria-hidden /> Nuova cartella
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            <Pencil aria-hidden /> Rinomina
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Nuova cartella" : "Rinomina cartella"}
        description={
          mode === "create"
            ? parentName
              ? `Verrà creata dentro «${parentName}».`
              : "Verrà creata al primo livello dell'archivio."
            : "Il nuovo nome vale per tutti; la modifica resta nello storico."
        }
      >
        <FolderForm
          key={round}
          mode={mode}
          parentId={parentId}
          folder={folder}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function FolderForm({
  mode,
  parentId,
  folder,
  onDone,
}: {
  mode: "create" | "rename";
  parentId?: string | undefined;
  folder?: { id: string; name: string } | undefined;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    mode === "create" ? createFolderAction : renameFolderAction,
    {},
  );
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    if (mode === "create") router.push(`/app/documenti?folder=${state.createdId}`);
    else router.refresh();
  }, [state.createdId, mode, onDone, router]);
  const err = state.fieldErrors ?? {};
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      {folder && <input type="hidden" name="id" value={folder.id} />}
      <FormField id="folder-name" label="Nome" required {...errorProp(err, "name")}>
        <Input
          id="folder-name"
          name="name"
          defaultValue={folder?.name ?? ""}
          required
          maxLength={120}
          autoComplete="off"
          placeholder="Es. Contratti, Sicurezza, Cantiere Via Roma"
        />
      </FormField>
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>
          {mode === "create" ? "Crea cartella" : "Salva"}
        </SubmitButton>
      </div>
    </KeepValuesForm>
  );
}

export function DeleteFolderButton({ id, name }: { id: string; name: string }) {
  const [error, setError] = useState<string | undefined>();
  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="sm">
            <Trash2 aria-hidden /> Elimina cartella
          </Button>
        }
        title="Eliminare la cartella?"
        description={`«${name}» verrà eliminata solo se è vuota (nessun documento e nessuna sottocartella).`}
        confirmLabel="Elimina"
        action={async () => {
          const r = await deleteFolderAction(id);
          if (r?.error) setError(r.error);
        }}
      />
      {error && (
        <p className="max-w-xs text-right text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
