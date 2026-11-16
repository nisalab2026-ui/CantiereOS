"use server";

import {
  createCustomer,
  resolveActiveTenant,
  ValidationError,
  type CreateCustomerInput,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { asCurrentUser } from "@/lib/auth";
import { userMessage, type FormState } from "@/lib/messages";

/**
 * Crea un cliente nell'azienda attiva. L'azienda viene dalla sessione
 * verificata (mai dal modulo); permesso e validazione sono nel core, RLS nel DB.
 */
export async function createCustomerAction(_: FormState, form: FormData): Promise<FormState> {
  const field = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const input = {
    displayName: field("displayName") ?? "",
    partyType: field("partyType") ?? "",
    code: field("code"),
    vatNumber: field("vatNumber"),
    email: field("email"),
    phone: field("phone"),
    city: field("city"),
    province: field("province"),
  } as CreateCustomerInput; // validato con zod nel core
  try {
    const { id } = await asCurrentUser(async (tx) =>
      createCustomer(tx, await resolveActiveTenant(tx), input),
    );
    revalidatePath("/app/clienti");
    revalidatePath("/app");
    return { message: "Cliente creato.", createdId: id };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: "Controlla i campi evidenziati.", fieldErrors: error.fieldErrors };
    }
    return { error: userMessage(error) };
  }
}
