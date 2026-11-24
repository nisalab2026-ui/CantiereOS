"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { MapPinOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { MapTiles } from "@/lib/map-config";

export interface RouteStop {
  id: string;
  title: string;
  time: string;
  lat: number | null;
  lng: number | null;
  /** stato per il colore del segnaposto */
  status: "scheduled" | "in_progress" | "suspended" | "completed" | "cancelled";
  href: string;
}

const STATUS_COLOR: Record<RouteStop["status"], string> = {
  scheduled: "var(--primary)",
  in_progress: "var(--info)",
  suspended: "var(--warning)",
  completed: "var(--success)",
  cancelled: "var(--muted-foreground)",
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/**
 * Le tappe della giornata in ordine: segnaposto numerati colorati per stato e
 * il percorso previsto che si disegna da una tappa all'altra. Non mostra
 * dove si trova la persona (ADR-017).
 */
export function RouteMap({
  stops,
  tiles,
  className,
}: {
  stops: RouteStop[];
  tiles: MapTiles;
  className?: string;
}) {
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const located = stops.filter(
    (s): s is RouteStop & { lat: number; lng: number } => s.lat !== null && s.lng !== null,
  );
  const signature = located.map((s) => `${s.id}:${s.lat}:${s.lng}:${s.status}`).join("|");

  useEffect(() => {
    if (!boxRef.current || located.length === 0) return;
    let map: Leaflet.Map | null = null;
    let cancelled = false;
    void import("leaflet").then((mod) => {
      const L = (mod.default ?? mod) as typeof Leaflet;
      if (cancelled || !boxRef.current) return;
      map = L.map(boxRef.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
      });
      map.attributionControl.setPrefix(false);
      L.tileLayer(tiles.url, {
        attribution: tiles.attribution,
        maxZoom: 19,
        crossOrigin: true,
      }).addTo(map);
      const points = located.map((s) => L.latLng(s.lat, s.lng));
      if (points.length > 1) {
        L.polyline(points, {
          color: "var(--primary)",
          weight: 4,
          opacity: 0.85,
          lineCap: "round",
          lineJoin: "round",
          className: "cos-route",
        }).addTo(map);
      }
      located.forEach((s, i) => {
        const n = stops.indexOf(s) + 1;
        const icon = L.divIcon({
          className: "cos-stop",
          html: `<span style="--stop:${STATUS_COLOR[s.status]};--i:${i}">${n}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        L.marker([s.lat, s.lng], { icon, title: `${n}. ${s.title}`, keyboard: true })
          .addTo(map!)
          .bindTooltip(`<strong>${esc(s.time)}</strong> ${esc(s.title)}`, {
            direction: "top",
            offset: [0, -14],
          })
          .on("click", () => router.push(s.href));
      });
      map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 15 });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, tiles.url]);

  if (located.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        <MapPinOff className="size-5" aria-hidden />
        {stops.length === 0
          ? "Nessuna tappa da mostrare."
          : "Gli indirizzi di queste tappe non sono ancora sulla mappa."}
      </div>
    );
  }
  return (
    <div
      ref={boxRef}
      role="region"
      aria-label={`Mappa: ${located.length} ${located.length === 1 ? "tappa" : "tappe"}`}
      className={cn("cos-map isolate overflow-hidden rounded-2xl border border-border", className)}
    />
  );
}
