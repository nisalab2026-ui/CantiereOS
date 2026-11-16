import "server-only";
import {
  AuthError,
  createTokenVerifier,
  listMyCompanies,
  resolveActiveTenant,
  withUserTransaction,
  type CompanyMembership,
  type TenantAccess,
  type TokenVerifier,
  type UserTx,
  type VerifiedSession,
} from "@cantiereos/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { pool } from "./db";
import { env } from "./env";
import { createSupabaseServerClient } from "./supabase";

let verifier: TokenVerifier | undefined;
function verify(token: string | undefined) {
  const e = env();
  verifier ??= createTokenVerifier({
    issuer: e.SUPABASE_JWT_ISSUER,
    ...(e.SUPABASE_JWT_SECRET ? { hs256Secret: e.SUPABASE_JWT_SECRET } : {}),
    ...(e.SUPABASE_JWKS_URL ? { jwksUrl: e.SUPABASE_JWKS_URL } : {}),
  });
  return verifier(token);
}

/**
 * Sessione dell'utente, ricavata SOLO dal token di accesso nel cookie httpOnly
 * e verificata (firma, emittente, audience, scadenza). Un cookie manomesso
 * produce null. Memorizzata per la durata della singola richiesta.
 */
export const getVerifiedSession = cache(async (): Promise<VerifiedSession | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  try {
    return await verify(data.session.access_token);
  } catch {
    return null;
  }
});

export async function requireSession(): Promise<VerifiedSession> {
  const session = await getVerifiedSession();
  if (!session) redirect("/accedi");
  return session;
}

async function requestId(): Promise<string | undefined> {
  return (await headers()).get("x-request-id") ?? undefined;
}

/**
 * Esegue fn come utente verificato, in una transazione con RLS. Una sessione
 * revocata (logout altrove, sospensione) porta al login.
 */
export async function asCurrentUser<T>(fn: (tx: UserTx) => Promise<T>): Promise<T> {
  const session = await requireSession();
  const rid = await requestId();
  try {
    return await withUserTransaction(pool(), session, fn, rid ? { requestId: rid } : {});
  } catch (error) {
    if (error instanceof AuthError && error.code === "SESSION_REVOKED")
      redirect("/esci?motivo=revocata");
    throw error;
  }
}

export interface AppContext {
  session: VerifiedSession;
  access: TenantAccess;
  company: CompanyMembership;
  companies: CompanyMembership[];
}

/**
 * Contesto dell'area applicativa: azienda attiva e permessi, verificati nel
 * database a ogni richiesta. Senza aziende si va all'onboarding.
 */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const session = await requireSession();
  const result = await asCurrentUser(async (tx) => {
    const companies = await listMyCompanies(tx);
    if (companies.length === 0) return null;
    const access = await resolveActiveTenant(tx);
    return { companies, access };
  });
  if (!result) redirect("/benvenuto");
  const company = result.companies.find((c) => c.tenantId === result.access.tenantId)!;
  return { session, access: result.access, company, companies: result.companies };
});

/** Ruoli per cui la MFA è obbligatoria per entrare nell'area applicativa. */
export const MFA_REQUIRED_ROLES = new Set(["owner", "admin"]);

export interface MfaStatus {
  aal: "aal1" | "aal2";
  verifiedFactors: { id: string; friendlyName: string | null; createdAt: string }[];
}

export async function getMfaStatus(session: VerifiedSession): Promise<MfaStatus> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return {
    aal: session.aal,
    verifiedFactors: data.totp.map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      createdAt: f.created_at,
    })),
  };
}
