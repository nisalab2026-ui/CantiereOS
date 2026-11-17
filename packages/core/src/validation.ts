import { z } from "zod";

/** Errori di validazione per campo, mostrati accanto ai campi del modulo. */
export class ValidationError extends Error {
  override readonly name = "ValidationError";
  constructor(readonly fieldErrors: Record<string, string>) {
    super("dati non validi");
  }
}

/** Valida l'input con zod e trasforma gli errori in ValidationError per campo. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    throw new ValidationError(fieldErrors);
  }
  return parsed.data;
}

/** Stringa vuota → undefined (campi facoltativi dei moduli HTML). */
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );

export const uuidSchema = z.uuid("Identificativo non valido");
