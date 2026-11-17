import { createHash, randomInt } from "node:crypto";
import type { UserTx } from "../db/transaction";

/**
 * Codici di recupero MFA (usa e getta). 10 codici da 12 caratteri (60 bit) in un
 * alfabeto senza caratteri ambigui; nel database solo sha256(utente:codice).
 * Il codice in chiaro si mostra una sola volta, alla generazione.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // niente 0/O, 1/I
export const RECOVERY_CODE_COUNT = 10;

export function createRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < 12; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** Accetta minuscole, spazi e trattini: "abcd efgh-jklm" → "ABCDEFGHJKLM". */
export function normalizeRecoveryCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z2-9]{12}$/.test(c) ? c : null;
}

export function hashRecoveryCode(userId: string, normalized: string): Buffer {
  return createHash("sha256").update(`${userId}:${normalized}`).digest();
}

/** Nuova serie di codici (annulla la precedente). Richiede sessione aal2 (lo verifica il DB). */
export async function generateRecoveryCodes(tx: UserTx): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, createRecoveryCode);
  const hashes = codes.map((c) => hashRecoveryCode(tx.session.userId, normalizeRecoveryCode(c)!));
  await tx.query("select app.mfa_recovery_generate($1::bytea[])", [hashes]);
  return codes;
}

/** Usa un codice: true se era valido e non ancora usato. */
export async function consumeRecoveryCode(tx: UserTx, input: string): Promise<boolean> {
  const code = normalizeRecoveryCode(input);
  if (!code) return false;
  const { rows } = await tx.query<{ ok: boolean }>("select app.mfa_recovery_consume($1) as ok", [
    hashRecoveryCode(tx.session.userId, code),
  ]);
  return rows[0]?.ok === true;
}

export async function getRecoveryStatus(
  tx: UserTx,
): Promise<{ remaining: number; generatedAt: Date | null }> {
  const { rows } = await tx.query<{ remaining: number; generated_at: Date | null }>(
    "select remaining, generated_at from app.mfa_recovery_status()",
  );
  return { remaining: rows[0]?.remaining ?? 0, generatedAt: rows[0]?.generated_at ?? null };
}
