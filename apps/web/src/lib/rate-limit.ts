import "server-only";
import {
  hitRateLimit,
  rateLimitMessage,
  resetRateLimit,
  type RateLimitBucket,
} from "@cantiereos/core";
import { headers } from "next/headers";
import { pool } from "./db";

/**
 * IP del client solo da `x-real-ip`, che la piattaforma (Vercel) imposta e il client
 * non può falsificare. `x-forwarded-for` non si usa: in locale lo aggiunge Next.js
 * stesso e altrove può arrivare dal browser. Senza IP vale solo il limite per account.
 */
export async function clientIp(): Promise<string | null> {
  const ip = (await headers()).get("x-real-ip");
  return ip?.trim() || null;
}

/**
 * Controlla più limiti insieme; restituisce il messaggio da mostrare se uno è superato.
 * Ogni chiamata conta come tentativo.
 */
export async function checkRateLimits(
  checks: [RateLimitBucket, string | null | undefined][],
): Promise<string | null> {
  let wait = 0;
  for (const [bucket, key] of checks) {
    const r = await hitRateLimit(pool(), bucket, key);
    if (!r.allowed) wait = Math.max(wait, r.retryAfterSeconds);
  }
  return wait > 0 ? rateLimitMessage(wait) : null;
}

export async function clearRateLimit(bucket: RateLimitBucket, key: string | null | undefined) {
  await resetRateLimit(pool(), bucket, key);
}
