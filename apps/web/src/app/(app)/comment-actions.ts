"use server";

import {
  addComment,
  deleteComment,
  editComment,
  resolveActiveTenant,
  ValidationError,
} from "@cantiereos/core";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { UNEXPECTED_ERROR, userMessage, type FormState } from "@/lib/messages";

/**
 * Commenti interni. L'elemento commentato arriva dal modulo, ma il database
 * verifica che sia della propria azienda e visibile all'utente (RLS); solo
 * l'autore modifica il testo.
 */
function failure(error: unknown): FormState {
  if (error instanceof ValidationError) {
    const { form, ...fields } = error.fieldErrors;
    return { error: form ?? fields.body ?? "Controlla il testo.", fieldErrors: fields };
  }
  const message = userMessage(error);
  if (message === UNEXPECTED_ERROR) console.error("[commenti]", error);
  return { error: message };
}

export async function addCommentAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const { id } = await asCurrentUser(async (tx) =>
      addComment(
        tx,
        await resolveActiveTenant(tx),
        { table: formText(form, "table") ?? "", id: formText(form, "subjectId") ?? "" },
        { body: formText(form, "body") ?? "" },
      ),
    );
    return { message: "Commento aggiunto.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function editCommentAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      editComment(tx, await resolveActiveTenant(tx), id, { body: formText(form, "body") ?? "" }),
    );
    return { message: "Commento modificato.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCommentAction(id: string): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) => deleteComment(tx, await resolveActiveTenant(tx), id));
    return { message: "Commento eliminato." };
  } catch (error) {
    return failure(error);
  }
}
