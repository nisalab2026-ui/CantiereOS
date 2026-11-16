import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase";

const OTP_TYPES = new Set<EmailOtpType>(["signup", "email", "recovery", "invite", "email_change"]);

/**
 * Ritorno dai link email di Supabase Auth (conferma, recupero password).
 * Supporta il flusso PKCE (`code`) e i template con `token_hash`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get("next"), "/app");
  const base = env().APP_URL;
  const supabase = await createSupabaseServerClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  return NextResponse.redirect(new URL(ok ? next : "/accedi?motivo=link-non-valido", base));
}
