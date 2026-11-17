"use server";

import {
  completeDeadline,
  createDeadline,
  deleteDeadline,
  resolveActiveTenant,
  setDeadlineStatus,
  updateDeadline,
  ValidationError,
  type DeadlineInput,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { userMessage, type FormState } from "@/lib/messages";

/**
 * Azioni dello scadenziario. Azienda e utente vengono dalla sessione
 * verificata; permessi e validazione nel core; RLS nel database.
 */
function readInput(form: FormData): DeadlineInput {
  const subject = formText(form, "subject") ?? ""; // "tipo:id" dal selettore
  const [subjectType, subjectId] = subject.includes(":")
    ? subject.split(":", 2)
    : [undefined, undefined];
  return {
    kind: formText(form, "kind") ?? "",
    title: formText(form, "title") ?? "",
    description: formText(form, "description"),
    referenceCode: formText(form, "referenceCode"),
    dueDate: formText(form, "dueDate") ?? "",
    remindDaysBefore: formText(form, "remindDaysBefore") || "30",
    recurrenceMonths: formText(form, "recurrenceMonths"),
    subjectType,
    subjectId,
    responsibleUserId: formText(form, "responsibleUserId"),
  } as DeadlineInput; // validato con zod nel core
}

function failure(error: unknown): FormState {
  if (error instanceof ValidationError) {
    const { form, ...fields } = error.fieldErrors;
    if (fields.subjectId) fields.subject = fields.subjectId;
    return { error: form ?? "Controlla i campi evidenziati.", fieldErrors: fields };
  }
  return { error: userMessage(error) };
}

function refresh(id?: string) {
  revalidatePath("/app/scadenze");
  if (id) revalidatePath(`/app/scadenze/${id}`);
  revalidatePath("/app");
}

export async function createDeadlineAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const { id } = await asCurrentUser(async (tx) =>
      createDeadline(tx, await resolveActiveTenant(tx), readInput(form)),
    );
    refresh();
    return { message: "Scadenza creata.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateDeadlineAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      updateDeadline(
        tx,
        await resolveActiveTenant(tx),
        id,
        readInput(form),
        formText(form, "version") ?? "",
      ),
    );
    refresh(id);
    return { message: "Modifiche salvate.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function completeDeadlineAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  let nextId: string | null;
  try {
    ({ nextId } = await asCurrentUser(async (tx) =>
      completeDeadline(tx, await resolveActiveTenant(tx), id, { notes: formText(form, "notes") }),
    ));
  } catch (error) {
    return failure(error);
  }
  refresh(id);
  redirect(nextId ? `/app/scadenze/${nextId}?successiva=1` : `/app/scadenze/${id}?completata=1`);
}

export async function setDeadlineStatusAction(
  id: string,
  status: "open" | "cancelled",
): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      setDeadlineStatus(tx, await resolveActiveTenant(tx), id, status),
    );
    refresh(id);
    return { message: status === "open" ? "Scadenza riaperta." : "Scadenza annullata." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteDeadlineAction(id: string): Promise<void> {
  await asCurrentUser(async (tx) => deleteDeadline(tx, await resolveActiveTenant(tx), id));
  refresh(id);
  redirect("/app/scadenze?eliminata=1");
}
