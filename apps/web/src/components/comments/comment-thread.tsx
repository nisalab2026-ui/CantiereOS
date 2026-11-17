"use client";

import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction,
} from "@/app/(app)/comment-actions";
import { SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { Textarea } from "@/components/ui/input";
import type { FormState } from "@/lib/messages";

export interface CommentView {
  id: string;
  body: string;
  authorName: string;
  when: string;
  edited: string | null;
  mine: boolean;
}

export function CommentThread({
  table,
  subjectId,
  comments,
  canWrite,
  canModerate,
}: {
  table: string;
  subjectId: string;
  comments: CommentView[];
  canWrite: boolean;
  canModerate: boolean;
}) {
  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="size-4" aria-hidden /> Nessun commento.
          {canWrite ? " Scrivi il primo per tenere informato il team." : ""}
        </p>
      ) : (
        <ol className="space-y-3" aria-label="Commenti">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              canEdit={c.mine && canWrite}
              canDelete={c.mine || canModerate}
            />
          ))}
        </ol>
      )}
      {canWrite && <Composer table={table} subjectId={subjectId} />}
    </div>
  );
}

function CommentItem({
  comment: c,
  canEdit,
  canDelete,
}: {
  comment: CommentView;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <li className="rounded-md border border-border bg-background p-3" data-testid="comment">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium">{c.authorName}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {c.when}
          {c.edited ? <span title={`Modificato il ${c.edited}`}> · modificato</span> : null}
        </p>
      </div>
      {editing ? (
        <EditForm
          comment={c}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="mt-1 text-sm break-words whitespace-pre-wrap">{c.body}</p>
      )}
      {!editing && (canEdit || canDelete) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil aria-hidden /> Modifica
            </Button>
          )}
          {canDelete && (
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="ghost">
                  <Trash2 aria-hidden /> Elimina
                </Button>
              }
              title="Eliminare il commento?"
              description={
                c.mine
                  ? "Sparirà dalla discussione. Resta traccia nel registro attività."
                  : `Stai eliminando un commento di ${c.authorName}. Resta traccia nel registro attività.`
              }
              confirmLabel="Elimina"
              action={async () => {
                const r = await deleteCommentAction(c.id);
                setError(r.error);
                if (!r.error) router.refresh();
              }}
            />
          )}
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function EditForm({
  comment,
  onDone,
  onCancel,
}: {
  comment: CommentView;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(editCommentAction, {});
  useEffect(() => {
    if (state.createdId) onDone();
  }, [state.createdId, onDone]);
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="id" value={comment.id} />
      <label htmlFor={`edit-${comment.id}`} className="sr-only">
        Modifica commento
      </label>
      <Textarea
        id={`edit-${comment.id}`}
        name="body"
        defaultValue={comment.body}
        maxLength={4000}
        required
        rows={3}
      />
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Annulla
        </Button>
        <SubmitButton pending={pending} className="h-8 px-3">
          Salva
        </SubmitButton>
      </div>
    </form>
  );
}

function Composer({ table, subjectId }: { table: string; subjectId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(addCommentAction, {});
  useEffect(() => {
    if (!state.createdId) return;
    formRef.current?.reset();
    router.refresh();
  }, [state.createdId, router]);
  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <label htmlFor={`comment-${subjectId}`} className="text-sm font-medium">
        Nuovo commento
      </label>
      <Textarea
        id={`comment-${subjectId}`}
        name="body"
        maxLength={4000}
        required
        rows={3}
        placeholder="Aggiornamenti, accordi presi, cose da sapere…"
      />
      <FormAlert error={state.error} />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Pubblica commento</SubmitButton>
      </div>
    </form>
  );
}
