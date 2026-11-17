"use server";

import {
  createTask,
  deleteTask,
  resolveActiveTenant,
  setTaskStatus,
  updateTask,
  ValidationError,
  type TaskInput,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { UNEXPECTED_ERROR, userMessage, type FormState } from "@/lib/messages";

/**
 * Azioni delle attività. Azienda e utente vengono dalla sessione verificata;
 * permessi e validazione nel core; il database ricontrolla con RLS (anche la
 * regola "l'assegnatario cambia solo lo stato").
 */
function readInput(form: FormData): TaskInput {
  const subject = formText(form, "subject") ?? ""; // "tipo:id" dal selettore
  const [subjectType, subjectId] = subject.includes(":")
    ? subject.split(":", 2)
    : [undefined, undefined];
  return {
    title: formText(form, "title") ?? "",
    description: formText(form, "description"),
    priority: formText(form, "priority") || "normal",
    dueDate: formText(form, "dueDate"),
    assigneeUserId: formText(form, "assigneeUserId"),
    subjectType,
    subjectId,
  } as TaskInput; // validato con zod nel core
}

function failure(error: unknown): FormState {
  if (error instanceof ValidationError) {
    const { form, ...fields } = error.fieldErrors;
    if (fields.subjectId) fields.subject = fields.subjectId;
    return { error: form ?? "Controlla i campi evidenziati.", fieldErrors: fields };
  }
  const message = userMessage(error);
  // Errore non previsto: lo registra lato server (l'utente vede un messaggio generico).
  if (message === UNEXPECTED_ERROR) console.error("[attivita]", error);
  return { error: message };
}

function refresh(id?: string) {
  revalidatePath("/app/attivita");
  if (id) revalidatePath(`/app/attivita/${id}`);
  revalidatePath("/app/calendario");
  revalidatePath("/app");
}

export async function createTaskAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const { id } = await asCurrentUser(async (tx) =>
      createTask(tx, await resolveActiveTenant(tx), readInput(form)),
    );
    refresh();
    return { message: "Attività creata.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateTaskAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      updateTask(
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

/** Cambio di stato, anche dall'assegnatario senza permesso di modifica. */
export async function setTaskStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  const status = formText(form, "status") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      setTaskStatus(tx, await resolveActiveTenant(tx), id, {
        status,
        notes: formText(form, "notes"),
      }),
    );
    refresh(id);
    return {
      message:
        status === "done"
          ? "Attività completata."
          : status === "cancelled"
            ? "Attività annullata."
            : status === "in_progress"
              ? "Attività in corso."
              : "Attività riaperta.",
      createdId: id,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteTaskAction(id: string): Promise<void> {
  await asCurrentUser(async (tx) => deleteTask(tx, await resolveActiveTenant(tx), id));
  refresh(id);
  redirect("/app/attivita?eliminata=1");
}
