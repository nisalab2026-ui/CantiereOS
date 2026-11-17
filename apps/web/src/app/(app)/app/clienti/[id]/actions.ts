"use server";

import {
  resolveActiveTenant,
  setCustomerActive,
  updateCustomer,
  ValidationError,
  type CustomerInput,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { userMessage, type FormState } from "@/lib/messages";

const FIELDS = [
  "displayName",
  "partyType",
  "legalName",
  "code",
  "vatNumber",
  "taxCode",
  "sdiCode",
  "pecEmail",
  "email",
  "phone",
  "addressLine",
  "postalCode",
  "city",
  "province",
  "paymentTermsDays",
  "notes",
] as const;

export async function updateCustomerAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  const input = Object.fromEntries(FIELDS.map((k) => [k, formText(form, k)])) as CustomerInput;
  try {
    await asCurrentUser(async (tx) =>
      updateCustomer(tx, await resolveActiveTenant(tx), id, input, formText(form, "version") ?? ""),
    );
    revalidatePath(`/app/clienti/${id}`);
    revalidatePath("/app/clienti");
    return { message: "Modifiche salvate.", createdId: id };
  } catch (error) {
    if (error instanceof ValidationError) {
      const { form: general, ...fields } = error.fieldErrors;
      return { error: general ?? "Controlla i campi evidenziati.", fieldErrors: fields };
    }
    return { error: userMessage(error) };
  }
}

export async function setCustomerActiveAction(id: string, active: boolean): Promise<void> {
  await asCurrentUser(async (tx) =>
    setCustomerActive(tx, await resolveActiveTenant(tx), id, active),
  );
  revalidatePath(`/app/clienti/${id}`);
  revalidatePath("/app/clienti");
  revalidatePath("/app");
}
