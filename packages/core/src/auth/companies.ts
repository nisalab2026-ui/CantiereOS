import { z } from "zod";
import { AuthError, pgCode } from "./errors";
import type { UserTx } from "../db/transaction";

const registerCompanyInput = z.object({
  name: z.string().trim().min(2).max(200),
});

export type RegisterCompanyInput = z.input<typeof registerCompanyInput>;

/** Slug URL-safe dal nome, con suffisso casuale per evitare collisioni ed enumerazione. */
export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  return `${base.length >= 2 ? base : "azienda"}-${suffix}`;
}

/**
 * Registrazione di una nuova azienda (prova gratuita). Titolare = utente della
 * sessione verificata; email confermata, sessione attiva, piano e limiti sono
 * verificati da app.register_company nel database.
 */
export async function registerCompany(
  tx: UserTx,
  input: RegisterCompanyInput,
): Promise<{ tenantId: string; slug: string }> {
  const parsed = registerCompanyInput.safeParse(input);
  if (!parsed.success) throw new AuthError("INVALID_INPUT", "nome azienda non valido");

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = slugify(parsed.data.name);
    await tx.query("savepoint register_company");
    try {
      const { rows } = await tx.query<{ id: string }>("select app.register_company($1, $2) as id", [
        parsed.data.name,
        slug,
      ]);
      return { tenantId: rows[0]!.id, slug };
    } catch (error) {
      await tx.query("rollback to savepoint register_company");
      const code = pgCode(error);
      if (code === "23505") continue; // slug già usato: nuovo suffisso
      if (code === "42501") {
        throw new AuthError(
          "EMAIL_NOT_CONFIRMED",
          "conferma l'email prima di registrare l'azienda",
          {
            cause: error,
          },
        );
      }
      if (code === "53400") {
        throw new AuthError("COMPANY_LIMIT_REACHED", "limite di aziende registrabili raggiunto", {
          cause: error,
        });
      }
      if (code === "22023") throw new AuthError("INVALID_INPUT", "nome azienda non valido");
      if (code === "28000") throw new AuthError("SESSION_REVOKED", "sessione non valida");
      throw error;
    }
  }
  throw new AuthError("SLUG_TAKEN", "impossibile generare un identificativo univoco");
}
