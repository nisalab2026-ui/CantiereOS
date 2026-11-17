"use server";

import {
  addEmployeeCostRate,
  changeWorkReportStatus,
  createWorkReport,
  deleteWorkReport,
  finishWorkReportPhoto,
  removeEmployeeCostRate,
  removeWorkReportPhoto,
  resolveActiveTenant,
  saveWorkReport,
  saveWorkReportPrices,
  signWorkReport,
  startWorkReportPhoto,
  ValidationError,
  type WorkReportSaveInput,
  type WorkReportTransition,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { UNEXPECTED_ERROR, userMessage, type FormState } from "@/lib/messages";
import { formFileStorage } from "@/lib/storage";

/**
 * Rapportini (ADR-015). Azienda e utente dalla sessione verificata; permessi,
 * validazione e passaggi di stato nel core; blocchi (bozza, autore, chi approva)
 * nel database. I prezzi passano solo con projects.finance (ricontrollato nel core).
 */
function failure(error: unknown): FormState {
  if (error instanceof ValidationError) {
    const { form, ...fields } = error.fieldErrors;
    return { error: form ?? "Controlla i campi evidenziati.", fieldErrors: fields };
  }
  const message = userMessage(error);
  if (message === UNEXPECTED_ERROR) console.error("[rapportini]", error);
  return { error: message };
}

function refresh(id?: string, projectId?: string) {
  revalidatePath("/app/rapportini");
  if (id) revalidatePath(`/app/rapportini/${id}`);
  if (projectId) revalidatePath(`/app/commesse/${projectId}`);
}

export async function createReportAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const { id } = await asCurrentUser(async (tx) =>
      createWorkReport(tx, await resolveActiveTenant(tx), {
        projectId: formText(form, "projectId") ?? "",
        reportDate: formText(form, "reportDate") ?? "",
        ...(formText(form, "projectSiteId")
          ? { projectSiteId: formText(form, "projectSiteId") }
          : {}),
      }),
    );
    refresh(undefined, formText(form, "projectId"));
    return { message: "Rapportino creato.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

/** Salvataggio della bozza dall'editor (dati strutturati, validati nel core). */
export async function saveReportAction(
  id: string,
  input: WorkReportSaveInput,
  version: string,
): Promise<FormState & { version?: string }> {
  try {
    await asCurrentUser(async (tx) =>
      saveWorkReport(tx, await resolveActiveTenant(tx), id, input, version),
    );
    refresh(id);
    return { message: "Rapportino salvato." };
  } catch (error) {
    return failure(error);
  }
}

export async function savePricesAction(
  id: string,
  prices: Record<string, string>,
): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      saveWorkReportPrices(tx, await resolveActiveTenant(tx), id, prices),
    );
    refresh(id);
    return { message: "Prezzi salvati." };
  } catch (error) {
    return failure(error);
  }
}

export async function signReportAction(
  id: string,
  sig: { signature: string; signerName: string } | null,
): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) => signWorkReport(tx, await resolveActiveTenant(tx), id, sig));
    refresh(id);
    return { message: sig ? "Firma salvata." : "Firma tolta." };
  } catch (error) {
    return failure(error);
  }
}

export async function changeStatusAction(
  id: string,
  action: WorkReportTransition,
  reason?: string,
): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      changeWorkReportStatus(tx, await resolveActiveTenant(tx), id, action, reason),
    );
    refresh(id);
    const done: Record<WorkReportTransition, string> = {
      submit: "Rapportino inviato per l'approvazione.",
      withdraw: "Rapportino ritirato: è di nuovo una bozza.",
      approve: "Rapportino approvato.",
      return: "Rapportino restituito con le tue indicazioni.",
      reopen: "Rapportino riaperto come bozza.",
    };
    return { message: done[action] };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteReportAction(id: string): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) => deleteWorkReport(tx, await resolveActiveTenant(tx), id));
  } catch (error) {
    return failure(error);
  }
  refresh(id);
  redirect("/app/rapportini?eliminato=1");
}

// --- Foto ----------------------------------------------------------------------------

const PHOTOS_OFF = "Archiviazione foto non configurata: contatta l'amministratore.";

export type ReportPhotoStart =
  { ok: true; fileId: string; uploadUrl: string } | { ok: false; error: string };

export async function startReportPhotoAction(
  reportId: string,
  photo: { name: string; size: number; type: string },
): Promise<ReportPhotoStart> {
  const storage = formFileStorage();
  if (!storage) return { ok: false, error: PHOTOS_OFF };
  try {
    const t = await asCurrentUser(async (tx) =>
      startWorkReportPhoto(tx, await resolveActiveTenant(tx), storage, reportId, photo),
    );
    return { ok: true, ...t };
  } catch (error) {
    const f = failure(error);
    return { ok: false, error: Object.values(f.fieldErrors ?? {})[0] ?? f.error ?? "Errore" };
  }
}

export type ReportPhotoFinish =
  { ok: true; id: string; url: string; name: string } | { ok: false; error: string };

export async function finishReportPhotoAction(fileId: string): Promise<ReportPhotoFinish> {
  const storage = formFileStorage();
  if (!storage) return { ok: false, error: PHOTOS_OFF };
  try {
    const r = await asCurrentUser(async (tx) =>
      finishWorkReportPhoto(tx, await resolveActiveTenant(tx), storage, fileId),
    );
    return r.ok ? { ok: true, ...r.photo } : { ok: false, error: r.reason };
  } catch (error) {
    const f = failure(error);
    return { ok: false, error: Object.values(f.fieldErrors ?? {})[0] ?? f.error ?? "Errore" };
  }
}

export async function removeReportPhotoAction(
  reportId: string,
  fileId: string,
): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      removeWorkReportPhoto(tx, await resolveActiveTenant(tx), fileId),
    );
    refresh(reportId);
    return { message: "Foto tolta." };
  } catch (error) {
    return failure(error);
  }
}

// --- Costo orario (pagina del personale) ---------------------------------------------

export async function addCostRateAction(_: FormState, form: FormData): Promise<FormState> {
  const employeeId = formText(form, "employeeId") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      addEmployeeCostRate(tx, await resolveActiveTenant(tx), employeeId, {
        amount: formText(form, "amount") ?? "",
        validFrom: formText(form, "validFrom") ?? "",
        ...(formText(form, "notes") ? { notes: formText(form, "notes") } : {}),
      }),
    );
    revalidatePath(`/app/personale/${employeeId}`);
    return { message: "Costo orario salvato." };
  } catch (error) {
    return failure(error);
  }
}

export async function removeCostRateAction(employeeId: string, rateId: string): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      removeEmployeeCostRate(tx, await resolveActiveTenant(tx), rateId),
    );
    revalidatePath(`/app/personale/${employeeId}`);
    return { message: "Costo orario tolto." };
  } catch (error) {
    return failure(error);
  }
}
