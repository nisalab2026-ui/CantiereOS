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
