import { z } from "zod";
import { requirePermission, type TenantAccess } from "../auth/access";
import { pgCode } from "../auth/errors";
import type { UserTx } from "../db/transaction";
import { detectFileType, type FileStorage } from "../documents/storage";
import { ValidationError } from "../validation";
import { allFields, formDefinitionSchema, MAX_PHOTOS } from "./form-definition";

/**
 * Foto nei campi "Foto" dei moduli (ADR-013). Due passi, come l'archivio:
 * 1. startFormPhotoUpload crea la scheda (pending) e restituisce un URL firmato
 *    per caricare un solo file;
 * 2. finishFormPhotoUpload controlla dimensione e tipo reale del file arrivato.
 * Il browser comprime le foto prima di caricarle; il server non si fida del
 * nome né del tipo dichiarati.
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;

const photoInput = z.object({
  fieldId: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  name: z.string().trim().min(1).max(255),
  size: z.number().int().min(1),
  type: z.string().max(120),
});

export interface PhotoTicket {
  fileId: string;
  uploadUrl: string;
}

export async function startFormPhotoUpload(
  tx: UserTx,
  access: TenantAccess,
  storage: FileStorage,
  submissionId: string,
  input: z.input<typeof photoInput>,
): Promise<PhotoTicket> {
  requirePermission(access, "forms.write");
  if (!isUuid(submissionId)) throw new ValidationError({ form: "Modulo non trovato" });
  const p = photoInput.safeParse(input);
  if (!p.success) throw new ValidationError({ form: "Foto non valida" });
  const f = p.data;
  if (f.size > MAX_PHOTO_BYTES)
    throw new ValidationError({ [f.fieldId]: "La foto supera i 10 MB" });
  if (!(PHOTO_TYPES as readonly string[]).includes(f.type)) {
    throw new ValidationError({ [f.fieldId]: "Sono ammesse solo foto JPEG, PNG o WebP" });
  }

  const { rows } = await tx.query<{ status: string; definition: unknown }>(
    `select s.status, v.definition
       from public.form_submissions s
       join public.form_template_versions v
         on v.tenant_id = s.tenant_id and v.id = s.template_version_id
      where s.tenant_id = $1 and s.id = $2 and s.deleted_at is null`,
    [access.tenantId, submissionId],
  );
  const sub = rows[0];
  if (!sub) throw new ValidationError({ form: "Modulo non trovato" });
  if (sub.status !== "draft") {
    throw new ValidationError({ form: "Il modulo è chiuso: riaprilo per cambiare le foto." });
  }
  const field = allFields(formDefinitionSchema.parse(sub.definition)).find(
    (x) => x.id === f.fieldId,
  );
  if (field?.type !== "photo") throw new ValidationError({ form: "Campo foto non trovato" });

  const { rows: count } = await tx.query<{ n: number }>(
    `select count(*)::int as n from public.form_submission_files
      where tenant_id = $1 and submission_id = $2 and field_id = $3
        and deleted_at is null and status <> 'rejected'`,
    [access.tenantId, submissionId, f.fieldId],
  );
  // margine sulle foto tolte dal modulo ma non ancora salvate
  if ((count[0]?.n ?? 0) >= (field.maxPhotos ?? MAX_PHOTOS) * 3) {
    throw new ValidationError({ [f.fieldId]: "Troppe foto caricate per questo campo" });
  }

  const safeName = f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "foto.jpg";
  await tx.query("savepoint start_photo");
  let id: string;
  try {
    const ins = await tx.query<{ id: string; storage_key: string }>(
      `insert into public.form_submission_files (tenant_id, submission_id, field_id, original_name)
       values ($1, $2, $3, $4) returning id, storage_key`,
      [access.tenantId, submissionId, f.fieldId, safeName],
    );
    id = ins.rows[0]!.id;
    return { fileId: id, uploadUrl: await storage.createUploadUrl(ins.rows[0]!.storage_key) };
  } catch (error) {
    await tx.query("rollback to savepoint start_photo");
    if (error instanceof ValidationError) throw error;
    if (pgCode(error) === "42501") {
      throw new ValidationError({ form: "Il modulo è chiuso: riaprilo per cambiare le foto." });
    }
    throw error;
  }
}

/** In caso di successo, anche un URL firmato di breve durata per l'anteprima. */
export type PhotoOutcome =
  { ok: true; fileId: string; url: string } | { ok: false; reason: string };

export async function finishFormPhotoUpload(
  tx: UserTx,
  access: TenantAccess,
  storage: FileStorage,
  fileId: string,
): Promise<PhotoOutcome> {
  requirePermission(access, "forms.write");
  if (!isUuid(fileId)) throw new ValidationError({ form: "Foto non trovata" });
  const { rows } = await tx.query<{ storage_key: string; original_name: string; status: string }>(
    `select storage_key, original_name, status from public.form_submission_files
      where tenant_id = $1 and id = $2 and created_by = auth.uid() and deleted_at is null
      for update`,
    [access.tenantId, fileId],
  );
  const v = rows[0];
  if (!v) throw new ValidationError({ form: "Foto non trovata" });
  const done = async (): Promise<PhotoOutcome> => ({
    ok: true,
    fileId,
    url: await storage.createDownloadUrl(v.storage_key, { expiresIn: 3600 }),
  });
  if (v.status === "ready") return done();
  if (v.status === "rejected") return { ok: false, reason: "Foto già rifiutata" };

  const reject = async (reason: string): Promise<PhotoOutcome> => {
    await storage.remove(v.storage_key).catch(() => undefined);
    await tx.query(
      "update public.form_submission_files set status = 'rejected', reject_reason = $3 where tenant_id = $1 and id = $2",
      [access.tenantId, fileId, reason],
    );
    return { ok: false, reason };
  };
  const info = await storage.info(v.storage_key);
  if (!info) return reject("La foto non è arrivata: riprova.");
  if (info.size < 1) return reject("La foto è vuota.");
  if (info.size > MAX_PHOTO_BYTES) return reject("La foto supera i 10 MB.");
  const head = await storage.readHead(v.storage_key, Math.min(64, info.size));
  const mime = detectFileType(v.original_name, head);
  if (!mime || !(PHOTO_TYPES as readonly string[]).includes(mime)) {
    return reject("Il file non è una foto JPEG, PNG o WebP.");
  }
  await tx.query(
    `update public.form_submission_files set status = 'ready', mime_type = $3, size_bytes = $4
      where tenant_id = $1 and id = $2`,
    [access.tenantId, fileId, mime, info.size],
  );
  return done();
}

/** Le foto indicate nei campi devono essere verificate e di quel modulo e campo. */
export async function checkFormPhotos(
  tx: UserTx,
  access: TenantAccess,
  submissionId: string,
  byField: Record<string, string[]>,
): Promise<Record<string, string>> {
  const ids = Object.values(byField).flat();
  if (!ids.length) return {};
  const { rows } = await tx.query<{ id: string; field_id: string }>(
    `select id, field_id from public.form_submission_files
      where tenant_id = $1 and submission_id = $2 and id = any($3::uuid[])
        and status = 'ready' and deleted_at is null`,
    [access.tenantId, submissionId, ids],
  );
  const ok = new Set(rows.map((r) => `${r.field_id}/${r.id}`));
  const errors: Record<string, string> = {};
  for (const [field, list] of Object.entries(byField)) {
    if (list.some((id) => !ok.has(`${field}/${id}`))) {
      errors[field] = "Una foto non è stata caricata del tutto: toglila e riprova.";
    }
  }
  return errors;
}

export interface FormPhoto {
  id: string;
  url: string;
  name: string;
}

/** URL firmati di breve durata per le foto verificate di un modulo. */
export async function listFormPhotos(
  tx: UserTx,
  access: TenantAccess,
  storage: FileStorage,
  submissionId: string,
): Promise<Record<string, FormPhoto>> {
  requirePermission(access, "forms.read");
  if (!isUuid(submissionId)) return {};
  const { rows } = await tx.query<{ id: string; storage_key: string; original_name: string }>(
    `select id, storage_key, original_name from public.form_submission_files
      where tenant_id = $1 and submission_id = $2 and status = 'ready' and deleted_at is null
      order by created_at`,
    [access.tenantId, submissionId],
  );
  const out: Record<string, FormPhoto> = {};
  await Promise.all(
    rows.map(async (r) => {
      out[r.id] = {
        id: r.id,
        name: r.original_name,
        url: await storage.createDownloadUrl(r.storage_key, { expiresIn: 3600 }),
      };
    }),
  );
  return out;
}
