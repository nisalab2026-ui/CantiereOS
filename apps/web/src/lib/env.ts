import "server-only";
import { z } from "zod";

/**
 * Configurazione SOLO lato server. Nessuna di queste variabili ha prefisso
 * NEXT_PUBLIC_: il browser non parla mai direttamente con Supabase o col database.
 */
const schema = z
  .object({
    APP_URL: z.url(),
    SUPABASE_URL: z.url(),
    SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_JWT_ISSUER: z.url(),
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),
    SUPABASE_JWKS_URL: z.url().optional(),
    DATABASE_URL: z.string().startsWith("postgres"),
    SMTP_URL: z.string().startsWith("smtp").optional(),
    MAIL_FROM: z.string().min(3).optional(),
  })
  .refine((e) => Boolean(e.SUPABASE_JWT_SECRET) !== Boolean(e.SUPABASE_JWKS_URL), {
    message: "Imposta esattamente una tra SUPABASE_JWT_SECRET e SUPABASE_JWKS_URL",
  });

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (!cached) {
    const blankToUndefined = Object.fromEntries(
      Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
    );
    const parsed = schema.safeParse(blankToUndefined);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".") || i.message).join(", ");
      throw new Error(
        `Configurazione server non valida o incompleta: ${fields}. Vedi .env.example.`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}
