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

/**
 * Content Security Policy con nonce per richiesta: solo gli script emessi da
 * Next.js con quel nonce vengono eseguiti (niente script iniettati). Lo storage
 * dei documenti è l'unica origine esterna: caricamento diretto firmato (connect),
 * anteprime di immagini e PDF (img, frame).
 */
function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  let storage = "";
  try {
    storage = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "";
  } catch {
    storage = "";
  }
  const https = process.env.APP_URL?.startsWith("https://") ?? false;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // style inline: variabili CSS per le animazioni (style="--i: 2") e Tailwind
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${storage}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${storage}`.trim(),
    `frame-src 'self' ${storage}`.trim(),
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const requestId = crypto.randomUUID();
  requestHeaders.set("x-request-id", requestId);
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  // Next.js legge il nonce dall'intestazione della richiesta e lo applica ai suoi script.
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-nonce", nonce);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
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
        response.headers.set("content-security-policy", csp);
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
