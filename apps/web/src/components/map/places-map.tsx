"use client";

import "leaflet/dist/leaflet.css";
import type { MapKind, MapPoint } from "@cantiereos/core";
import type * as Leaflet from "leaflet";
import {
  Crosshair,
  Expand,
  HardHat,
  Loader2,
  MapPin,
  MapPinOff,
  Search,
  Sparkles,
  Store,
  Building2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { geocodeAction, setLocationAction } from "@/app/(app)/app/clienti/mappa/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { MapTiles } from "@/lib/map-config";

const KIND_LABEL: Record<MapKind, string> = {
  customer: "Cliente",
  customer_site: "Sede",
  project_site: "Cantiere",
};
const KIND_PLURAL: Record<MapKind, string> = {
  customer: "Clienti",
  customer_site: "Sedi",
  project_site: "Cantieri",
};
const KIND_ICON = { customer: Building2, customer_site: Store, project_site: HardHat } as const;
const KIND_DOT: Record<MapKind, string> = {
  customer: "bg-primary",
  customer_site: "bg-cyan",
  project_site: "bg-warning",
};
/** Centro d'Italia: vista iniziale senza punti. */
const ITALY: [number, number] = [42.5, 12.5];
const BULK_MAX = 20;

const keyOf = (p: Pick<MapPoint, "kind" | "id">) => `${p.kind}:${p.id}`;
const located = (p: MapPoint): p is MapPoint & { lat: number; lng: number } =>
  p.lat !== null && p.lng !== null;

type Status = { tone: "info" | "error" | "success"; text: string } | null;

export function PlacesMap({
  points: initial,
  tiles,
  variant = "full",
  geocoding = true,
  focus,
  fullHref = "/app/clienti/mappa",
}: {
  points: MapPoint[];
  tiles: MapTiles;
  variant?: "full" | "compact";
  /** ricerca automatica dell'indirizzo disponibile */
  geocoding?: boolean;
  /** chiave kind:id da mettere in evidenza all'apertura */
  focus?: string;
  fullHref?: string;
}) {
  const full = variant === "full";
  const router = useRouter();
  const [points, setPoints] = useState(initial);
  useEffect(() => setPoints(initial), [initial]);

  const kindsPresent = useMemo(
    () =>
      (["customer", "customer_site", "project_site"] as MapKind[]).filter((k) =>
        initial.some((p) => p.kind === k),
      ),
    [initial],
  );
  const [kinds, setKinds] = useState<Set<MapKind>>(() => new Set(kindsPresent));
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [selected, setSelected] = useState<string | null>(focus ?? null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const bulkStop = useRef(false);
  const [, startTransition] = useTransition();

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return points.filter(
      (p) =>
        kinds.has(p.kind) &&
        (!onlyMissing || !located(p)) &&
        (!needle || `${p.name} ${p.subtitle ?? ""} ${p.address}`.toLowerCase().includes(needle)),
    );
  }, [points, kinds, q, onlyMissing]);
  const missing = points.filter((p) => !located(p));
  const counts = useMemo(() => {
    const c: Record<MapKind, number> = { customer: 0, customer_site: 0, project_site: 0 };
    for (const p of points) if (located(p)) c[p.kind]++;
    return c;
  }, [points]);

  // --- Leaflet --------------------------------------------------------------
  const boxRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, Leaflet.Marker>());
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const placingRef = useRef<string | null>(null);
  placingRef.current = placing;

  const patch = useCallback(
    (key: string, lat: number | null, lng: number | null, source: MapPoint["source"]) => {
      setPoints((all) => all.map((p) => (keyOf(p) === key ? { ...p, lat, lng, source } : p)));
    },
    [],
  );

  const setBusyKey = (key: string, on: boolean) =>
    setBusy((b) => {
      const n = new Set(b);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });

  const saveManual = useCallback(
    async (p: MapPoint, lat: number | null, lng: number | null) => {
      const key = keyOf(p);
      const prev = { lat: p.lat, lng: p.lng, source: p.source };
      patch(key, lat, lng, lat === null ? null : "manual");
      setBusyKey(key, true);
      const r = await setLocationAction(p.kind, p.id, lat, lng);
      setBusyKey(key, false);
      if (!r.ok) {
        patch(key, prev.lat, prev.lng, prev.source);
        setStatus({ tone: "error", text: r.error });
      } else {
        setStatus({
          tone: "success",
          text:
            lat === null ? `Posizione di «${p.name}» tolta.` : `Posizione di «${p.name}» salvata.`,
        });
        startTransition(() => router.refresh());
      }
    },
    [patch, router],
  );

  const geocode = useCallback(
    async (p: MapPoint, quiet = false) => {
      const key = keyOf(p);
      setBusyKey(key, true);
      const r = await geocodeAction(p.kind, p.id);
      setBusyKey(key, false);
      if (r.ok && r.lat !== null && r.lng !== null) {
        patch(key, r.lat, r.lng, "geocoded");
        if (!quiet) {
          setSelected(key);
          setStatus({ tone: "success", text: `Trovato: ${r.label ?? p.address}` });
        }
        return true;
      }
      if (!r.ok && !quiet) setStatus({ tone: "error", text: r.error });
      return r.ok ? true : r.notFound ? false : null;
    },
    [patch],
  );

  // inizializza la mappa una volta
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((mod) => {
      const L = (mod.default ?? mod) as typeof Leaflet;
      if (cancelled || !boxRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(boxRef.current, {
        center: ITALY,
        zoom: 6,
        zoomControl: false,
        scrollWheelZoom: full,
        attributionControl: true,
        worldCopyJump: true,
      });
      map.attributionControl.setPrefix(false);
      L.control.zoom({ position: "bottomright", zoomInTitle: "Avvicina", zoomOutTitle: "Allontana" }).addTo(map);
      L.tileLayer(tiles.url, {
        attribution: tiles.attribution,
        maxZoom: 19,
        crossOrigin: true,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        const key = placingRef.current;
        if (!key) return;
        window.dispatchEvent(
          new CustomEvent("cos-map-place", {
            detail: { key, lat: e.latlng.lat, lng: e.latlng.lng },
          }),
        );
      });
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
      fitted.current = false;
    };
  }, [tiles.url, tiles.attribution, full]);

  // click sulla mappa in modalità "metti a mano"
  useEffect(() => {
    const onPlace = (e: Event) => {
      const { key, lat, lng } = (e as CustomEvent<{ key: string; lat: number; lng: number }>)
        .detail;
      const p = points.find((x) => keyOf(x) === key);
      setPlacing(null);
      if (p) {
        setSelected(key);
        void saveManual(p, lat, lng);
      }
    };
    window.addEventListener("cos-map-place", onPlace);
    return () => window.removeEventListener("cos-map-place", onPlace);
  }, [points, saveManual]);

  // popup costruito con nodi DOM (nessun HTML dai dati)
  const popupFor = useCallback(
    (p: MapPoint) => {
      const root = document.createElement("div");
      root.className = "min-w-44 max-w-64";
      const kind = document.createElement("p");
      kind.className =
        "text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase";
      kind.textContent = KIND_LABEL[p.kind];
      const title = document.createElement("p");
      title.className = "mt-0.5 font-semibold text-foreground";
      title.textContent = p.name;
      root.append(kind, title);
      if (p.subtitle) {
        const sub = document.createElement("p");
        sub.className = "text-xs text-muted-foreground";
        sub.textContent = p.subtitle;
        root.append(sub);
      }
      if (p.address) {
        const addr = document.createElement("p");
        addr.className = "mt-1 text-xs";
        addr.textContent = p.address;
        root.append(addr);
      }
      const src = document.createElement("p");
      src.className = "mt-1 text-[11px] text-muted-foreground";
      src.textContent =
        p.source === "manual" ? "Puntina messa a mano" : "Posizione trovata dall'indirizzo";
      root.append(src);
      const row = document.createElement("div");
      row.className = "mt-2 flex flex-wrap gap-1.5";
      const btn = (label: string, onClick: () => void, tone: "primary" | "ghost" = "ghost") => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.className = cn(
          "rounded-md px-2 py-1 text-xs font-medium",
          tone === "primary"
            ? "bg-primary text-primary-foreground"
            : "border border-border hover:bg-accent",
        );
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onClick();
        });
        return b;
      };
      row.append(btn("Apri scheda", () => router.push(p.href), "primary"));
      if (p.canEdit && full) {
        row.append(
          btn("Sposta", () => {
            mapRef.current?.closePopup();
            setMoving(keyOf(p));
            setStatus({
              tone: "info",
              text: `Trascina la puntina di «${p.name}» nel punto giusto.`,
            });
          }),
          btn("Togli", () => {
            mapRef.current?.closePopup();
            void saveManual(p, null, null);
          }),
        );
      }
      root.append(row);
      return root;
    },
    [full, router, saveManual],
  );

  // disegna le puntine visibili
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    const shown = visible.filter(located);
    shown.forEach((p, i) => {
      const key = keyOf(p);
      const icon = L.divIcon({
        className: "cos-pin-wrap",
        html: `<div class="cos-pin" data-kind="${p.kind}" data-inactive="${p.status === "inactive" || p.status === "closed"}" style="--d:${Math.min(i, 30) * 18}ms"></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 34],
        popupAnchor: [0, -32],
      });
      const m = L.marker([p.lat, p.lng], {
        icon,
        title: p.name,
        alt: `${KIND_LABEL[p.kind]}: ${p.name}`,
        draggable: key === moving,
        keyboard: true,
        riseOnHover: true,
      });
      m.bindPopup(() => popupFor(p), { closeButton: true, autoPanPadding: [24, 24] });
      m.on("click", () => setSelected(key));
      m.on("dragend", () => {
        const ll = m.getLatLng();
        setMoving(null);
        void saveManual(p, ll.lat, ll.lng);
      });
      m.addTo(layer);
      markersRef.current.set(key, m);
    });
    if (!fitted.current && shown.length > 0) {
      fitted.current = true;
      const target = focus ? shown.find((p) => keyOf(p) === focus) : undefined;
      if (target) map.setView([target.lat, target.lng], 15);
      else if (shown.length === 1) map.setView([shown[0]!.lat, shown[0]!.lng], 13);
      else
        map.fitBounds(L.latLngBounds(shown.map((p) => [p.lat, p.lng])), {
          padding: [40, 40],
          maxZoom: 14,
        });
    }
  }, [ready, visible, moving, popupFor, saveManual, focus]);

  const fitAll = () => {
    const L = LRef.current;
    const map = mapRef.current;
    const shown = visible.filter(located);
    if (!L || !map || shown.length === 0) return;
    map.flyToBounds(L.latLngBounds(shown.map((p) => [p.lat, p.lng])), {
      padding: [40, 40],
      maxZoom: 14,
      duration: 0.8,
    });
  };

  const goTo = (p: MapPoint) => {
    const key = keyOf(p);
    setSelected(key);
    if (!located(p)) return;
    const map = mapRef.current;
    map?.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
    window.setTimeout(() => markersRef.current.get(key)?.openPopup(), 850);
    boxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const startPlacing = (p: MapPoint) => {
    setPlacing(keyOf(p));
    setMoving(null);
    setStatus({ tone: "info", text: `Tocca la mappa nel punto dove si trova «${p.name}».` });
    boxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const runBulk = async () => {
    const todo = missing.filter((p) => p.canEdit && p.query).slice(0, BULK_MAX);
    if (todo.length === 0) return;
    bulkStop.current = false;
    setBulk({ done: 0, total: todo.length });
    setStatus(null);
    let found = 0;
    let notFound = 0;
    for (const [i, p] of todo.entries()) {
      if (bulkStop.current) break;
      const r = await geocode(p, true);
      if (r === true) found++;
      else if (r === false) notFound++;
      else {
        setStatus({
          tone: "error",
          text: "La ricerca si è fermata: il servizio non risponde o il limite orario è raggiunto.",
        });
        break;
      }
      setBulk({ done: i + 1, total: todo.length });
    }
    setBulk(null);
    if (found || notFound)
      setStatus({
        tone: notFound ? "info" : "success",
        text: `Posizioni trovate: ${found}${notFound ? `. Non trovate: ${notFound} (mettile a mano)` : ""}.`,
      });
    startTransition(() => router.refresh());
  };

  const toggleKind = (k: MapKind) =>
    setKinds((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const totalLocated = counts.customer + counts.customer_site + counts.project_site;
  const editableMissing = missing.filter((p) => p.canEdit).length;

  // --- Interfaccia ----------------------------------------------------------
  const mapBox = (
    <div className="relative">
      <div
        ref={boxRef}
        className={cn(
          "cos-map z-0 w-full overflow-hidden",
          full
            ? "h-[62vh] min-h-[360px] rounded-xl lg:h-[calc(100vh-15rem)]"
            : "h-72 rounded-b-lg sm:h-80",
          placing && "is-placing",
        )}
        role="region"
        aria-label="Mappa di clienti, sedi e cantieri"
        data-testid="places-map"
      />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
        </div>
      )}
      {/* legenda e comandi sopra la mappa, in vetro */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex items-start justify-between gap-2">
        <div className="cos-glass pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-border p-1 text-xs">
          {kindsPresent.map((k) => {
            const Icon = KIND_ICON[k];
            const on = kinds.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium transition-colors",
                  on ? "bg-accent text-foreground" : "text-muted-foreground opacity-60",
                )}
              >
                <span className={cn("size-2 rounded-full", KIND_DOT[k])} aria-hidden />
                <Icon className="size-3.5" aria-hidden />
                {KIND_PLURAL[k]}
                <span className="font-mono tabular-nums text-muted-foreground">{counts[k]}</span>
              </button>
            );
          })}
        </div>
        <div className="pointer-events-auto flex gap-1.5">
          <button
            type="button"
            onClick={fitAll}
            className="cos-glass inline-flex size-9 items-center justify-center rounded-xl border border-border text-foreground hover:bg-accent"
            aria-label="Inquadra tutti i punti"
            title="Inquadra tutti i punti"
          >
            <Crosshair className="size-4" aria-hidden />
          </button>
          {!full && (
            <Link
              href={fullHref}
              className="cos-glass inline-flex size-9 items-center justify-center rounded-xl border border-border text-foreground hover:bg-accent"
              aria-label="Apri la mappa completa"
              title="Apri la mappa completa"
            >
              <Expand className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>
      {(placing || moving) && (
        <div className="absolute inset-x-3 bottom-8 z-[500] flex justify-center">
          <div className="cos-glass flex items-center gap-3 rounded-xl border border-primary/40 px-3 py-2 text-sm shadow-lg">
            <MapPin className="size-4 text-primary" aria-hidden />
            <span>
              {placing
                ? "Tocca la mappa per mettere la puntina"
                : "Trascina la puntina evidenziata"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPlacing(null);
                setMoving(null);
                setStatus(null);
              }}
            >
              Annulla
            </Button>
          </div>
        </div>
      )}
      {ready && totalLocated === 0 && !placing && (
        <div className="pointer-events-none absolute inset-0 z-[400] grid place-items-center p-6">
          <div className="cos-glass pointer-events-auto max-w-sm rounded-xl border border-border p-4 text-center text-sm">
            <MapPinOff className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-2 font-medium">Nessun punto sulla mappa</p>
            <p className="mt-1 text-muted-foreground">
              {full
                ? "Trova le posizioni dagli indirizzi o mettile a mano dall'elenco."
                : "Apri la mappa per trovare le posizioni di clienti e cantieri."}
            </p>
            {!full && (
              <Link
                href={fullHref}
                className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
              >
                Apri la mappa
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (!full) return mapBox;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="bg-card relative min-w-0 rounded-2xl border border-border p-1.5 shadow-xs">
        {mapBox}
      </div>

      <aside className="bg-card flex min-h-0 flex-col rounded-2xl border border-border shadow-xs lg:max-h-[calc(100vh-14rem)]">
        <div className="space-y-3 border-b border-border p-4">
          <label className="relative block">
            <span className="sr-only">Cerca sulla mappa</span>
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca cliente, cantiere, città"
              className="h-9 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-sm outline-none focus-visible:border-primary"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              aria-pressed={onlyMissing}
              onClick={() => setOnlyMissing((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                onlyMissing
                  ? "border-warning/50 bg-warning/10 text-warning"
                  : "border-border text-muted-foreground",
              )}
            >
              <MapPinOff className="size-3.5" aria-hidden />
              Senza posizione: {missing.length}
            </button>
            {geocoding && editableMissing > 0 && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2.5 text-xs"
                loading={Boolean(bulk)}
                onClick={() => void runBulk()}
                data-testid="map-bulk-geocode"
              >
                {!bulk && <Sparkles aria-hidden />}
                {bulk
                  ? `Ricerca ${bulk.done}/${bulk.total}`
                  : `Trova dagli indirizzi (max ${Math.min(BULK_MAX, editableMissing)})`}
              </Button>
            )}
            {bulk && (
              <button
                type="button"
                className="text-muted-foreground underline"
                onClick={() => {
                  bulkStop.current = true;
                }}
              >
                Ferma
              </button>
            )}
          </div>
          {status && (
            <p
              role="status"
              className={cn(
                "flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs",
                status.tone === "error" && "bg-danger/10 text-danger",
                status.tone === "success" && "bg-success/10 text-success",
                status.tone === "info" && "bg-accent text-foreground",
              )}
            >
              <span className="min-w-0 flex-1">{status.text}</span>
              <button type="button" onClick={() => setStatus(null)} aria-label="Chiudi messaggio">
                <X className="size-3.5" aria-hidden />
              </button>
            </p>
          )}
        </div>
        <ul
          className="min-h-0 flex-1 divide-y divide-border overflow-y-auto"
          data-testid="map-list"
        >
          {visible.length === 0 && (
            <li className="p-6 text-center text-sm text-muted-foreground">
              Nessun elemento con questi filtri.
            </li>
          )}
          {visible.slice(0, 400).map((p) => {
            const key = keyOf(p);
            const Icon = KIND_ICON[p.kind];
            const isBusy = busy.has(key);
            return (
              <li
                key={key}
                className={cn("group px-4 py-3 transition-colors", key === selected && "bg-accent")}
                data-testid="map-item"
              >
                <button
                  type="button"
                  onClick={() => goTo(p)}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-white",
                      KIND_DOT[p.kind],
                      !located(p) && "opacity-40",
                    )}
                    aria-hidden
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[p.subtitle, p.address].filter(Boolean).join(" · ") || "Indirizzo mancante"}
                    </span>
                  </span>
                  {isBusy && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                  )}
                </button>
                {!located(p) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-10">
                    <span className="text-[11px] text-warning">Senza posizione</span>
                    {p.canEdit && geocoding && p.query && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        disabled={isBusy || Boolean(bulk)}
                        onClick={() => void geocode(p)}
                      >
                        <Search aria-hidden /> Trova
                      </Button>
                    )}
                    {p.canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        disabled={isBusy}
                        onClick={() => startPlacing(p)}
                      >
                        <MapPin aria-hidden /> Metti a mano
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-muted-foreground">
          Mappa e ricerca indirizzi: © OpenStreetMap e i suoi collaboratori. Le posizioni trovate
          sono indicative: correggile trascinando la puntina.
        </p>
      </aside>
    </div>
  );
}
