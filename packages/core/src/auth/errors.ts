/**
 * Errori di autenticazione/autorizzazione con codice stabile. Il codice è ciò
 * che l'interfaccia mostra (tradotto); il messaggio è solo diagnostico.
 */
export type AuthErrorCode =
  | "UNAUTHENTICATED" // token assente, non valido, scaduto o manomesso
  | "SESSION_REVOKED" // logout, "esci ovunque", sessione scaduta in Supabase Auth
  | "NO_ACTIVE_TENANT" // l'utente non è membro attivo di alcuna azienda
  | "NOT_A_MEMBER" // azienda richiesta non accessibile
  | "FORBIDDEN" // permesso mancante
  | "MFA_REQUIRED" // permesso presente ma serve una sessione aal2
  | "EMAIL_NOT_CONFIRMED"
  | "INVALID_INVITATION" // inesistente, scaduto, revocato o già usato
  | "INVITATION_EMAIL_MISMATCH"
  | "ALREADY_MEMBER"
  | "SEAT_LIMIT_REACHED"
  | "COMPANY_LIMIT_REACHED"
  | "SLUG_TAKEN"
  | "INVALID_INPUT";

/** Codice HTTP suggerito per ciascun errore (route handler e server action). */
export const AUTH_ERROR_STATUS: Record<AuthErrorCode, number> = {
  UNAUTHENTICATED: 401,
  SESSION_REVOKED: 401,
  NO_ACTIVE_TENANT: 403,
  NOT_A_MEMBER: 403,
  FORBIDDEN: 403,
  MFA_REQUIRED: 403,
  EMAIL_NOT_CONFIRMED: 403,
  INVALID_INVITATION: 404,
  INVITATION_EMAIL_MISMATCH: 403,
  ALREADY_MEMBER: 409,
  SEAT_LIMIT_REACHED: 409,
  COMPANY_LIMIT_REACHED: 409,
  SLUG_TAKEN: 409,
  INVALID_INPUT: 400,
};

export class AuthError extends Error {
  override readonly name = "AuthError";
  constructor(
    readonly code: AuthErrorCode,
    message: string = code,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }

  get status(): number {
    return AUTH_ERROR_STATUS[this.code];
  }
}

export function isAuthError(error: unknown, code?: AuthErrorCode): error is AuthError {
  return error instanceof AuthError && (code === undefined || error.code === code);
}

/** Codice SQLSTATE di un errore pg, se presente. */
export function pgCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}
