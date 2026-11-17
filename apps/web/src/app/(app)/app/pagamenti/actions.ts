"use server";

import {
  createPayment,
  deletePayment,
  markPaymentPaid,
  resolveActiveTenant,
  setPaymentStatus,
  updatePayment,
  ValidationError,
  type PaymentInput,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { UNEXPECTED_ERROR, userMessage, type FormState } from "@/lib/messages";

/**
 * Pagamenti attesi. Azienda e utente dalla sessione verificata; permessi,
 * validazione e conversione degli importi nel core; RLS nel database.
 */
function readInput(form: FormData): PaymentInput {
  return {
    direction: formText(form, "direction") ?? "",
    description: formText(form, "description") ?? "",
    referenceCode: formText(form, "referenceCode"),
    amount: formText(form, "amount") ?? "",
    dueDate: formText(form, "dueDate") ?? "",
    method: formText(form, "method"),
    notes: formText(form, "notes"),
    counterpartyId: formText(form, "counterpartyId"),
  } as PaymentInput; // validato con zod nel core
}

function failure(error: unknown): FormState {
  if (error instanceof ValidationError) {
    const { form, ...fields } = error.fieldErrors;
    return { error: form ?? "Controlla i campi evidenziati.", fieldErrors: fields };
  }
  const message = userMessage(error);
  if (message === UNEXPECTED_ERROR) console.error("[pagamenti]", error);
  return { error: message };
}

function refresh(id?: string) {
  revalidatePath("/app/pagamenti");
  if (id) revalidatePath(`/app/pagamenti/${id}`);
  revalidatePath("/app/calendario");
  revalidatePath("/app");
}

export async function createPaymentAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const { id } = await asCurrentUser(async (tx) =>
      createPayment(tx, await resolveActiveTenant(tx), readInput(form)),
    );
    refresh();
    return { message: "Pagamento registrato.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function updatePaymentAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      updatePayment(
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

export async function markPaidAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      markPaymentPaid(tx, await resolveActiveTenant(tx), id, {
        paidOn: formText(form, "paidOn") ?? "",
        paidAmount: formText(form, "paidAmount"),
        method: formText(form, "method"),
      }),
    );
    refresh(id);
    return { message: "Saldo registrato.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function setPaymentStatusAction(
  id: string,
  status: "open" | "cancelled",
): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      setPaymentStatus(tx, await resolveActiveTenant(tx), id, status),
    );
    refresh(id);
    return { message: status === "open" ? "Pagamento riaperto." : "Pagamento annullato." };
  } catch (error) {
    return failure(error);
  }
}

export async function deletePaymentAction(id: string): Promise<void> {
  await asCurrentUser(async (tx) => deletePayment(tx, await resolveActiveTenant(tx), id));
  refresh(id);
  redirect("/app/pagamenti?eliminato=1");
}
