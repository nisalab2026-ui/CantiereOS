import "server-only";
import { SupabaseFileStorage, type FileStorage } from "@cantiereos/core";
import { env } from "./env";

let cached: FileStorage | null | undefined;

/**
 * Storage dei documenti (Supabase Storage, bucket privato). null = non
 * configurato: l'interfaccia lo dice e non simula nulla.
 */
export function fileStorage(): FileStorage | null {
  if (cached !== undefined) return cached;
  const e = env();
  cached = e.SUPABASE_SERVICE_ROLE_KEY
    ? new SupabaseFileStorage({
        url: e.SUPABASE_URL,
        serviceKey: e.SUPABASE_SERVICE_ROLE_KEY,
        bucket: e.DOCUMENTS_BUCKET ?? "documents",
      })
    : null;
  return cached;
}

let cachedForms: FileStorage | null | undefined;

/** Foto dei moduli: bucket privato a parte, stessa configurazione dello storage. */
export function formFileStorage(): FileStorage | null {
  if (cachedForms !== undefined) return cachedForms;
  const e = env();
  cachedForms = e.SUPABASE_SERVICE_ROLE_KEY
    ? new SupabaseFileStorage({
        url: e.SUPABASE_URL,
        serviceKey: e.SUPABASE_SERVICE_ROLE_KEY,
        bucket: e.FORMS_BUCKET ?? "form-files",
      })
    : null;
  return cachedForms;
}
