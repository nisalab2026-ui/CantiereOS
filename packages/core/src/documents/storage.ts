/**
 * Storage dei file dell'archivio documentale. Il server parla con lo storage
 * con una chiave privilegiata (mai nel browser); il browser riceve solo URL
 * firmati, di breve durata, per una singola chiave. Provider sostituibile.
 */
export interface StoredObjectInfo {
  size: number;
  contentType: string | null;
}

export interface FileStorage {
  /** URL assoluto per caricare (PUT) un solo file su quella chiave. */
  createUploadUrl(key: string): Promise<string>;
  info(key: string): Promise<StoredObjectInfo | null>;
  /** Primi byte del file (per riconoscere il tipo reale). */
  readHead(key: string, bytes: number): Promise<Uint8Array>;
  createDownloadUrl(
    key: string,
    opts: { expiresIn: number; downloadName?: string | undefined },
  ): Promise<string>;
  remove(key: string): Promise<void>;
}

export class StorageNotConfiguredError extends Error {
  override readonly name = "StorageNotConfiguredError";
  constructor() {
    super("Archiviazione file non configurata");
  }
}

export class StorageError extends Error {
  override readonly name = "StorageError";
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Supabase Storage (REST). Bucket privato creato al primo uso se manca. */
export class SupabaseFileStorage implements FileStorage {
  private readonly base: string;
  private bucketReady: Promise<void> | null = null;

  constructor(
    private readonly opts: { url: string; serviceKey: string; bucket: string; publicUrl?: string },
  ) {
    this.base = `${opts.url.replace(/\/$/, "")}/storage/v1`;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      authorization: `Bearer ${this.opts.serviceKey}`,
      apikey: this.opts.serviceKey,
      ...extra,
    };
  }

  private path(key: string) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(key)) {
      throw new StorageError("Chiave non valida");
    }
    return `${encodeURIComponent(this.opts.bucket)}/${key}`;
  }

  private async call(pathname: string, init: RequestInit = {}): Promise<Response> {
    await this.ensureBucket();
    return fetch(`${this.base}${pathname}`, {
      ...init,
      headers: this.headers((init.headers as Record<string, string>) ?? {}),
    });
  }

  ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      const r = await fetch(`${this.base}/bucket/${encodeURIComponent(this.opts.bucket)}`, {
        headers: this.headers(),
      });
      if (r.ok) return;
      const c = await fetch(`${this.base}/bucket`, {
        method: "POST",
        headers: this.headers({ "content-type": "application/json" }),
        body: JSON.stringify({
          id: this.opts.bucket,
          name: this.opts.bucket,
          public: false,
          file_size_limit: MAX_FILE_BYTES,
        }),
      });
      if (!c.ok && c.status !== 409) {
        throw new StorageError(`Impossibile preparare il bucket (${c.status})`);
      }
    })().catch((e) => {
      this.bucketReady = null;
      throw e;
    });
    return this.bucketReady;
  }

  async createUploadUrl(key: string): Promise<string> {
    const r = await this.call(`/object/upload/sign/${this.path(key)}`, { method: "POST" });
    if (!r.ok) throw new StorageError(`URL di caricamento non disponibile (${r.status})`);
    const { url } = (await r.json()) as { url: string };
    return `${(this.opts.publicUrl ?? this.opts.url).replace(/\/$/, "")}/storage/v1${url}`;
  }

  async info(key: string): Promise<StoredObjectInfo | null> {
    const r = await this.call(`/object/info/${this.path(key)}`);
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) throw new StorageError(`Lettura informazioni non riuscita (${r.status})`);
    const j = (await r.json()) as { size?: number; content_type?: string | null };
    if (typeof j.size !== "number") return null;
    return { size: j.size, contentType: j.content_type ?? null };
  }

  async readHead(key: string, bytes: number): Promise<Uint8Array> {
    const r = await this.call(`/object/authenticated/${this.path(key)}`, {
      headers: { range: `bytes=0-${bytes - 1}` },
    });
    if (!r.ok) throw new StorageError(`Lettura del file non riuscita (${r.status})`);
    return new Uint8Array(await r.arrayBuffer()).slice(0, bytes);
  }

  async createDownloadUrl(
    key: string,
    opts: { expiresIn: number; downloadName?: string | undefined },
  ): Promise<string> {
    const r = await this.call(`/object/sign/${this.path(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: opts.expiresIn }),
    });
    if (!r.ok) throw new StorageError(`URL di download non disponibile (${r.status})`);
    const { signedURL } = (await r.json()) as { signedURL: string };
    const url = new URL(
      `${(this.opts.publicUrl ?? this.opts.url).replace(/\/$/, "")}/storage/v1${signedURL}`,
    );
    if (opts.downloadName) url.searchParams.set("download", opts.downloadName);
    return url.toString();
  }

  async remove(key: string): Promise<void> {
    const r = await this.call(`/object/${encodeURIComponent(this.opts.bucket)}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefixes: [this.path(key).split("/").slice(1).join("/")] }),
    });
    if (!r.ok && r.status !== 404)
      throw new StorageError(`Eliminazione non riuscita (${r.status})`);
  }
}

// --- Tipi di file ammessi -----------------------------------------------------

export const ALLOWED_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  txt: "text/plain",
  csv: "text/csv",
  p7m: "application/pkcs7-mime",
  xml: "application/xml",
};

export const extensionOf = (name: string) => {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
};

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  sig.every((v, i) => b[offset + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/**
 * Tipo reale del file dai primi byte, coerente con l'estensione dichiarata.
 * Restituisce il MIME da salvare oppure null se il file va rifiutato.
 */
export function detectFileType(name: string, head: Uint8Array): string | null {
  const ext = extensionOf(name);
  const expected = ALLOWED_EXTENSIONS[ext];
  if (!expected) return null;
  if (startsWith(head, ascii("MZ")) || startsWith(head, [0x7f, 0x45, 0x4c, 0x46])) return null; // eseguibili
  switch (ext) {
    case "pdf":
      return startsWith(head, ascii("%PDF-")) ? expected : null;
    case "jpg":
    case "jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]) ? expected : null;
    case "png":
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? expected : null;
    case "gif":
      return startsWith(head, ascii("GIF8")) ? expected : null;
    case "webp":
      return startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)
        ? expected
        : null;
    case "heic":
      return startsWith(head, ascii("ftyp"), 4) ? expected : null;
    case "docx":
    case "xlsx":
    case "pptx":
    case "odt":
    case "ods":
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]) ? expected : null;
    case "doc":
    case "xls":
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) ? expected : null;
    case "p7m":
      return head[0] === 0x30 || startsWith(head, ascii("MI")) ? expected : null; // DER o base64
    case "txt":
    case "csv":
    case "xml": {
      if (head.includes(0)) return null;
      const text = new TextDecoder("utf-8", { fatal: false })
        .decode(head)
        .trimStart()
        .toLowerCase();
      if (/^<(!doctype html|html|script|svg)/.test(text)) return null;
      if (ext === "xml" && !text.startsWith("<?xml") && !text.startsWith("﻿<?xml")) return null;
      return expected;
    }
    default:
      return null;
  }
}
