/**
 * Configurazione della mappa (ADR-016), letta sul server e passata ai componenti.
 * Sfondo predefinito: tile di OpenStreetMap (gratuite, senza chiave, attribuzione
 * obbligatoria). Per volumi alti si imposta MAP_TILE_URL verso un fornitore di
 * tile o un server proprio, con la sua attribuzione in MAP_TILE_ATTRIBUTION.
 */
export const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const DEFAULT_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

export interface MapTiles {
  url: string;
  attribution: string;
}

export function mapTiles(): MapTiles {
  const url = process.env.MAP_TILE_URL?.trim() || DEFAULT_TILE_URL;
  return {
    url,
    attribution: process.env.MAP_TILE_ATTRIBUTION?.trim() || DEFAULT_TILE_ATTRIBUTION,
  };
}

/** Origine delle tile per la CSP (img-src). */
export function mapTileOrigin(): string {
  try {
    return new URL(mapTiles().url.replace(/\{[a-z]\}/gi, "a")).origin;
  } catch {
    return "";
  }
}
