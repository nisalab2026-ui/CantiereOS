"use server";

import {
  createFolder,
  deleteDocument,
  deleteFolder,
  finishUpload,
  renameFolder,
  resolveActiveTenant,
  startDocumentUpload,
  startVersionUpload,
  updateDocument,
  ValidationError,
  type DocumentInput,
  type DocumentUpdateInput,
  type UploadOutcome,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { UNEXPECTED_ERROR as UNEXPECTED, userMessage, type FormState } from "@/lib/messages";
import { fileStorage } from "@/lib/storage";

/**
 * Azioni dell'archivio documentale. Azienda e utente dalla sessione
 * verificata; permessi, validazione e chiavi dei file nel core e nel database.
 * Il file non passa da qui: va dal browser allo storage con un URL firmato.
 */
const NOT_CONFIGURED = "Archiviazione file non configurata: contatta l'amministratore.";

function failure(error: unknown): FormState {
  if (error instanceof ValidationError) {
    const { form, ...fields } = error.fieldErrors;
    if (fields.subjectId) fields.subject = fields.subjectId;
    return { error: form ?? "Controlla i campi evidenziati.", fieldErrors: fields };
  }
  const message = userMessage(error);
  // Errore non previsto: lo registra lato server per la diagnosi (l'utente vede un messaggio generico).
  if (message === UNEXPECTED) console.error("[documenti]", error);
  return { error: message };
}

function splitSubject(subject: string | undefined) {
  return subject && subject.includes(":")
    ? (subject.split(":", 2) as [string, string])
    : [undefined, undefined];
}

export interface UploadMeta {
  title: string;
  category: string;
  description?: string;
  folderId?: string;
  subject?: string; // "tipo:id"
  isConfidential?: boolean;
  expiresOn?: string;
  createDeadline?: boolean;
}
export interface UploadFile {
  name: string;
  size: number;
  type?: string;
}
export type StartResult =
  | {
      ok: true;
      documentId: string;
      versionId: string;
      uploadUrl: string;
      contentType: string;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const blank = (v: string | undefined) => (v && v.trim() !== "" ? v : undefined);

export async function startUploadAction(meta: UploadMeta, file: UploadFile): Promise<StartResult> {
  const storage = fileStorage();
  if (!storage) return { ok: false, error: NOT_CONFIGURED };
  const [subjectType, subjectId] = splitSubject(meta.subject);
  try {
    const t = await asCurrentUser(async (tx) =>
      startDocumentUpload(
        tx,
        await resolveActiveTenant(tx),
        storage,
        {
          title: meta.title,
          category: meta.category,
          description: blank(meta.description),
          folderId: blank(meta.folderId),
          subjectType,
          subjectId,
          isConfidential: meta.isConfidential === true,
          expiresOn: blank(meta.expiresOn),
          createDeadline: meta.createDeadline === true,
        } as DocumentInput, // validato con zod nel core
        { name: file.name, size: file.size, type: blank(file.type) },
      ),
    );
    return { ok: true, ...t };
  } catch (error) {
    const f = failure(error);
    return {
      ok: false,
      error: f.error ?? "Errore",
      ...(f.fieldErrors ? { fieldErrors: f.fieldErrors } : {}),
    };
  }
}

export async function startVersionAction(
  documentId: string,
  file: UploadFile,
  notes?: string,
): Promise<StartResult> {
  const storage = fileStorage();
  if (!storage) return { ok: false, error: NOT_CONFIGURED };
  try {
    const t = await asCurrentUser(async (tx) =>
      startVersionUpload(
        tx,
        await resolveActiveTenant(tx),
        storage,
        documentId,
        { name: file.name, size: file.size, type: blank(file.type) },
        notes,
      ),
    );
    return { ok: true, ...t };
  } catch (error) {
    const f = failure(error);
    return {
      ok: false,
      error: f.error ?? "Errore",
      ...(f.fieldErrors ? { fieldErrors: f.fieldErrors } : {}),
    };
  }
}

export async function finishUploadAction(
  versionId: string,
): Promise<UploadOutcome | { ok: false; documentId: null; reason: string }> {
  const storage = fileStorage();
  if (!storage) return { ok: false, documentId: null, reason: NOT_CONFIGURED };
  try {
    const out = await asCurrentUser(async (tx) =>
      finishUpload(tx, await resolveActiveTenant(tx), storage, versionId),
    );
    revalidatePath("/app/documenti");
    revalidatePath(`/app/documenti/${out.documentId}`);
    return out;
  } catch (error) {
    return { ok: false, documentId: null, reason: failure(error).error ?? "Errore" };
  }
}

// --- Cartelle -------------------------------------------------------------------

export async function createFolderAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const { id } = await asCurrentUser(async (tx) =>
      createFolder(tx, await resolveActiveTenant(tx), {
        name: formText(form, "name") ?? "",
        parentId: blank(formText(form, "parentId")),
      }),
    );
    revalidatePath("/app/documenti");
    return { createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function renameFolderAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      renameFolder(tx, await resolveActiveTenant(tx), id, formText(form, "name") ?? ""),
    );
    revalidatePath("/app/documenti");
    return { createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteFolderAction(id: string): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) => deleteFolder(tx, await resolveActiveTenant(tx), id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/app/documenti");
  redirect("/app/documenti?cartella_eliminata=1");
}

// --- Scheda ---------------------------------------------------------------------

export async function updateDocumentAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  const [subjectType, subjectId] = splitSubject(formText(form, "subject"));
  try {
    await asCurrentUser(async (tx) =>
      updateDocument(
        tx,
        await resolveActiveTenant(tx),
        id,
        {
          title: formText(form, "title") ?? "",
          category: formText(form, "category") ?? "",
          description: blank(formText(form, "description")),
          folderId: blank(formText(form, "folderId")),
          subjectType,
          subjectId,
          isConfidential: formText(form, "isConfidential") ?? "",
          expiresOn: blank(formText(form, "expiresOn")),
        } as DocumentUpdateInput,
        formText(form, "version") ?? "",
      ),
    );
    revalidatePath("/app/documenti");
    revalidatePath(`/app/documenti/${id}`);
    return { createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteDocumentAction(id: string): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) => deleteDocument(tx, await resolveActiveTenant(tx), id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/app/documenti");
  redirect("/app/documenti?eliminato=1");
}
