import { createHash } from "node:crypto";
import type pg from "pg";
import { withServiceTransaction } from "../db/transaction";

/**
 * Limite ai tentativi sulle operazioni esposte a forza bruta. I contatori stanno
 * in `app.rate_limits` (solo service_role) e le chiavi sono hash: il server non
 * salva email o IP in chiaro. Supabase Auth ha i suoi limiti; questi si aggiungono
 * e valgono anche per IP e per account, con messaggi in italiano.
 */
export const RATE_LIMITS = {
  /** Accesso: per indirizzo IP (molti account dallo stesso IP). */
  login_ip: { limit: 30, windowSeconds: 15 * 60 },
  /** Accesso: per email (molte password sullo stesso account). */
  login_email: { limit: 8, windowSeconds: 15 * 60 },
  /** Codice MFA: per utente. */
  mfa_user: { limit: 6, windowSeconds: 5 * 60 },
  /** Recupero password: per email e per IP. */
  reset_email: { limit: 3, windowSeconds: 60 * 60 },
  reset_ip: { limit: 10, windowSeconds: 60 * 60 },
  /** Registrazione: per IP. */
  signup_ip: { limit: 10, windowSeconds: 60 * 60 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const hashKey = (bucket: string, key: string) =>
  createHash("sha256").update(`${bucket}\u0000${key.trim().toLowerCase()}`).digest();

/** Registra un tentativo. Senza chiave (es. IP sconosciuto) il controllo è saltato. */
export async function hitRateLimit(
  pool: pg.Pool,
  bucket: RateLimitBucket,
  key: string | null | undefined,
): Promise<RateLimitResult> {
  if (!key) return { allowed: true, retryAfterSeconds: 0 };
  const { limit, windowSeconds } = RATE_LIMITS[bucket];
  const { rows } = await withServiceTransaction(pool, null, (tx) =>
    tx.query<{ allowed: boolean; retry_after: number }>(
      "select allowed, retry_after from app.rate_limit_hit($1, $2, $3, $4)",
      [bucket, hashKey(bucket, key), limit, windowSeconds],
    ),
  );
  return { allowed: rows[0]!.allowed, retryAfterSeconds: rows[0]!.retry_after };
}

/** Azzera il contatore (es. dopo un accesso riuscito). */
export async function resetRateLimit(
  pool: pg.Pool,
  bucket: RateLimitBucket,
  key: string | null | undefined,
): Promise<void> {
  if (!key) return;
  await withServiceTransaction(pool, null, (tx) =>
    tx.query("select app.rate_limit_reset($1, $2)", [bucket, hashKey(bucket, key)]),
  );
}

/** "Troppi tentativi. Riprova tra 4 minuti." */
export function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Troppi tentativi. Riprova tra ${minutes} ${minutes === 1 ? "minuto" : "minuti"}.`;
}
