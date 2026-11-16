"use server";

import {
  createInvitation,
  resolveActiveTenant,
  revokeInvitation,
  switchActiveTenant,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { userMessage, type FormState } from "@/lib/messages";
import { createSupabaseServerClient } from "@/lib/supabase";

/** Cambio azienda attiva: il valore del modulo è solo una richiesta, verificata nel DB. */
export async function switchCompany(form: FormData): Promise<void> {
  const tenantId = String(form.get("tenantId") ?? "");
  await asCurrentUser((tx) => switchActiveTenant(tx, tenantId)).catch(() => undefined);
  redirect("/app");
}

const ROLE_KEYS = new Set([
  "owner",
  "admin",
  "operations_manager",
  "site_manager",
  "back_office",
  "technician",
]);

export async function inviteMember(_: FormState, form: FormData): Promise<FormState> {
  const roleKey = String(form.get("roleKey") ?? "");
  if (!ROLE_KEYS.has(roleKey)) return { error: "Seleziona un ruolo." };
  try {
    const invitation = await asCurrentUser(async (tx) => {
      const access = await resolveActiveTenant(tx);
      const created = await createInvitation(tx, access, {
        email: String(form.get("email") ?? ""),
        roleKey,
      });
      const company = await tx.query<{ name: string }>(
        "select name from public.tenants where id = $1",
        [access.tenantId],
      );
      return { ...created, companyName: company.rows[0]?.name ?? "" };
    });
    const link = new URL("/invito", env().APP_URL);
    link.searchParams.set("token", invitation.token);
    const delivery = await sendMail({
      to: invitation.email,
      subject: `Invito a ${invitation.companyName} su CantiereOS`,
      text: [
        `Sei stato invitato a unirti a ${invitation.companyName} su CantiereOS.`,
        "",
        `Apri questo link per accettare (valido fino al ${invitation.expiresAt.toLocaleDateString("it-IT")}):`,
        link.toString(),
        "",
        "Se non ti aspettavi questo invito puoi ignorare l'email.",
      ].join("\n"),
    });
    revalidatePath("/app/membri");
    if (delivery === "sent") return { message: `Invito inviato a ${invitation.email}.` };
    return {
      message:
        "Invito creato. L'invio email non è configurato su questo ambiente: consegna tu il link qui sotto (verrà mostrato solo ora).",
      detail: link.toString(),
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function revokeInvite(form: FormData): Promise<void> {
  const id = String(form.get("invitationId") ?? "");
  await asCurrentUser(async (tx) => revokeInvitation(tx, await resolveActiveTenant(tx), id));
  revalidatePath("/app/membri");
}

// --- Sicurezza account: MFA TOTP ------------------------------------------------

export interface EnrollState extends FormState {
  factorId?: string;
  qrCode?: string;
  secret?: string;
}

/** Avvia la registrazione di un'app di autenticazione (TOTP). */
export async function startMfaEnrollment(_: EnrollState): Promise<EnrollState> {
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // Elimina tentativi precedenti non completati.
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `App di autenticazione ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { error: "Non è stato possibile avviare la configurazione." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmMfaEnrollment(_: EnrollState, form: FormData): Promise<EnrollState> {
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  // Supabase Auth verifica che il fattore appartenga all'utente della sessione.
  const factorId = String(form.get("factorId") ?? "");
  if (!factorId) return { error: "Avvia di nuovo la configurazione." };
  if (!/^\d{6}$/.test(code)) return { error: "Inserisci il codice a 6 cifre." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "Codice non valido. Controlla l'ora del telefono e riprova." };
  revalidatePath("/account/sicurezza");
  return { message: "Verifica in due passaggi attivata." };
}

export async function removeMfaFactor(form: FormData): Promise<void> {
  const factorId = String(form.get("factorId") ?? "");
  const supabase = await createSupabaseServerClient();
  // Supabase Auth richiede una sessione aal2 per rimuovere un fattore verificato.
  await supabase.auth.mfa.unenroll({ factorId });
  revalidatePath("/account/sicurezza");
}
