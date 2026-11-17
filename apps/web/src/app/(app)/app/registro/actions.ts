"use server";

import { resolveActiveTenant, verifyAuditChain } from "@cantiereos/core";
import { asCurrentUser } from "@/lib/auth";
import { userMessage } from "@/lib/messages";

export type ChainCheck =
  | {
      ok: true;
      valid: boolean;
      checked: number;
      firstInvalidId: string | null;
      lastHash: string | null;
      verifiedAt: string;
    }
  | { ok: false; error: string };

/** Ricalcola la catena di hash del registro dell'azienda attiva (permesso audit.read, RLS). */
export async function verifyChainAction(): Promise<ChainCheck> {
  try {
    const st = await asCurrentUser(async (tx) =>
      verifyAuditChain(tx, await resolveActiveTenant(tx)),
    );
    return { ok: true, ...st, verifiedAt: st.verifiedAt.toISOString() };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}
