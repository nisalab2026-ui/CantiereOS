import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { AuthError } from "./errors";

/**
 * Sessione verificata: l'UNICA fonte di identità per il server. Nasce solo da
 * un JWT di Supabase Auth con firma, emittente, audience e scadenza validi.
 * Nessun campo arriva da parametri, header personalizzati o cookie non firmati.
 */
export interface VerifiedSession {
  readonly userId: string;
  readonly sessionId: string;
  readonly aal: "aal1" | "aal2";
  readonly email: string | null;
  readonly expiresAt: Date;
}

export interface TokenVerifierConfig {
  /** Emittente atteso, es. `https://<progetto>.supabase.co/auth/v1`. */
  issuer: string;
  /** Audience attesa (Supabase: `authenticated`). */
  audience?: string;
  /** Chiave condivisa HS256 (JWT secret legacy di Supabase). */
  hs256Secret?: string;
  /** JWKS delle chiavi asimmetriche di Supabase Auth (`<issuer>/.well-known/jwks.json`). */
  jwksUrl?: string;
  /** Tolleranza sull'orologio in secondi (default 5). */
  clockToleranceSeconds?: number;
}

const claimsSchema = z.object({
  sub: z.uuid(),
  role: z.literal("authenticated"),
  aal: z.enum(["aal1", "aal2"]),
  session_id: z.uuid(),
  exp: z.number().int(),
  email: z.string().optional(),
  is_anonymous: z.boolean().optional(),
});

export type TokenVerifier = (token: string | null | undefined) => Promise<VerifiedSession>;

/**
 * Crea il verificatore dei token di accesso. Gli algoritmi sono fissati in
 * base al tipo di chiave configurata: un token `alg: none` o firmato con un
 * algoritmo diverso viene rifiutato (niente confusione di algoritmi).
 */
export function createTokenVerifier(config: TokenVerifierConfig): TokenVerifier {
  const { hs256Secret, jwksUrl } = config;
  if (!config.issuer) throw new Error("TokenVerifierConfig.issuer è obbligatorio");
  if (Boolean(hs256Secret) === Boolean(jwksUrl)) {
    throw new Error("Configura esattamente una chiave: hs256Secret oppure jwksUrl");
  }
  if (hs256Secret && hs256Secret.length < 32) {
    throw new Error("hs256Secret troppo corto (minimo 32 caratteri)");
  }

  let key: Uint8Array | JWTVerifyGetKey;
  let algorithms: string[];
  if (hs256Secret) {
    key = new TextEncoder().encode(hs256Secret);
    algorithms = ["HS256"];
  } else {
    key = createRemoteJWKSet(new URL(jwksUrl!));
    algorithms = ["ES256", "RS256"];
  }

  return async (token) => {
    if (!token || typeof token !== "string") {
      throw new AuthError("UNAUTHENTICATED", "token assente");
    }
    let payload: unknown;
    try {
      const verifyOptions = {
        issuer: config.issuer,
        audience: config.audience ?? "authenticated",
        algorithms,
        clockTolerance: config.clockToleranceSeconds ?? 5,
        requiredClaims: ["exp", "sub", "iss", "aud"],
      };
      const result =
        key instanceof Uint8Array
          ? await jwtVerify(token, key, verifyOptions)
          : await jwtVerify(token, key, verifyOptions);
      payload = result.payload;
    } catch (error) {
      const reason = error instanceof joseErrors.JOSEError ? error.code : "ERR_UNKNOWN";
      throw new AuthError("UNAUTHENTICATED", `token non valido (${reason})`, { cause: error });
    }

    const parsed = claimsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AuthError("UNAUTHENTICATED", "claim del token non validi");
    }
    if (parsed.data.is_anonymous) {
      throw new AuthError("UNAUTHENTICATED", "le sessioni anonime non sono ammesse");
    }
    return Object.freeze({
      userId: parsed.data.sub,
      sessionId: parsed.data.session_id,
      aal: parsed.data.aal,
      email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
      expiresAt: new Date(parsed.data.exp * 1000),
    });
  };
}

/**
 * Claim minimi passati a PostgreSQL (`request.jwt.claims`). Si ricostruiscono
 * dalla sessione verificata invece di inoltrare il payload grezzo.
 */
export function sessionClaims(session: VerifiedSession): string {
  return JSON.stringify({
    sub: session.userId,
    role: "authenticated",
    aal: session.aal,
    session_id: session.sessionId,
    email: session.email,
  });
}
