/**
 * Geocodifica con OpenStreetMap Nominatim (servizio gratuito, senza chiave).
 * Regole d'uso del servizio pubblico rispettate: al massimo una richiesta al
 * secondo da questo processo, User-Agent che identifica l'applicazione, nessuna
 * ricerca in blocco automatica, risultato salvato sulla riga (cache) e
 * attribuzione «© OpenStreetMap» sulla mappa. Con GEOCODING_URL vuota la
 * geocodifica è disattivata e resta solo il posizionamento a mano.
 */
export interface GeocoderConfig {
  /** es. https://nominatim.openstreetmap.org (null = disattivata) */
  url: string | null;
  /** User-Agent richiesto dalle regole di Nominatim */
  userAgent: string;
  /** contatto facoltativo per il gestore del servizio (parametro email) */
  contactEmail?: string | null;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** indirizzo come l'ha capito il servizio, da mostrare all'utente */
  label: string;
}

export class GeocodingUnavailableError extends Error {
  override readonly name = "GeocodingUnavailableError";
}

let last = 0;
let queue: Promise<void> = Promise.resolve();

/** Una richiesta al secondo per processo, in coda. */
function throttle(): Promise<void> {
  const next = queue.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
  });
  queue = next.catch(() => undefined);
  return next;
}

export async function geocodeAddress(
  config: GeocoderConfig,
  address: string,
  opts: { countryCodes?: string; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<GeocodeResult | null> {
  if (!config.url) throw new GeocodingUnavailableError("geocodifica non configurata");
  const q = address.trim().slice(0, 300);
  if (!q) return null;
  const url = new URL("/search", config.url);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("accept-language", "it");
  if (opts.countryCodes) url.searchParams.set("countrycodes", opts.countryCodes.toLowerCase());
  if (config.contactEmail) url.searchParams.set("email", config.contactEmail);

  await throttle();
  const res = await (opts.fetchImpl ?? fetch)(url, {
    headers: { "User-Agent": config.userAgent, Accept: "application/json" },
    signal: opts.signal ?? AbortSignal.timeout(8000),
  }).catch((error: unknown) => {
    throw new GeocodingUnavailableError("servizio di geocodifica non raggiungibile", {
      cause: error,
    });
  });
  if (!res.ok) throw new GeocodingUnavailableError(`geocodifica: risposta ${res.status}`);
  const data = (await res.json()) as { lat?: string; lon?: string; display_name?: string }[];
  const hit = data[0];
  if (!hit?.lat || !hit.lon) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: hit.display_name ?? q };
}
