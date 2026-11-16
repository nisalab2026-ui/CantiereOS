"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import type { FormState } from "@/lib/messages";
import { safeNext } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase";

const email = z
  .email()
  .max(320)
  .transform((e) => e.trim().toLowerCase());
const password = z.string().min(10, "La password deve avere almeno 10 caratteri.").max(72);

function callbackUrl(next: string): string {
  const url = new URL("/auth/callback", env().APP_URL);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ email, password: z.string().min(1).max(200) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Inserisci email e password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Conferma il tuo indirizzo email: ti abbiamo inviato un link." };
    }
    // Messaggio unico: non rivela se l'email esiste.
    return { error: "Email o password non corretti." };
  }
  redirect(safeNext(form.get("next"), "/app"));
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      fullName: z.string().trim().min(2).max(120),
      email,
      password,
      companyName: z.string().trim().max(200).optional(),
    })
    .safeParse({
      fullName: form.get("fullName"),
      email: form.get("email"),
      password: form.get("password"),
      companyName: form.get("companyName") || undefined,
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controlla i dati inseriti." };
  }
  if (form.get("privacy") !== "on") {
    return {
      error: "Per registrarti devi prendere visione dell'informativa sul trattamento dei dati.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const next = safeNext(form.get("next"), "/benvenuto");
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: callbackUrl(next),
      // Solo suggerimenti per precompilare l'onboarding: non usati per autorizzare.
      data: { full_name: parsed.data.fullName, company_name: parsed.data.companyName ?? null },
    },
  });
  if (error) {
    if (error.code === "weak_password") return { error: "La password è troppo debole." };
    if (error.code === "over_email_send_rate_limit") {
      return { error: "Troppi tentativi. Riprova tra qualche minuto." };
    }
    if (error.code !== "user_already_exists" && error.code !== "email_exists") {
      return { error: "Registrazione non riuscita. Riprova." };
    }
  }
  // Stessa risposta anche se l'email è già registrata (niente enumerazione).
  redirect("/verifica-email");
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Inserisci un indirizzo email valido." };
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: callbackUrl("/reimposta-password"),
  });
  return {
    message:
      "Se l'indirizzo è registrato riceverai un'email con il link per reimpostare la password. Aprilo da questo stesso browser.",
  };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = password.safeParse(form.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Password non valida." };
  if (form.get("password") !== form.get("confirm")) return { error: "Le password non coincidono." };

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session)
    return { error: "Il link non è più valido. Richiedi un nuovo recupero password." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    if (error.code === "same_password")
      return { error: "Scegli una password diversa da quella attuale." };
    if (error.code === "insufficient_aal") {
      return { error: "Verifica prima il secondo fattore (MFA), poi cambia la password." };
    }
    return { error: "Non è stato possibile aggiornare la password." };
  }
  // Cambio password: chiude tutte le altre sessioni aperte.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/app?password=aggiornata");
}

const totpCode = z.string().regex(/^\d{6}$/, "Inserisci il codice a 6 cifre.");

/** Verifica MFA (step-up aal1 → aal2) con il primo fattore TOTP verificato. */
export async function verifyMfa(_: FormState, form: FormData): Promise<FormState> {
  const parsed = totpCode.safeParse(String(form.get("code") ?? "").replace(/\s/g, ""));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Codice non valido." };
  const supabase = await createSupabaseServerClient();
  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  if (error) return { error: "Sessione non valida. Accedi di nuovo." };
  const factor = factors.totp[0];
  if (!factor) redirect("/account/sicurezza");
  const result = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data,
  });
  if (result.error) return { error: "Codice non valido o scaduto." };
  redirect(safeNext(form.get("next"), "/app"));
}
