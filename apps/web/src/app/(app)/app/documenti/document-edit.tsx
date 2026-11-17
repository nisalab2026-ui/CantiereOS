"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { errorProp, fieldAttrs } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { deleteDocumentAction, updateDocumentAction } from "./actions";
import { CATEGORY_OPTIONS, type FolderOption, type SubjectOptions } from "./shared";

export interface EditableDocument {
  id: string;
  version: string;
  title: string;
  category: string;
  description: string | null;
  folderId: string | null;
  subject: string; // "tipo:id" o ""
  isConfidential: boolean;
  expiresOn: string | null;
}

const SUBJECT_GROUPS: [keyof SubjectOptions, string][] = [
  ["customer", "Clienti"],
  ["employee", "Personale"],
  ["supplier", "Fornitori"],
  ["team", "Squadre"],
];

export function EditDocumentDialog({
  doc,
  folders,
  subjects,
  canConfidential,
}: {
  doc: EditableDocument;
  folders: FolderOption[];
  subjects: SubjectOptions;
  canConfidential: boolean;
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
        <Button variant="secondary">
          <Pencil aria-hidden /> Modifica
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Modifica documento"
        description="Titolo, categoria, cartella, collegamento e scadenza. Ogni modifica resta nello storico."
        className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
      >
        <EditForm
          key={round}
          doc={doc}
          folders={folders}
          subjects={subjects}
          canConfidential={canConfidential}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  doc,
  folders,
  subjects,
  canConfidential,
  onDone,
}: {
  doc: EditableDocument;
  folders: FolderOption[];
  subjects: SubjectOptions;
  canConfidential: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(updateDocumentAction, {});
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    router.refresh();
  }, [state.createdId, onDone, router]);
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("de", err, name);
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      <input type="hidden" name="id" value={doc.id} />
      <input type="hidden" name="version" value={doc.version} />
      <FormField id="de-title" label="Titolo" required {...errorProp(err, "title")}>
        <Input
          {...f("title")}
          defaultValue={doc.title}
          required
          maxLength={200}
          autoComplete="off"
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="de-category" label="Categoria" required {...errorProp(err, "category")}>
          <Select {...f("category")} defaultValue={doc.category}>
            {CATEGORY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="de-folderId" label="Cartella" {...errorProp(err, "folderId")}>
          <Select {...f("folderId")} defaultValue={doc.folderId ?? ""}>
            <option value="">Nessuna cartella</option>
            {folders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="de-subject" label="Collegato a" {...errorProp(err, "subject")}>
          <Select {...f("subject")} defaultValue={doc.subject}>
            <option value="">Nessun collegamento</option>
            {SUBJECT_GROUPS.map(([type, label]) =>
              subjects[type] && subjects[type].length > 0 ? (
                <optgroup key={type} label={label}>
                  {subjects[type].map((o) => (
                    <option key={o.id} value={`${type}:${o.id}`}>
                      {o.name}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </Select>
        </FormField>
        <FormField
          id="de-expiresOn"
          label="Scadenza del documento"
          {...errorProp(err, "expiresOn")}
        >
          <Input {...f("expiresOn")} type="date" defaultValue={doc.expiresOn ?? ""} />
        </FormField>
      </div>
      {canConfidential && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="isConfidential"
            defaultChecked={doc.isConfidential}
            className="mt-0.5"
          />
          <span>
            Documento riservato
            <span className="block text-xs text-muted-foreground">
              Visibile solo a chi ha il permesso per i documenti riservati.
            </span>
          </span>
        </label>
      )}
      {!canConfidential && doc.isConfidential && (
        <input type="hidden" name="isConfidential" value="on" />
      )}
      <FormField id="de-description" label="Descrizione" {...errorProp(err, "description")}>
        <Textarea {...f("description")} defaultValue={doc.description ?? ""} maxLength={4000} />
      </FormField>
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>Salva modifiche</SubmitButton>
      </div>
    </KeepValuesForm>
  );
}

export function DeleteDocumentButton({ id, title }: { id: string; title: string }) {
  const [error, setError] = useState<string | undefined>();
  return (
    <>
      <ConfirmDialog
        trigger={
          <Button variant="danger-outline">
            <Trash2 aria-hidden /> Elimina
          </Button>
        }
        title="Eliminare il documento?"
        description={`«${title}» non comparirà più nell'archivio. File, versioni e cronologia restano conservati e consultabili nel registro attività.`}
        confirmLabel="Elimina documento"
        action={async () => {
          const r = await deleteDocumentAction(id);
          if (r?.error) setError(r.error);
        }}
      />
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
