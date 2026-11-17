"use server";

import {
  createProject,
  createProjectSite,
  deleteProject,
  removeProjectSite,
  resolveActiveTenant,
  saveProjectFinancials,
  setProjectStatus,
  updateProject,
  updateProjectSite,
  ValidationError,
  type FinancialsInput,
  type ProjectInput,
  type ProjectStatus,
  type SiteInput,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { formText } from "@/lib/form-helpers";
import { UNEXPECTED_ERROR, userMessage, type FormState } from "@/lib/messages";

/**
 * Commesse e cantieri (ADR-014). Azienda e utente dalla sessione verificata;
 * permessi e validazione nel core; RLS nel database. Gli importi passano solo
 * se l'utente ha projects.finance (lo ricontrolla il core).
 */
function readProject(form: FormData): ProjectInput {
  return {
    code: formText(form, "code"),
    name: formText(form, "name") ?? "",
    customerId: formText(form, "customerId") ?? "",
    kind: formText(form, "kind") ?? "",
    status: formText(form, "status"),
    startDate: formText(form, "startDate"),
    endDate: formText(form, "endDate"),
    managerEmployeeId: formText(form, "managerEmployeeId"),
    description: formText(form, "description"),
  } as ProjectInput; // validato con zod nel core
}

function readFinancials(form: FormData): FinancialsInput {
  return {
    contract: formText(form, "contract"),
    budgetCost: formText(form, "budgetCost"),
    notes: formText(form, "financialNotes"),
  } as FinancialsInput;
}

function readSite(form: FormData, prefix = ""): SiteInput {
  const t = (k: string) => formText(form, `${prefix}${k}`);
  return {
    name: t("siteName") ?? "",
    customerSiteId: t("customerSiteId"),
    addressLine: t("addressLine"),
    postalCode: t("postalCode"),
    city: t("city"),
    province: t("province"),
    status: t("siteStatus"),
    startDate: t("siteStartDate"),
    endDate: t("siteEndDate"),
    accessNotes: t("accessNotes"),
    safetyNotes: t("safetyNotes"),
  } as SiteInput;
}

function failure(error: unknown): FormState {
  if (error instanceof ValidationError) {
    const { form, ...fields } = error.fieldErrors;
    return { error: form ?? "Controlla i campi evidenziati.", fieldErrors: fields };
  }
  const message = userMessage(error);
  if (message === UNEXPECTED_ERROR) console.error("[commesse]", error);
  return { error: message };
}

function refresh(id?: string) {
  revalidatePath("/app/commesse");
  if (id) revalidatePath(`/app/commesse/${id}`);
}

export async function createProjectAction(_: FormState, form: FormData): Promise<FormState> {
  const withSite = formText(form, "withSite") === "1";
  const withMoney = formText(form, "withFinancials") === "1";
  try {
    const { id } = await asCurrentUser(async (tx) =>
      createProject(tx, await resolveActiveTenant(tx), readProject(form), {
        ...(withMoney ? { financials: readFinancials(form) } : {}),
        ...(withSite ? { site: readSite(form) } : {}),
      }),
    );
    refresh();
    return { message: "Commessa creata.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateProjectAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      updateProject(
        tx,
        await resolveActiveTenant(tx),
        id,
        readProject(form),
        formText(form, "version") ?? "",
      ),
    );
    refresh(id);
    return { message: "Modifiche salvate.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function saveFinancialsAction(_: FormState, form: FormData): Promise<FormState> {
  const id = formText(form, "id") ?? "";
  try {
    await asCurrentUser(async (tx) =>
      saveProjectFinancials(tx, await resolveActiveTenant(tx), id, readFinancials(form)),
    );
    refresh(id);
    return { message: "Importi salvati.", createdId: id };
  } catch (error) {
    return failure(error);
  }
}

export async function setProjectStatusAction(
  id: string,
  status: ProjectStatus,
): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      setProjectStatus(tx, await resolveActiveTenant(tx), id, status),
    );
    refresh(id);
    return { message: "Stato aggiornato." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteProjectAction(id: string): Promise<void> {
  await asCurrentUser(async (tx) => deleteProject(tx, await resolveActiveTenant(tx), id));
  refresh(id);
  redirect("/app/commesse?eliminata=1");
}

export async function saveSiteAction(_: FormState, form: FormData): Promise<FormState> {
  const projectId = formText(form, "projectId") ?? "";
  const siteId = formText(form, "siteId");
  try {
    await asCurrentUser(async (tx) => {
      const access = await resolveActiveTenant(tx);
      if (siteId) await updateProjectSite(tx, access, siteId, readSite(form));
      else await createProjectSite(tx, access, projectId, readSite(form));
    });
    refresh(projectId);
    return {
      message: siteId ? "Cantiere aggiornato." : "Cantiere aggiunto.",
      createdId: projectId,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function removeSiteAction(projectId: string, siteId: string): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) => removeProjectSite(tx, await resolveActiveTenant(tx), siteId));
    refresh(projectId);
    return { message: "Cantiere tolto." };
  } catch (error) {
    return failure(error);
  }
}
