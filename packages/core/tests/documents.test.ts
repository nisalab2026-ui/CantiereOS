import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  createFolder,
  deleteDocument,
  deleteFolder,
  detectFileType,
  finishUpload,
  getDocument,
  getDownloadUrl,
  getRecordHistory,
  listDocuments,
  listDeadlines,
  resolveActiveTenant,
  startDocumentUpload,
  startVersionUpload,
  updateDocument,
  ValidationError,
  withUserTransaction,
  type FileStorage,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

/**
 * Doppio di test dello storage (solo nei test): tiene i file in memoria e
 * registra le chiamate. In produzione e negli E2E si usa Supabase Storage vero.
 */
class MemoryStorage implements FileStorage {
  files = new Map<string, Uint8Array>();
  issued: string[] = [];
  async createUploadUrl(key: string) {
    this.issued.push(key);
    return `memory://upload/${key}`;
  }
  async info(key: string) {
    const f = this.files.get(key);
    return f ? { size: f.length, contentType: null } : null;
  }
  async readHead(key: string, bytes: number) {
    return (this.files.get(key) ?? new Uint8Array()).slice(0, bytes);
  }
  async createDownloadUrl(key: string, opts: { expiresIn: number; downloadName?: string }) {
    return `memory://download/${key}?exp=${opts.expiresIn}&name=${opts.downloadName ?? ""}`;
  }
  async remove(key: string) {
    this.files.delete(key);
  }
  put(url: string, content: string | Uint8Array) {
    const key = url.replace("memory://upload/", "");
    this.files.set(key, typeof content === "string" ? new TextEncoder().encode(content) : content);
  }
}

let pool: pg.Pool;
type User = { id: string; email: string };
let owner: User, office: User, tech: User, manager: User;
let tenantA: string;
let customerId: string;
const storage = new MemoryStorage();
const PDF = "%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n";
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  pool = createPool();
  owner = await createUser(pool, "doc-titolare");
  office = await createUser(pool, "doc-ufficio");
  tech = await createUser(pool, "doc-tecnico");
  manager = await createUser(pool, "doc-resp");
  tenantA = await createTenant(pool, "Documenti A", owner.id);
  await addMember(pool, tenantA, office.id, "back_office");
  await addMember(pool, tenantA, tech.id, "technician");
  await addMember(pool, tenantA, manager.id, "operations_manager");
  const c = await pool.query<{ id: string }>(
    "insert into public.customers (tenant_id, display_name) values ($1, 'Bianchi Srl') returning id",
    [tenantA],
  );
  customerId = c.rows[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

describe("Tipo reale dei file", () => {
  const b = (s: string) => new TextEncoder().encode(s);
  it("accetta solo se contenuto ed estensione corrispondono", () => {
    expect(detectFileType("a.pdf", b("%PDF-1.4"))).toBe("application/pdf");
    expect(detectFileType("a.pdf", b("<html>"))).toBeNull();
    expect(detectFileType("foto.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectFileType("a.docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toContain(
      "wordprocessingml",
    );
    expect(detectFileType("note.txt", b("ciao"))).toBe("text/plain");
    expect(detectFileType("note.txt", b("<!DOCTYPE html><script>"))).toBeNull();
    expect(detectFileType("setup.exe", b("MZ"))).toBeNull();
    expect(detectFileType("finto.pdf", b("MZ\x90\x00"))).toBeNull();
  });
});

describe("Archivio documentale", () => {
  let docId: string;
  let v1: string;

  it("carica un documento: scheda, URL firmato, verifica e versione corrente", async () => {
    const s = await createSession(pool, office);
    const folder = await run(s, async (tx) =>
      createFolder(tx, await resolveActiveTenant(tx), { name: "Contratti" }),
    );
    const ticket = await run(s, async (tx) =>
      startDocumentUpload(
        tx,
        await resolveActiveTenant(tx),
        storage,
        {
          title: "Contratto 2026",
          category: "contract",
          folderId: folder.id,
          subjectType: "customer" as const,
          subjectId: customerId,
          expiresOn: day(20),
          createDeadline: "on",
        },
        { name: "contratto.pdf", size: PDF.length, type: "application/pdf" },
      ),
    );
    docId = ticket.documentId;
    v1 = ticket.versionId;
    expect(ticket.uploadUrl).toBe(`memory://upload/${tenantA}/${docId}/${v1}`);
    storage.put(ticket.uploadUrl, PDF);
    const out = await run(s, async (tx) =>
      finishUpload(tx, await resolveActiveTenant(tx), storage, v1),
    );
    expect(out).toEqual({ ok: true, documentId: docId, versionNo: 1 });

    const doc = await run(s, async (tx) => getDocument(tx, await resolveActiveTenant(tx), docId));
    expect(doc?.fileName).toBe("contratto.pdf");
    expect(doc?.mimeType).toBe("application/pdf");
    expect(doc?.folderName).toBe("Contratti");
    expect(doc?.subject?.name).toBe("Bianchi Srl");
    expect(doc?.expiry).toBe("expiring");
    expect(doc?.deadlineId).toBeTruthy();
    // il promemoria è nello scadenziario, collegato allo stesso cliente
    const deadlines = await run(s, async (tx) =>
      listDeadlines(tx, await resolveActiveTenant(tx), { customerId }),
    );
    expect(deadlines.rows.map((d) => d.kind)).toContain("document");
  });

  it("rifiuta un file il cui contenuto non è quello dichiarato e lo cancella", async () => {
    const s = await createSession(pool, office);
    const t = await run(s, async (tx) =>
      startVersionUpload(tx, await resolveActiveTenant(tx), storage, docId, {
        name: "contratto-v2.pdf",
        size: 10,
      }),
    );
    storage.put(t.uploadUrl, "MZ\x90\x00 eseguibile");
    const out = await run(s, async (tx) =>
      finishUpload(tx, await resolveActiveTenant(tx), storage, t.versionId),
    );
    expect(out.ok).toBe(false);
    expect(storage.files.has(`${tenantA}/${docId}/${t.versionId}`)).toBe(false);
    const doc = await run(s, async (tx) => getDocument(tx, await resolveActiveTenant(tx), docId));
    expect(doc?.currentVersionId).toBe(v1); // la versione buona resta quella corrente
    expect(doc?.versionList.map((v) => v.status)).toEqual(["rejected", "ready"]);
  });

  it("nuova versione valida diventa corrente; le precedenti restano", async () => {
    const s = await createSession(pool, office);
    const t = await run(s, async (tx) =>
      startVersionUpload(
        tx,
        await resolveActiveTenant(tx),
        storage,
        docId,
        { name: "contratto-firmato.pdf", size: PDF.length },
        "Versione firmata",
      ),
    );
    storage.put(t.uploadUrl, PDF);
    const out = await run(s, async (tx) =>
      finishUpload(tx, await resolveActiveTenant(tx), storage, t.versionId),
    );
    expect(out).toMatchObject({ ok: true, versionNo: 3 });
    const list = await run(s, async (tx) =>
      listDocuments(tx, await resolveActiveTenant(tx), { q: "firmato" }),
    );
    expect(list.rows.map((r) => r.id)).toEqual([docId]);
    expect(list.rows[0]!.versions).toBe(2);
  });

  it("estensioni non ammesse e file troppo grandi sono rifiutati prima del caricamento", async () => {
    const s = await createSession(pool, office);
    await expect(
      run(s, async (tx) =>
        startDocumentUpload(
          tx,
          await resolveActiveTenant(tx),
          storage,
          { title: "x" },
          { name: "virus.exe", size: 10 },
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      run(s, async (tx) =>
        startDocumentUpload(
          tx,
          await resolveActiveTenant(tx),
          storage,
          { title: "x" },
          { name: "grande.pdf", size: 26 * 1024 * 1024 },
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("il tecnico consulta e scarica (download registrato) ma non carica", async () => {
    const s = await createSession(pool, tech);
    await expect(
      run(s, async (tx) =>
        startVersionUpload(tx, await resolveActiveTenant(tx), storage, docId, {
          name: "a.pdf",
          size: 10,
        }),
      ),
    ).rejects.toBeInstanceOf(AuthError);
    const dl = await run(s, async (tx) =>
      getDownloadUrl(tx, await resolveActiveTenant(tx), storage, v1),
    );
    expect(dl?.url).toContain("exp=300");
    expect(dl?.url).toContain("name=contratto.pdf");
    const o = await createSession(pool, owner);
    const history = await run(o, async (tx) =>
      getRecordHistory(tx, await resolveActiveTenant(tx), "documents", docId),
    );
    const verbs = history.map((e) => e.verb);
    expect(verbs).toContain("downloaded");
    expect(verbs).toContain("uploaded");
    expect(verbs).toContain("rejected");
    expect(verbs).toContain("created");
    expect(history.find((e) => e.verb === "downloaded")?.actorId).toBe(tech.id);
  });

  it("documenti riservati: solo chi ha il permesso li carica e li vede", async () => {
    const m = await createSession(pool, manager);
    await expect(
      run(m, async (tx) =>
        startDocumentUpload(
          tx,
          await resolveActiveTenant(tx),
          storage,
          { title: "Carta d'identità", category: "identity", isConfidential: "on" },
          { name: "ci.pdf", size: PDF.length },
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const s = await createSession(pool, office);
    const t = await run(s, async (tx) =>
      startDocumentUpload(
        tx,
        await resolveActiveTenant(tx),
        storage,
        { title: "Carta d'identità", category: "identity", isConfidential: "on" },
        { name: "ci.pdf", size: PDF.length },
      ),
    );
    storage.put(t.uploadUrl, PDF);
    await run(s, async (tx) =>
      finishUpload(tx, await resolveActiveTenant(tx), storage, t.versionId),
    );
    const seenByManager = await run(m, async (tx) =>
      listDocuments(tx, await resolveActiveTenant(tx), {}),
    );
    expect(seenByManager.rows.map((r) => r.id)).not.toContain(t.documentId);
    const dl = await run(m, async (tx) =>
      getDownloadUrl(tx, await resolveActiveTenant(tx), storage, t.versionId),
    );
    expect(dl).toBeNull();
  });

  it("modifica con controllo di concorrenza, cartelle non vuote protette, eliminazione", async () => {
    const s = await createSession(pool, office);
    const doc = (await run(s, async (tx) =>
      getDocument(tx, await resolveActiveTenant(tx), docId),
    ))!;
    const version = new Date(doc.updatedAt).toISOString();
    await run(s, async (tx) =>
      updateDocument(
        tx,
        await resolveActiveTenant(tx),
        docId,
        {
          title: "Contratto 2026 firmato",
          category: "contract",
          folderId: doc.folderId ?? undefined,
        },
        version,
      ),
    );
    await expect(
      run(s, async (tx) =>
        updateDocument(
          tx,
          await resolveActiveTenant(tx),
          docId,
          { title: "Altro titolo", category: "contract" },
          version,
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      run(s, async (tx) => deleteFolder(tx, await resolveActiveTenant(tx), doc.folderId!)),
    ).rejects.toBeInstanceOf(ValidationError);
    await run(s, async (tx) => deleteDocument(tx, await resolveActiveTenant(tx), docId));
    const after = await run(s, async (tx) => getDocument(tx, await resolveActiveTenant(tx), docId));
    expect(after).toBeNull();
    await run(s, async (tx) => deleteFolder(tx, await resolveActiveTenant(tx), doc.folderId!));
  });
});
