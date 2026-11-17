"use server";

import {
  createFormSubmission,
  createFormTemplate,
  deleteFormSubmission,
  deleteFormTemplate,
  finishFormPhotoUpload,
  publishFormTemplate,
  reopenFormSubmission,
  resolveActiveTenant,
  saveFormSubmission,
  setFormTemplateArchived,
  startFormPhotoUpload,
  updateFormTemplateDraft,
  ValidationError,
  type FormCategory,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { formFileStorage } from "@/lib/storage";
import { formText } from "@/lib/form-helpers";
import { UNEXPECTED_ERROR, userMessage, type FormState } from "@/lib/messages";

/**
 * Moduli compilabili (ADR-013). Azienda e utente dalla sessione verificata;
 * permessi e validazione (anche dei valori, rispetto alla versione del
 * modello) nel core; blocco dei moduli chiusi nel database.
 */
function failure(error: unknown): FormState {
  if (error instanceof ValidationError) {
    const { form, ...fields } = error.fieldErrors;
    return {
      error:
        form ??
        (Object.keys(fields).length === 1 && fields.definition
          ? fields.definition
          : "Controlla i campi evidenziati."),
      fieldErrors: fields,
    };
  }
  const message = userMessage(error);
  if (message === UNEXPECTED_ERROR) console.error("[moduli]", error);
  return { error: message };
}

function refresh(id?: string) {
  revalidatePath("/app/moduli");
  if (id) revalidatePath(`/app/moduli/${id}`);
}

// --- Modelli ---------------------------------------------------------------------

export async function createTemplateAction(_: FormState, form: FormData): Promise<FormState> {
  let id: string;
  try {
    ({ id } = await asCurrentUser(async (tx) =>
      createFormTemplate(tx, await resolveActiveTenant(tx), {
        name: formText(form, "name") ?? "",
        description: formText(form, "description"),
        category: (formText(form, "category") ?? "") as FormCategory,
        ...(formText(form, "libraryKey") ? { libraryKey: formText(form, "libraryKey")! } : {}),
      }),
    ));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/app/moduli/modelli");
  redirect(`/app/moduli/modelli/${id}?nuovo=1`);
}

/** Salvataggio della bozza dall'editor (definizione come JSON). */
export async function saveTemplateDraftAction(
  id: string,
  version: string,
  input: { name: string; description: string; category: string; definition: unknown },
): Promise<FormState & { updatedAt?: string }> {
  try {
    await asCurrentUser(async (tx) =>
      updateFormTemplateDraft(
        tx,
        await resolveActiveTenant(tx),
        id,
        {
          name: input.name,
          description: input.description,
          category: input.category as FormCategory,
          definition: input.definition,
        },
        version,
      ),
    );
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/app/moduli/modelli/${id}`);
  revalidatePath("/app/moduli/modelli");
  return { message: "Bozza salvata." };
}

export async function publishTemplateAction(id: string): Promise<FormState> {
  try {
    const { version } = await asCurrentUser(async (tx) =>
      publishFormTemplate(tx, await resolveActiveTenant(tx), id),
    );
    revalidatePath(`/app/moduli/modelli/${id}`);
    revalidatePath("/app/moduli/modelli");
    revalidatePath("/app/moduli");
    return { message: `Versione ${version} pubblicata: i nuovi moduli useranno questa.` };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveTemplateAction(id: string, archived: boolean): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      setFormTemplateArchived(tx, await resolveActiveTenant(tx), id, archived),
    );
    revalidatePath(`/app/moduli/modelli/${id}`);
    revalidatePath("/app/moduli/modelli");
    return {};
  } catch (error) {
    return failure(error);
  }
}

export async function deleteTemplateAction(id: string): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) => deleteFormTemplate(tx, await resolveActiveTenant(tx), id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/app/moduli/modelli");
  redirect("/app/moduli/modelli?eliminato=1");
}

// --- Compilazioni ------------------------------------------------------------------

export async function createSubmissionAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const { id } = await asCurrentUser(async (tx) =>
      createFormSubmission(tx, await resolveActiveTenant(tx), {
        templateId: formText(form, "templateId") ?? "",
        ...(formText(form, "title") ? { title: formText(form, "title")! } : {}),
        ...(formText(form, "customerId") ? { customerId: formText(form, "customerId")! } : {}),
        ...(formText(form, "siteId") ? { siteId: formText(form, "siteId")! } : {}),
        ...(formText(form, "projectId") ? { projectId: formText(form, "projectId")! } : {}),
      }),
    );
    refresh();
    return { createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function saveSubmissionAction(
  id: string,
  version: string,
  input: { title: string; customerId: string; siteId: string; projectId?: string; data: unknown },
  complete: boolean,
): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      saveFormSubmission(
        tx,
        await resolveActiveTenant(tx),
        id,
        {
          title: input.title,
          ...(input.customerId ? { customerId: input.customerId } : {}),
          ...(input.siteId ? { siteId: input.siteId } : {}),
          ...(input.projectId ? { projectId: input.projectId } : {}),
          data: input.data,
        },
        version,
        complete,
      ),
    );
  } catch (error) {
    return failure(error);
  }
  refresh(id);
  return { message: complete ? "Modulo chiuso." : "Bozza salvata." };
}

export async function reopenSubmissionAction(id: string): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) => reopenFormSubmission(tx, await resolveActiveTenant(tx), id));
    refresh(id);
    return {};
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSubmissionAction(id: string): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) => deleteFormSubmission(tx, await resolveActiveTenant(tx), id));
  } catch (error) {
    return failure(error);
  }
  refresh();
  redirect("/app/moduli?eliminato=1");
}

// --- Foto nei moduli ---------------------------------------------------------------

const PHOTOS_OFF = "Archiviazione foto non configurata: contatta l'amministratore.";

export type PhotoStart =
  { ok: true; fileId: string; uploadUrl: string } | { ok: false; error: string };

/** Primo passo: scheda "in attesa" e URL firmato per caricare una sola foto. */
export async function startPhotoUploadAction(
  submissionId: string,
  photo: { fieldId: string; name: string; size: number; type: string },
): Promise<PhotoStart> {
  const storage = formFileStorage();
  if (!storage) return { ok: false, error: PHOTOS_OFF };
  try {
    const t = await asCurrentUser(async (tx) =>
      startFormPhotoUpload(tx, await resolveActiveTenant(tx), storage, submissionId, photo),
    );
    return { ok: true, ...t };
  } catch (error) {
    const f = failure(error);
    return { ok: false, error: Object.values(f.fieldErrors ?? {})[0] ?? f.error ?? "Errore" };
  }
}

export type PhotoFinish = { ok: true; fileId: string; url: string } | { ok: false; error: string };

/** Secondo passo: il server controlla dimensione e tipo reale del file arrivato. */
export async function finishPhotoUploadAction(fileId: string): Promise<PhotoFinish> {
  const storage = formFileStorage();
  if (!storage) return { ok: false, error: PHOTOS_OFF };
  try {
    const r = await asCurrentUser(async (tx) =>
      finishFormPhotoUpload(tx, await resolveActiveTenant(tx), storage, fileId),
    );
    return r.ok ? r : { ok: false, error: r.reason };
  } catch (error) {
    const f = failure(error);
    return { ok: false, error: f.error ?? "Errore" };
  }
}
