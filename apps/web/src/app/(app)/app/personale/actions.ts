"use server";

import {
  createEmployee,
  linkEmployeeAccount,
  resolveActiveTenant,
  setEmployeeActive,
  updateEmployee,
  ValidationError,
  type EmployeeInput,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { userMessage, type FormState } from "@/lib/messages";

const FIELDS = [
  "firstName",
  "lastName",
  "code",
  "email",
  "phone",
  "jobTitle",
  "employmentType",
  "hireDate",
  "terminationDate",
  "notes",
] as const;

function read(form: FormData): EmployeeInput {
  return Object.fromEntries(FIELDS.map((k) => [k, formText(form, k)])) as EmployeeInput;
}

function failure(error: unknown): FormState {
  if (error instanceof ValidationError) {
    const { form, ...fields } = error.fieldErrors;
    return { error: form ?? "Controlla i campi evidenziati.", fieldErrors: fields };
  }
  return { error: userMessage(error) };
}

function refresh(id?: string) {
  revalidatePath("/app/personale");
  if (id) revalidatePath(`/app/personale/${id}`);
  revalidatePath("/app");
}

export async function createEmployeeAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const { id } = await asCurrentUser(async (tx) =>
      createEmployee(tx, await resolveActiveTenant(tx), read(form)),
    );
    refresh();
    return { message: "Persona aggiunta.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateEmployeeAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      updateEmployee(
        tx,
        await resolveActiveTenant(tx),
        id,
        read(form),
        formText(form, "version") ?? "",
      ),
    );
    refresh(id);
    return { message: "Modifiche salvate.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function setEmployeeActiveAction(id: string, active: boolean): Promise<void> {
  await asCurrentUser(async (tx) =>
    setEmployeeActive(tx, await resolveActiveTenant(tx), id, active),
  );
  refresh(id);
}

/** Collega la persona al suo account: così vede i suoi interventi nella web app /campo. */
export async function linkEmployeeAccountAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  const userId = formText(form, "userId") ?? null;
  try {
    await asCurrentUser(async (tx) =>
      linkEmployeeAccount(tx, await resolveActiveTenant(tx), id, userId),
    );
    refresh(id);
    return { message: userId ? "Account collegato." : "Account scollegato." };
  } catch (error) {
    return failure(error);
  }
}
