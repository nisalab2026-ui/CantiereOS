import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (ex middleware): rinnova la sessione Supabase quando il token di
 * accesso è scaduto e riscrive i cookie httpOnly; aggiunge un id richiesta per
 * l'audit. NON decide le autorizzazioni: lo fanno le pagine e le azioni sul
 * server, e il database con RLS.
 */
const PUBLIC_PATHS = [
  "/accedi",
  "/registrati",
  "/password-dimenticata",
  "/verifica-email",
  "/auth/callback",
  "/invito",
  "/esci",
];

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const requestId = crypto.randomUUID();
  requestHeaders.set("x-request-id", requestId);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return response; // la pagina mostrerà l'errore di configurazione

  const secure = process.env.NODE_ENV === "production";
  const supabase = createServerClient(url, key, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure, path: "/" },
    auth: { flowType: "pkce", autoRefreshToken: false, detectSessionInUrl: false },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            sameSite: "lax",
            secure,
          });
        }
      },
    },
  });

  // Rinnova il token se scaduto (scrive i nuovi cookie tramite setAll).
  const { data } = await supabase.auth.getSession();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  if (!data.session && !isPublic && path !== "/") {
    const login = request.nextUrl.clone();
    login.pathname = "/accedi";
    login.search = "";
    const redirect = NextResponse.redirect(login);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
