"use server";

import {
  changeWorkOrderStatus,
  createWorkOrder,
  deleteWorkOrder,
  resolveActiveTenant,
  saveWorkOrderNotes,
  updateWorkOrder,
  ValidationError,
  type WorkOrderSaveInput,
  type WorkOrderTransition,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { UNEXPECTED_ERROR, userMessage, type FormState } from "@/lib/messages";

/**
 * Interventi (ADR-017). Azienda e utente dalla sessione verificata; permessi e
 * validazione nel core; chi è in squadra e cosa può cambiare lo decide il database.
 */
function failure(error: unknown): FormState {
  if (error instanceof ValidationError) {
    const { form, ...fields } = error.fieldErrors;
    return { error: form ?? "Controlla i campi evidenziati.", fieldErrors: fields };
  }
  const message = userMessage(error);
  if (message === UNEXPECTED_ERROR) console.error("[interventi]", error);
  return { error: message };
}

function refresh(id?: string) {
  revalidatePath("/app/interventi");
  if (id) revalidatePath(`/app/interventi/${id}`);
}

function readForm(form: FormData): WorkOrderSaveInput {
  const t = (k: string) => {
    const v = formText(form, k)?.trim();
    return v ? v : undefined;
  };
  const opt = <K extends string>(k: K) => (t(k) ? { [k]: t(k) } : {}) as Record<K, string>;
  return {
    title: t("title") ?? "",
    kind: (t("kind") ?? "other") as WorkOrderSaveInput["kind"],
    priority: (t("priority") ?? "normal") as WorkOrderSaveInput["priority"],
    date: t("date") ?? "",
    startTime: t("startTime") ?? "",
    endTime: t("endTime") ?? "",
    employeeIds: form.getAll("employeeIds").filter((v): v is string => typeof v === "string"),
    ...opt("customerId"),
    ...opt("customerSiteId"),
    ...opt("projectId"),
    ...opt("projectSiteId"),
    ...opt("endDate"),
    ...opt("addressLine"),
    ...opt("postalCode"),
    ...opt("city"),
    ...opt("province"),
    ...opt("description"),
    ...opt("leadEmployeeId"),
    ...opt("teamId"),
  };
}

export async function createWorkOrderAction(_: FormState, form: FormData): Promise<FormState> {
  let id: string;
  try {
    ({ id } = await asCurrentUser(async (tx) =>
      createWorkOrder(tx, await resolveActiveTenant(tx), readForm(form)),
    ));
  } catch (error) {
    return failure(error);
  }
  refresh(id);
  redirect(`/app/interventi/${id}?creato=1`);
}

export async function updateWorkOrderAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      updateWorkOrder(tx, await resolveActiveTenant(tx), id, readForm(form)),
    );
  } catch (error) {
    return failure(error);
  }
  refresh(id);
  redirect(`/app/interventi/${id}?salvato=1`);
}

export async function workOrderStatusAction(
  id: string,
  action: WorkOrderTransition,
  reason?: string,
): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      changeWorkOrderStatus(tx, await resolveActiveTenant(tx), id, action, reason),
    );
    refresh(id);
    const done: Record<WorkOrderTransition, string> = {
      start: "Intervento iniziato.",
      suspend: "Intervento sospeso.",
      resume: "Intervento ripreso.",
      complete: "Intervento completato.",
      cancel: "Intervento annullato: la squadra è stata avvisata.",
      reopen: "Intervento riaperto.",
      restore: "Intervento ripristinato: torna da svolgere.",
    };
    return { message: done[action] };
  } catch (error) {
    return failure(error);
  }
}

export async function workOrderNotesAction(id: string, notes: string): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      saveWorkOrderNotes(tx, await resolveActiveTenant(tx), id, notes),
    );
    refresh(id);
    return { message: "Note salvate." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteWorkOrderAction(id: string): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) => deleteWorkOrder(tx, await resolveActiveTenant(tx), id));
  } catch (error) {
    return failure(error);
  }
  refresh();
  redirect("/app/interventi?eliminato=1");
}
