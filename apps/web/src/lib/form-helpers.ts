/** Legge un campo testuale da FormData (undefined se assente). */
export function formText(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
}

/** Attributi ARIA/ID coerenti per un campo con eventuale errore. */
export function fieldAttrs(prefix: string, errors: Record<string, string>, name: string) {
  return {
    id: `${prefix}-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${prefix}-${name}-error` : undefined,
  } as const;
}

/** Prop `error` per FormField solo se presente (exactOptionalPropertyTypes). */
export function errorProp(errors: Record<string, string>, name: string) {
  return errors[name] ? { error: errors[name] } : {};
}
