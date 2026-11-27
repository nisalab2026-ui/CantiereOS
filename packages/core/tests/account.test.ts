import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getCompanyProfile,
  getMyProfile,
  resolveActiveTenant,
  updateCompanyProfile,
  updateMyProfile,
  ValidationError,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

/** Blocco 5: profilo personale e dati dell'azienda. */
let pool: pg.Pool;
let owner: { id: string; email: string }, tech: { id: string; email: string };
let tenantA: string;

beforeAll(async () => {
  pool = createPool();
  owner = await createUser(pool, "titolare");
  tech = await createUser(pool, "tecnico");
  tenantA = await createTenant(pool, "Azienda Profilo", owner.id);
  await addMember(pool, tenantA, tech.id, "technician");
});

afterAll(async () => {
  await pool.end();
});

const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

describe("Profilo personale", () => {
  it("ognuno aggiorna nome e telefono propri, con controllo di versione", async () => {
    const s = await createSession(pool, tech);
    const before = await run(s, (tx) => getMyProfile(tx));
    expect(before?.email).toBe(tech.email);
    const version = before!.updatedAt.toISOString();
    await run(s, (tx) =>
      updateMyProfile(tx, { fullName: "Luca Bianchi", phone: "+39 333 1234567" }, version),
    );
    const after = await run(s, (tx) => getMyProfile(tx));
    expect(after).toMatchObject({ fullName: "Luca Bianchi", phone: "+39 333 1234567" });
    // la vecchia versione non sovrascrive
    await expect(
      run(s, (tx) => updateMyProfile(tx, { fullName: "Altro Nome" }, version)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("valida nome e telefono", async () => {
    const s = await createSession(pool, tech);
    const p = await run(s, (tx) => getMyProfile(tx));
    await expect(
      run(s, (tx) =>
        updateMyProfile(tx, { fullName: "X", phone: "chiamami" }, p!.updatedAt.toISOString()),
      ),
    ).rejects.toMatchObject({
      fieldErrors: { fullName: expect.any(String), phone: expect.any(String) },
    });
  });
});

describe("Dati dell'azienda", () => {
  it("il titolare li modifica; P.IVA in maiuscolo", async () => {
    const s = await createSession(pool, owner);
    const c = await run(s, async (tx) => getCompanyProfile(tx, await resolveActiveTenant(tx)));
    expect(c).toMatchObject({ name: "Azienda Profilo", members: 2 });
    await run(s, async (tx) =>
      updateCompanyProfile(
        tx,
        await resolveActiveTenant(tx),
        {
          name: "Azienda Profilo Srl",
          legalName: "Azienda Profilo S.r.l.",
          vatNumber: "it01234567890",
        },
        c!.updatedAt.toISOString(),
      ),
    );
    const after = await run(s, async (tx) => getCompanyProfile(tx, await resolveActiveTenant(tx)));
    expect(after).toMatchObject({
      name: "Azienda Profilo Srl",
      legalName: "Azienda Profilo S.r.l.",
      vatNumber: "IT01234567890",
      taxCode: null,
    });
    await expect(
      run(s, async (tx) =>
        updateCompanyProfile(
          tx,
          await resolveActiveTenant(tx),
          { name: "Vecchia" },
          c!.updatedAt.toISOString(),
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("un tecnico li legge ma non li modifica; senza MFA nemmeno il titolare", async () => {
    const st = await createSession(pool, tech);
    const c = await run(st, async (tx) => getCompanyProfile(tx, await resolveActiveTenant(tx)));
    expect(c?.name).toBe("Azienda Profilo Srl");
    await expect(
      run(st, async (tx) =>
        updateCompanyProfile(
          tx,
          await resolveActiveTenant(tx),
          { name: "Hack" },
          c!.updatedAt.toISOString(),
        ),
      ),
    ).rejects.toThrow();
    const weak = await createSession(pool, owner, "aal1");
    await expect(
      run(weak, async (tx) =>
        updateCompanyProfile(
          tx,
          await resolveActiveTenant(tx),
          { name: "Hack" },
          c!.updatedAt.toISOString(),
        ),
      ),
    ).rejects.toThrow();
    // il database conferma: nessuna modifica passata
    const { rows } = await pool.query("select name from public.tenants where id = $1", [tenantA]);
    expect(rows[0].name).toBe("Azienda Profilo Srl");
  });
});
