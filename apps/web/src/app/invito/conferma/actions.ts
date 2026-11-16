"use server";

import { acceptInvitation } from "@cantiereos/core";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { userMessage, type FormState } from "@/lib/messages";

export async function acceptInvite(_: FormState): Promise<FormState> {
  const store = await cookies();
  const token = store.get("cos_invite")?.value;
  if (!token)
    return { error: "Link d'invito mancante o scaduto. Riapri il link ricevuto via email." };
  try {
    await asCurrentUser((tx) => acceptInvitation(tx, token));
  } catch (error) {
    return { error: userMessage(error) };
  }
  store.delete({ name: "cos_invite", path: "/invito" });
  redirect("/app?invito=accettato");
}
