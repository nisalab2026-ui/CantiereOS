"use server";

import {
  globalSearch,
  listNotifications,
  markNotificationsRead,
  resolveActiveTenant,
  switchActiveTenant,
  type NotificationItem,
  type SearchResult,
} from "@cantiereos/core";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asCurrentUser } from "@/lib/auth";
import { THEME_COOKIE, type ThemePreference } from "@/lib/theme";

const YEAR = 60 * 60 * 24 * 365;

/** Cambio azienda attiva: verificato nel database (membro attivo). */
export async function switchCompanyTo(tenantId: string): Promise<void> {
  await asCurrentUser((tx) => switchActiveTenant(tx, String(tenantId))).catch(() => undefined);
  redirect("/app");
}

export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  (await cookies()).set("cos_sidebar", collapsed ? "collapsed" : "expanded", {
    path: "/",
    maxAge: YEAR,
    sameSite: "lax",
    httpOnly: true,
  });
}

export async function setTheme(theme: ThemePreference): Promise<void> {
  const value: ThemePreference = theme === "light" || theme === "dark" ? theme : "system";
  (await cookies()).set(THEME_COOKIE, value, {
    path: "/",
    maxAge: YEAR,
    sameSite: "lax",
    httpOnly: true,
  });
}

/** Ricerca globale nell'azienda attiva (permessi + RLS). */
export async function searchAction(term: string): Promise<SearchResult[]> {
  if (typeof term !== "string" || term.trim().length < 2) return [];
  return asCurrentUser(async (tx) => globalSearch(tx, await resolveActiveTenant(tx), term));
}

export async function loadNotifications(): Promise<{ items: NotificationItem[]; unread: number }> {
  return asCurrentUser(async (tx) => listNotifications(tx, await resolveActiveTenant(tx), 20));
}

export async function markNotificationsReadAction(ids: string[] = []): Promise<void> {
  const list = Array.isArray(ids) ? ids.map(String) : [];
  await asCurrentUser(async (tx) => markNotificationsRead(tx, await resolveActiveTenant(tx), list));
}
