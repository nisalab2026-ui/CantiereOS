/**
 * Accetta solo percorsi interni ("/qualcosa"): blocca redirect verso altri
 * domini ("//evil", "https://…", "/\\evil").
 */
export function safeNext(
  value: FormDataEntryValue | string | null | undefined,
  fallback: string,
): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
