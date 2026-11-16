import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "./env";

/**
 * Cookie di sessione: httpOnly (illeggibili da JavaScript nel browser),
 * SameSite=Lax, Secure in produzione. Il browser non usa mai il client
 * Supabase: login, MFA e logout passano da Server Actions.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Client Supabase Auth per Server Components, Server Actions e Route Handlers. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    auth: { flowType: "pkce", autoRefreshToken: false, detectSessionInUrl: false },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
          }
        } catch {
          // Nei Server Components i cookie non sono scrivibili: il rinnovo
          // della sessione avviene in src/proxy.ts.
        }
      },
    },
  });
}
