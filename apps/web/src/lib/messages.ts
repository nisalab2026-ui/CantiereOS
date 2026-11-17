import { AuthError, type AuthErrorCode } from "@cantiereos/core";

const MESSAGES: Record<AuthErrorCode, string> = {
  UNAUTHENTICATED: "Accesso richiesto.",
  SESSION_REVOKED: "La sessione è stata chiusa. Accedi di nuovo.",
  NO_ACTIVE_TENANT: "Non fai parte di nessuna azienda attiva.",
  NOT_A_MEMBER: "Non hai accesso a questa azienda.",
  FORBIDDEN: "Non hai i permessi per questa operazione.",
  MFA_REQUIRED: "Per questa operazione serve la verifica in due passaggi.",
  EMAIL_NOT_CONFIRMED: "Conferma prima il tuo indirizzo email.",
  INVALID_INVITATION: "L'invito non è valido, è scaduto o è già stato usato.",
  INVITATION_EMAIL_MISMATCH:
    "L'invito è stato inviato a un altro indirizzo email. Accedi con l'email invitata.",
  ALREADY_MEMBER: "Questa persona fa già parte dell'azienda o ha già un invito in attesa.",
  SEAT_LIMIT_REACHED: "L'azienda ha raggiunto il numero massimo di utenti del suo piano.",
  COMPANY_LIMIT_REACHED: "Hai raggiunto il numero massimo di aziende registrabili.",
  SLUG_TAKEN: "Non è stato possibile creare l'azienda. Riprova.",
  INVALID_INPUT: "Controlla i dati inseriti.",
};

/** Messaggio per l'utente. Gli errori inattesi non espongono dettagli interni. */
export function userMessage(error: unknown): string {
  if (error instanceof AuthError) return MESSAGES[error.code];
  return UNEXPECTED_ERROR;
}

export const UNEXPECTED_ERROR =
  "Si è verificato un errore imprevisto. Riprova tra qualche istante.";

/** Stato restituito dalle Server Actions dei moduli. */
export interface FormState {
  error?: string;
  message?: string;
  /** Dati da mostrare una sola volta (es. link d'invito se l'email non è configurata). */
  detail?: string;
  /** Errori per campo (chiave = nome del campo). */
  fieldErrors?: Record<string, string>;
  /** Id dell'elemento creato, per aprirlo dopo il salvataggio. */
  createdId?: string;
}
