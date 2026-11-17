"use client";

import { MAX_PHOTOS, type FormField, type FormValue } from "@cantiereos/core/forms";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { finishPhotoUploadAction, startPhotoUploadAction } from "./actions";

/**
 * Campo "Foto" dei moduli (ADR-013). Il telefono apre la fotocamera; la foto
 * viene ridotta nel browser (lato lungo 1600 px, JPEG) prima di partire, poi
 * caricata direttamente nello storage privato con un URL firmato e verificata
 * dal server. Nel modulo resta solo l'elenco degli id.
 */
export interface PhotoInfo {
  url: string;
  name: string;
}

interface PhotoCtx {
  submissionId: string;
  photos: Record<string, PhotoInfo>;
  add: (id: string, info: PhotoInfo) => void;
}

const Ctx = createContext<PhotoCtx | null>(null);

export function FormPhotosProvider({
  submissionId,
  initial,
  children,
}: {
  submissionId: string;
  initial: Record<string, PhotoInfo>;
  children: React.ReactNode;
}) {
  const [photos, setPhotos] = useState(initial);
  useEffect(() => setPhotos((p) => ({ ...p, ...initial })), [initial]);
  return (
    <Ctx.Provider
      value={{ submissionId, photos, add: (id, info) => setPhotos((p) => ({ ...p, [id]: info })) }}
    >
      {children}
    </Ctx.Provider>
  );
}

const MAX_SIDE = 1600;
const QUALITY = 0.82;
const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Riduce la foto nel browser. Se il formato non si decodifica, usa l'originale se ammesso. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", QUALITY));
    if (blob && blob.size > 0) return blob;
  } catch {
    /* formato non decodificabile qui: proviamo con il file originale */
  }
  if (OK_TYPES.includes(file.type)) return file;
  throw new Error("Formato non supportato: usa una foto JPEG, PNG o WebP.");
}

const jpgName = (name: string) => `${name.replace(/\.[^.]*$/, "").slice(0, 100) || "foto"}.jpg`;

interface Pending {
  key: string;
  name: string;
  error?: string;
}

export function PhotoField({
  field,
  id,
  value,
  error,
  onChange,
}: {
  field: Extract<FormField, { type: "photo" }>;
  id: string;
  value: FormValue | undefined;
  error?: string | undefined;
  onChange: (v: FormValue) => void;
}) {
  const ctx = useContext(Ctx);
  const ids = Array.isArray(value) ? (value as string[]) : [];
  const latest = useRef(ids);
  latest.current = ids;
  const [pending, setPending] = useState<Pending[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const max = field.maxPhotos ?? MAX_PHOTOS;
  const busy = pending.some((p) => !p.error);
  const room = max - ids.length - pending.filter((p) => !p.error).length;

  const upload = async (files: File[]) => {
    if (!ctx) return;
    const list = files.slice(0, Math.max(0, room));
    const items = list.map((f) => ({ key: `${Date.now()}-${Math.random()}`, name: f.name }));
    setPending((p) => [...p.filter((x) => !x.error), ...items]);
    for (const [i, file] of list.entries()) {
      const item = items[i]!;
      const fail = (msg: string) =>
        setPending((p) => p.map((x) => (x.key === item.key ? { ...x, error: msg } : x)));
      try {
        const blob = await shrink(file);
        if (blob.size > MAX_BYTES) throw new Error("La foto supera i 10 MB.");
        const type = blob.type || file.type;
        const name = type === "image/jpeg" ? jpgName(file.name) : file.name;
        const t = await startPhotoUploadAction(ctx.submissionId, {
          fieldId: field.id,
          name,
          size: blob.size,
          type,
        });
        if (!t.ok) throw new Error(t.error);
        await fetch(t.uploadUrl, {
          method: "PUT",
          headers: { "content-type": type, "x-upsert": "false" },
          body: blob,
        }).catch(() => null);
        // anche se l'invio fallisce chiediamo la verifica: il server scarta la scheda
        const r = await finishPhotoUploadAction(t.fileId);
        if (!r.ok) throw new Error(r.error);
        ctx.add(r.fileId, { url: r.url, name });
        onChange([...latest.current, r.fileId]);
        setPending((p) => p.filter((x) => x.key !== item.key));
      } catch (e) {
        fail(e instanceof Error ? e.message : "Caricamento non riuscito: riprova.");
      }
    }
  };

  const errId = error ? `${id}-error` : undefined;
  return (
    <div>
      <p className="mb-1.5 block text-sm font-medium" id={`${id}-label`}>
        {field.label}
        {field.required && (
          <span className="text-danger" aria-hidden>
            {" "}
            *
          </span>
        )}
        <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
          {ids.length}/{max}
        </span>
      </p>
      <ul
        className="grid grid-cols-3 gap-2 sm:grid-cols-4"
        aria-labelledby={`${id}-label`}
        data-testid="photo-list"
      >
        {ids.map((pid, i) => {
          const info = ctx?.photos[pid];
          return (
            <li
              key={pid}
              className="cos-enter group relative aspect-square overflow-hidden rounded-md border border-border bg-accent/40"
            >
              {info ? (
                <a href={info.url} target="_blank" rel="noreferrer" title="Apri la foto">
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL firmato a breve durata */}
                  <img
                    src={info.url}
                    alt={`Foto ${i + 1} di ${field.label}`}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </a>
              ) : (
                <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                  Foto {i + 1}
                </span>
              )}
              {ctx && (
                <button
                  type="button"
                  aria-label={`Togli la foto ${i + 1}`}
                  onClick={() => onChange(ids.filter((x) => x !== pid))}
                  className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
        {pending.map((p) => (
          <li
            key={p.key}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1 rounded-md border p-2 text-center text-xs",
              p.error
                ? "border-danger text-danger"
                : "border-dashed border-border text-muted-foreground",
            )}
            role={p.error ? "alert" : "status"}
          >
            {p.error ? (
              <>
                <span className="line-clamp-4">{p.error}</span>
                <button
                  type="button"
                  className="underline"
                  onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))}
                >
                  Chiudi
                </button>
              </>
            ) : (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden />
                <span>Caricamento…</span>
              </>
            )}
          </li>
        ))}
        {room > 0 && (
          <li>
            <button
              type="button"
              disabled={!ctx}
              onClick={() => input.current?.click()}
              aria-describedby={errId}
              className={cn(
                "cos-lift flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed text-xs font-medium transition",
                error ? "border-danger" : "border-border",
                ctx
                  ? "text-primary hover:border-primary hover:bg-primary/5"
                  : "cursor-not-allowed text-muted-foreground",
              )}
            >
              {ids.length ? (
                <ImagePlus className="size-6" aria-hidden />
              ) : (
                <Camera className="size-6" aria-hidden />
              )}
              {ids.length ? "Aggiungi" : "Scatta o scegli"}
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid={`photo-input-${field.id}`}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />
      {!ctx && (
        <p className="mt-1 text-xs text-muted-foreground">
          Le foto si aggiungono durante la compilazione del modulo.
        </p>
      )}
      {busy && (
        <p className="mt-1 text-xs text-muted-foreground">
          Attendi la fine del caricamento prima di salvare.
        </p>
      )}
      {field.help && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {field.help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
