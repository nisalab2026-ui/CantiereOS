import "server-only";
import { env } from "./env";

/**
 * API amministrativa di Supabase Auth, solo dal server e solo con
 * SUPABASE_SERVICE_ROLE_KEY. Usata per rimuovere i fattori MFA dopo un codice
 * di recupero valido (l'utente non ha più il telefono).
 */
export function authAdminConfigured(): boolean {
  return Boolean(env().SUPABASE_SERVICE_ROLE_KEY);
}

export async function deleteMfaFactors(userId: string, factorIds: string[]): Promise<boolean> {
  const e = env();
  if (!e.SUPABASE_SERVICE_ROLE_KEY) return false;
  const base = e.SUPABASE_URL.replace(/\/$/, "");
  for (const factorId of factorIds) {
    const r = await fetch(
      `${base}/auth/v1/admin/users/${encodeURIComponent(userId)}/factors/${encodeURIComponent(factorId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: e.SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!r.ok && r.status !== 404) return false;
  }
  return true;
}
