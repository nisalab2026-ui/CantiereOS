"use server";

import { resolveActiveTenant, updateCompanyProfile, ValidationError } from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { userMessage, type FormState } from "@/lib/messages";

/** Dati dell'azienda ATTIVA (dalla sessione, mai dal modulo): serve tenant.manage. */
export async function updateCompanyAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      updateCompanyProfile(
        tx,
        await resolveActiveTenant(tx),
        {
          name: formText(form, "name") ?? "",
          legalName: formText(form, "legalName"),
          vatNumber: formText(form, "vatNumber"),
          taxCode: formText(form, "taxCode"),
        },
        formText(form, "version") ?? "",
      ),
    );
    revalidatePath("/", "layout");
    return { message: "Dati dell'azienda salvati." };
  } catch (error) {
    if (error instanceof ValidationError) {
      const { form: general, ...fields } = error.fieldErrors;
      return { error: general ?? "Controlla i campi evidenziati.", fieldErrors: fields };
    }
    return { error: userMessage(error) };
  }
}
