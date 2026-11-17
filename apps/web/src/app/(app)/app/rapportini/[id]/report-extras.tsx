"use client";

import { MAX_REPORT_PHOTOS, type WorkReportPhoto } from "@cantiereos/core";
import { Camera, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import { cn } from "@/lib/cn";
import { SignaturePad } from "../../moduli/form-fields";
import {
  finishReportPhotoAction,
  removeReportPhotoAction,
  signReportAction,
  startReportPhotoAction,
} from "../actions";

/** Firma del cliente sul dispositivo; data e ora le mette il database. */
export function ReportSignature({
  id,
  signature,
  signerName,
  signedAt,
  editable,
}: {
  id: string;
  signature: string | null;
  signerName: string | null;
  signedAt: Date | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  if (!editable) {
    return signature ? (
      <div className="rounded-md border border-border bg-white p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL della firma */}
        <img
          src={signature}
          alt={`Firma di ${signerName ?? "cliente"}`}
          className="mx-auto h-24 object-contain"
        />
        <p className="mt-1 text-center text-xs text-slate-600">
          {signerName}
          {signedAt &&
            ` · ${new Date(signedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`}
        </p>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">Non firmato dal cliente.</p>
    );
  }
  return (
    <div aria-busy={pending || undefined} data-testid="report-signature">
      <SignaturePad
        id="report-signature"
        value={
          signature
            ? {
                image: signature,
                name: signerName ?? "",
                signedAt: (signedAt ?? new Date()).toString(),
              }
            : null
        }
        invalid={Boolean(error)}
        onChange={(v) =>
          start(async () => {
            const sig = v as { image: string; name: string } | null;
            const r = await signReportAction(
              id,
              sig ? { signature: sig.image, signerName: sig.name } : null,
            );
            setError(r.fieldErrors?.signerName ?? r.fieldErrors?.signature ?? r.error);
            router.refresh();
          })
        }
      />
      <FormAlert error={error} />
    </div>
  );
}

const MAX_SIDE = 1600;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (blob && blob.size > 0) return blob;
  } catch {
    /* formato non decodificabile qui: proviamo con l'originale */
  }
  if (OK_TYPES.includes(file.type)) return file;
  throw new Error("Formato non supportato: usa una foto JPEG, PNG o WebP.");
}

/** Foto del cantiere: ridotte nel browser, caricate con URL firmato, verificate dal server. */
export function ReportPhotos({
  id,
  photos,
  editable,
}: {
  id: string;
  photos: WorkReportPhoto[];
  editable: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string>();
  const room = MAX_REPORT_PHOTOS - photos.length - busy;

  const upload = async (files: File[]) => {
    setError(undefined);
    const list = files.slice(0, Math.max(0, room));
    setBusy(list.length);
    for (const file of list) {
      try {
        const blob = await shrink(file);
        const type = blob.type || file.type;
        const name =
          type === "image/jpeg"
            ? `${file.name.replace(/\.[^.]*$/, "").slice(0, 100) || "foto"}.jpg`
            : file.name;
        const t = await startReportPhotoAction(id, { name, size: blob.size, type });
        if (!t.ok) throw new Error(t.error);
        await fetch(t.uploadUrl, {
          method: "PUT",
          headers: { "content-type": type, "x-upsert": "false" },
          body: blob,
        }).catch(() => null);
        const r = await finishReportPhotoAction(t.fileId);
        if (!r.ok) throw new Error(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Caricamento non riuscito: riprova.");
      } finally {
        setBusy((b) => b - 1);
      }
    }
    router.refresh();
  };

  return (
    <div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" data-testid="report-photos">
        {photos.map((p, i) => (
          <li
            key={p.id}
            className="group relative aspect-square overflow-hidden rounded-md border border-border"
          >
            <a href={p.url} target="_blank" rel="noreferrer" title="Apri la foto">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmato a breve durata */}
              <img
                src={p.url}
                alt={`Foto ${i + 1}`}
                className="size-full object-cover"
                loading="lazy"
              />
            </a>
            {editable && (
              <button
                type="button"
                aria-label={`Togli la foto ${i + 1}`}
                onClick={async () => {
                  const r = await removeReportPhotoAction(id, p.id);
                  setError(r.error);
                  router.refresh();
                }}
                className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <li
            key={`b${i}`}
            role="status"
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground"
          >
            <Loader2 className="size-5 animate-spin" aria-hidden /> Caricamento…
          </li>
        ))}
        {editable && room > 0 && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className={cn(
                "flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-xs font-medium text-primary transition hover:border-primary hover:bg-primary/5",
              )}
            >
              <Camera className="size-6" aria-hidden /> Scatta o scegli
            </button>
          </li>
        )}
      </ul>
      {!editable && photos.length === 0 && (
        <p className="text-sm text-muted-foreground">Nessuna foto.</p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="report-photo-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />
      <FormAlert error={error} />
    </div>
  );
}
