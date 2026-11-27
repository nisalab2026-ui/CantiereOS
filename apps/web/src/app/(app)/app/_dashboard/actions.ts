"use server";

import {
  DASHBOARD_LAYOUT_KEY,
  dashboardLayoutSchema,
  deletePreference,
  resolveActiveTenant,
  setPreference,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { asCurrentUser } from "@/lib/auth";
import { userMessage, type FormState } from "@/lib/messages";

/**
 * Salva la disposizione personale della panoramica. Solo identificativi di
 * widget noti; l'utente e l'azienda vengono dalla sessione verificata (RLS).
 */
export async function saveDashboardLayoutAction(input: unknown): Promise<FormState> {
  const parsed = dashboardLayoutSchema.safeParse(input);
  if (!parsed.success) return { error: "Disposizione non valida." };
  try {
    await asCurrentUser(async (tx) =>
      setPreference(tx, await resolveActiveTenant(tx), DASHBOARD_LAYOUT_KEY, parsed.data),
    );
    revalidatePath("/app");
    return { message: "Panoramica aggiornata." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function resetDashboardLayoutAction(): Promise<FormState> {
  try {
    await asCurrentUser(async (tx) =>
      deletePreference(tx, await resolveActiveTenant(tx), DASHBOARD_LAYOUT_KEY),
    );
    revalidatePath("/app");
    return { message: "Panoramica riportata all'impostazione iniziale." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
