"use server";

import { updateMyProfile, ValidationError } from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { userMessage, type FormState } from "@/lib/messages";

/** Salva nome e telefono della persona collegata (mai di altri: il database usa auth.uid()). */
export async function updateProfileAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await asCurrentUser((tx) =>
      updateMyProfile(
        tx,
        { fullName: formText(form, "fullName") ?? "", phone: formText(form, "phone") },
        formText(form, "version") ?? "",
      ),
    );
    revalidatePath("/", "layout");
    return { message: "Profilo aggiornato." };
  } catch (error) {
    if (error instanceof ValidationError) {
      const { form: general, ...fields } = error.fieldErrors;
      return { error: general ?? "Controlla i campi evidenziati.", fieldErrors: fields };
    }
    return { error: userMessage(error) };
  }
}
