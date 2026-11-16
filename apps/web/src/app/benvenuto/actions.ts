"use server";

import { registerCompany } from "@cantiereos/core";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { userMessage, type FormState } from "@/lib/messages";

export async function createCompany(_: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("companyName") ?? "");
  const fullName = String(form.get("fullName") ?? "")
    .trim()
    .slice(0, 120);
  try {
    await asCurrentUser(async (tx) => {
      if (fullName.length >= 2) {
        await tx.query("update public.users set full_name = $1 where id = auth.uid()", [fullName]);
      }
      await registerCompany(tx, { name });
    });
  } catch (error) {
    return { error: userMessage(error) };
  }
  redirect("/app?azienda=creata");
}
