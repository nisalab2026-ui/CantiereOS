import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase";

/**
 * POST: logout. Con `scope=global` chiude TUTTE le sessioni dell'utente
 * (eliminate da auth.sessions: il server le rifiuta subito, anche se il JWT
 * non è ancora scaduto). Cookie SameSite=Lax: un sito esterno non può
 * inviare questa richiesta con la sessione dell'utente.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const scope = form.get("scope") === "global" ? "global" : "local";
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope });
  return NextResponse.redirect(new URL("/accedi?motivo=uscito", env().APP_URL), 303);
}

/** GET: usato quando il server rileva una sessione revocata; pulisce i cookie locali. */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  const reason = request.nextUrl.searchParams.get("motivo") === "revocata" ? "revocata" : "uscito";
  return NextResponse.redirect(new URL(`/accedi?motivo=${reason}`, env().APP_URL));
}
