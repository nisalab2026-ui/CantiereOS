import "server-only";
import nodemailer from "nodemailer";
import { env } from "./env";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Invio email applicative (es. inviti). Se SMTP_URL non è configurata
 * restituisce `not_configured`: l'interfaccia lo dice chiaramente e mostra il
 * link da consegnare a mano. Nessun invio simulato.
 * Le email di autenticazione (conferma, recupero password) le invia Supabase Auth.
 */
export async function sendMail(mail: OutgoingMail): Promise<"sent" | "not_configured"> {
  const { SMTP_URL, MAIL_FROM } = env();
  if (!SMTP_URL || !MAIL_FROM) return "not_configured";
  const transport = nodemailer.createTransport(SMTP_URL);
  await transport.sendMail({ from: MAIL_FROM, ...mail });
  return "sent";
}
