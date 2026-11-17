import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkFormPhotos,
  createFormSubmission,
  createFormTemplate,
  finishFormPhotoUpload,
  formDefinitionSchema,
  getFormSubmission,
  isValidLogo,
  listFormPhotos,
  publishFormTemplate,
  resolveActiveTenant,
  saveFormSubmission,
  startFormPhotoUpload,
  ValidationError,
  withUserTransaction,
  type FileStorage,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

/** Foto nei moduli e aspetto del documento (ADR-013). Storage in memoria, database vero. */
class MemoryStorage implements FileStorage {
  files = new Map<string, Uint8Array>();
  async createUploadUrl(key: string) {
    return `memory://upload/${key}`;
  }
  async info(key: string) {
    const f = this.files.get(key);
    return f ? { size: f.length, contentType: null } : null;
  }
  async readHead(key: string, bytes: number) {
    return (this.files.get(key) ?? new Uint8Array()).slice(0, bytes);
  }
  async createDownloadUrl(key: string, opts: { expiresIn: number }) {
    return `memory://download/${key}?exp=${opts.expiresIn}`;
  }
  async remove(key: string) {
    this.files.delete(key);
  }
  put(url: string, bytes: Uint8Array) {
    this.files.set(url.replace("memory://upload/", ""), bytes);
  }
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4UaGBFTEMLQkAUtVaAV8W4QQAAAAASUVORK5CYII=";

let pool: pg.Pool;
let tech: VerifiedSession;
let submissionId: string;
const storage = new MemoryStorage();
const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

beforeAll(async () => {
  pool = createPool();
  const owner = await createUser(pool, "foto-titolare");
  const t = await createUser(pool, "foto-tecnico");
  const tenant = await createTenant(pool, "Foto A", owner.id);
  await addMember(pool, tenant, t.id, "technician");
  const os = await createSession(pool, owner);
  const templateId = await run(os, async (tx) => {
    const a = await resolveActiveTenant(tx);
    const { id } = await createFormTemplate(tx, a, {
      name: "Rapportino",
      category: "report",
      libraryKey: "rapportino-giornaliero",
    });
    await publishFormTemplate(tx, a, id);
    return id;
  });
  tech = await createSession(pool, t);
  submissionId = await run(tech, async (tx) => {
    const r = await createFormSubmission(tx, await resolveActiveTenant(tx), {
      templateId,
      title: "Rapportino 17/11",
    });
    return r.id;
  });
});

afterAll(async () => {
  await pool.end();
});

const upload = (name: string, bytes: Uint8Array, type = "image/jpeg") =>
  run(tech, async (tx) => {
    const a = await resolveActiveTenant(tx);
    const t = await startFormPhotoUpload(tx, a, storage, submissionId, {
      fieldId: "foto_lavori",
      name,
      size: bytes.length,
      type,
    });
    storage.put(t.uploadUrl, bytes);
    return finishFormPhotoUpload(tx, a, storage, t.fileId);
  });

describe("Foto nei moduli", () => {
  it("foto vera accettata, file finto rifiutato e cancellato; solo foto verificate nel modulo", async () => {
    const ok = await upload("cantiere.jpg", JPEG);
    expect(ok.ok).toBe(true);
    const fake = await upload("finta.jpg", new TextEncoder().encode("non sono una foto"));
    expect(fake).toEqual({ ok: false, reason: "Il file non è una foto JPEG, PNG o WebP." });
    expect(storage.files.size).toBe(1);

    const good = ok.ok ? ok.fileId : "";
    await run(tech, async (tx) => {
      const a = await resolveActiveTenant(tx);
      expect(await checkFormPhotos(tx, a, submissionId, { foto_lavori: [good] })).toEqual({});
      const wrongField = await checkFormPhotos(tx, a, submissionId, { altro: [good] });
      expect(Object.keys(wrongField)).toEqual(["altro"]);
      const photos = await listFormPhotos(tx, a, storage, submissionId);
      expect(Object.keys(photos)).toEqual([good]);
    });
  });

  it("tipo dichiarato non ammesso, campo inesistente o non di tipo foto: rifiutati prima del caricamento", async () => {
    await expect(upload("doc.pdf", JPEG, "application/pdf")).rejects.toThrow(ValidationError);
    await expect(
      run(tech, async (tx) =>
        startFormPhotoUpload(tx, await resolveActiveTenant(tx), storage, submissionId, {
          fieldId: "lavori_eseguiti",
          name: "x.jpg",
          size: 10,
          type: "image/jpeg",
        }),
      ),
    ).rejects.toMatchObject({ fieldErrors: { form: "Campo foto non trovato" } });
  });

  it("il salvataggio accetta solo id di foto verificate dello stesso campo", async () => {
    const r = await upload("ok.jpg", JPEG);
    const id = r.ok ? r.fileId : "";
    const save = (ids: string[]) =>
      run(tech, async (tx) => {
        const acc = await resolveActiveTenant(tx);
        const sub = (await getFormSubmission(tx, acc, submissionId))!;
        await saveFormSubmission(
          tx,
          acc,
          submissionId,
          { title: sub.title, data: { ...sub.data, foto_lavori: ids } },
          new Date(sub.updatedAt).toISOString(),
          false,
        );
      });
    await expect(save(["00000000-0000-4000-8000-000000000000"])).rejects.toThrow(ValidationError);
    await save([id]);
  });
});

describe("Aspetto del documento", () => {
  it("logo: solo PNG/JPEG/WebP veri e piccoli; niente SVG", () => {
    expect(isValidLogo(`data:image/png;base64,${PNG_B64}`)).toBe(true);
    expect(isValidLogo(`data:image/jpeg;base64,${PNG_B64}`)).toBe(false);
    expect(isValidLogo("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBe(false);
    expect(isValidLogo(`data:image/png;base64,${"A".repeat(150_000)}`)).toBe(false);
  });

  it("colore, caratteri e testi validati; definizioni senza aspetto restano valide", () => {
    const base = { sections: [{ id: "s1", title: "A", fields: [] }] };
    expect(formDefinitionSchema.safeParse(base).success).toBe(true);
    const ok = formDefinitionSchema.safeParse({
      ...base,
      appearance: { accent: "#0f766e", font: "serif", header: "band", code: "MOD-07" },
    });
    expect(ok.success && ok.data.appearance?.font).toBe("serif");
    expect(formDefinitionSchema.safeParse({ ...base, appearance: { accent: "red" } }).success).toBe(
      false,
    );
    expect(formDefinitionSchema.safeParse({ ...base, appearance: { font: "comic" } }).success).toBe(
      false,
    );
  });
});
