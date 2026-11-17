"use server";

import {
  geocodeAddress,
  getMapAddress,
  GeocodingUnavailableError,
  MAP_KINDS,
  resolveActiveTenant,
  setMapLocation,
  ValidationError,
  type MapKind,
} from "@cantiereos/core";
import { revalidatePath } from "next/cache";
import { asCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { userMessage } from "@/lib/messages";
import { checkRateLimits } from "@/lib/rate-limit";

export type MapActionResult =
  | { ok: true; lat: number | null; lng: number | null; label?: string }
  | { ok: false; error: string; notFound?: boolean };

const isKind = (k: string): k is MapKind => (MAP_KINDS as readonly string[]).includes(k);

function refresh() {
  revalidatePath("/app/clienti/mappa");
  revalidatePath("/app");
}

/** Puntina messa a mano (o tolta con lat/lng null). */
export async function setLocationAction(
  kind: string,
  id: string,
  lat: number | null,
  lng: number | null,
): Promise<MapActionResult> {
  if (!isKind(kind)) return { ok: false, error: "Elemento non valido." };
  try {
    const found = await asCurrentUser(async (tx) =>
      setMapLocation(tx, await resolveActiveTenant(tx), { kind, id, lat, lng, source: "manual" }),
    );
    if (!found) return { ok: false, error: "Elemento non trovato." };
    refresh();
    return { ok: true, lat, lng };
  } catch (error) {
    if (error instanceof ValidationError)
      return { ok: false, error: error.fieldErrors.form ?? "Posizione non valida." };
    return { ok: false, error: userMessage(error) };
  }
}

/** Cerca la posizione dall'indirizzo salvato (OpenStreetMap Nominatim) e la salva. */
export async function geocodeAction(kind: string, id: string): Promise<MapActionResult> {
  if (!isKind(kind)) return { ok: false, error: "Elemento non valido." };
  const e = env();
  if (e.GEOCODING_URL === "off")
    return {
      ok: false,
      error: "La ricerca automatica della posizione è disattivata: mettila a mano.",
    };
  try {
    // 1) indirizzo e permesso (transazione breve, RLS attiva)
    const found = await asCurrentUser(async (tx) => {
      const access = await resolveActiveTenant(tx);
      return { tenantId: access.tenantId, address: await getMapAddress(tx, access, kind, id) };
    });
    if (!found.address)
      return {
        ok: false,
        error: "Manca l'indirizzo (almeno la città): completalo o metti la puntina a mano.",
      };
    const limited = await checkRateLimits([["geocode_tenant", found.tenantId]]);
    if (limited) return { ok: false, error: limited };
    // 2) servizio esterno, fuori dalla transazione
    const hit = await geocodeAddress(
      {
        url: e.GEOCODING_URL ?? "https://nominatim.openstreetmap.org",
        userAgent: `CantiereOS/0.1 (+${new URL(e.APP_URL).origin})`,
        contactEmail: e.GEOCODING_CONTACT_EMAIL ?? null,
      },
      found.address,
    );
    if (!hit)
      return {
        ok: false,
        notFound: true,
        error: "Indirizzo non trovato sulla mappa: controllalo o metti la puntina a mano.",
      };
    // 3) salvataggio (di nuovo con RLS e permessi)
    const saved = await asCurrentUser(async (tx) =>
      setMapLocation(tx, await resolveActiveTenant(tx), {
        kind,
        id,
        lat: hit.lat,
        lng: hit.lng,
        source: "geocoded",
      }),
    );
    if (!saved) return { ok: false, error: "Elemento non trovato." };
    refresh();
    return { ok: true, lat: hit.lat, lng: hit.lng, label: hit.label };
  } catch (error) {
    if (error instanceof GeocodingUnavailableError)
      return {
        ok: false,
        error:
          "Il servizio che trova gli indirizzi non risponde ora. Riprova più tardi o metti la puntina a mano.",
      };
    return { ok: false, error: userMessage(error) };
  }
}
