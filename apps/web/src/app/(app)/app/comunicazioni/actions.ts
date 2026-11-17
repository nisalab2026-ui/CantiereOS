"use server";

import {
  createCommunication,
  deleteCommunication,
  resolveActiveTenant,
  setFollowUpDone,
  updateCommunication,
  ValidationError,
  type CommunicationInput,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { UNEXPECTED_ERROR, userMessage, type FormState } from "@/lib/messages";

/**
 * Registro comunicazioni. Registra, non invia: nessun servizio di posta è
 * configurato. Permessi e validazione nel core; RLS nel database.
 */
function readInput(form: FormData): CommunicationInput {
  const related = formText(form, "related") ?? ""; // "tipo:id" dal selettore
  const [relatedType, relatedId] = related.includes(":")
    ? related.split(":", 2)
    : [undefined, undefined];
  return {
    channel: formText(form, "channel") ?? "",
    direction: formText(form, "direction") ?? "",
    occurredAt: formText(form, "occurredAt") ?? "",
    subject: formText(form, "subject") ?? "",
    body: formText(form, "body"),
    contactName: formText(form, "contactName"),
    relatedType,
    relatedId,
    followUpDate: formText(form, "followUpDate"),
  } as CommunicationInput; // validato con zod nel core
}

function failure(error: unknown): FormState {
  if (error instanceof ValidationError) {
    const { form, ...fields } = error.fieldErrors;
    if (fields.relatedId) fields.related = fields.relatedId;
    return { error: form ?? "Controlla i campi evidenziati.", fieldErrors: fields };
  }
  const message = userMessage(error);
  if (message === UNEXPECTED_ERROR) console.error("[comunicazioni]", error);
  return { error: message };
}

function refresh(id?: string) {
  revalidatePath("/app/comunicazioni");
  if (id) revalidatePath(`/app/comunicazioni/${id}`);
  revalidatePath("/app/calendario");
}

export async function createCommunicationAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const { id } = await asCurrentUser(async (tx) =>
      createCommunication(tx, await resolveActiveTenant(tx), readInput(form)),
    );
    refresh();
    return { message: "Comunicazione registrata.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCommunicationAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      updateCommunication(
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

export async function setFollowUpDoneAction(id: string, done: boolean): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) => setFollowUpDone(tx, await resolveActiveTenant(tx), id, done));
    refresh(id);
    return { message: done ? "Richiamo fatto." : "Richiamo di nuovo da fare." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCommunicationAction(id: string): Promise<void> {
  await asCurrentUser(async (tx) => deleteCommunication(tx, await resolveActiveTenant(tx), id));
  refresh(id);
  redirect("/app/comunicazioni?eliminata=1");
}
