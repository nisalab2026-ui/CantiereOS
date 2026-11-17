import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  csvCell,
  exportSection,
  listActivity,
  resolveActiveTenant,
  toCsv,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

let pool: pg.Pool;
type User = { id: string; email: string };
let owner: User, tech: User, ownerB: User;
let tenantA: string;

beforeAll(async () => {
  pool = createPool();
  owner = await createUser(pool, "exp-titolare");
  tech = await createUser(pool, "exp-tecnico");
  ownerB = await createUser(pool, "exp-titolareb");
  tenantA = await createTenant(pool, "Export A", owner.id);
  const tenantB = await createTenant(pool, "Export B", ownerB.id);
  await addMember(pool, tenantA, tech.id, "technician");
  await pool.query(
    `insert into public.customers (tenant_id, display_name, party_type, billing_city, email) values
       ($1, 'Rossi; Figli "Srl"', 'company', 'Milano', 'info@rossi.invalid'),
       ($1, '=HYPERLINK("x")', 'individual', 'Roma', null),
       ($2, 'Cliente di B', 'company', 'Torino', null)`,
    [tenantA, tenantB],
  );
});

afterAll(async () => {
  await pool.end();
});

const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

describe("CSV", () => {
  it("separatore ; con virgolette dove servono, BOM e CRLF", () => {
    const csv = toCsv(
      [
        { header: "Nome", value: (r: { n: string; v: number; ok: boolean }) => r.n },
        { header: "Valore", value: (r) => r.v },
        { header: "Attivo", value: (r) => r.ok },
      ],
      [{ n: 'Rossi; "Srl"', v: 1.5, ok: true }],
    );
    expect(csv).toBe('﻿Nome;Valore;Attivo\r\n"Rossi; ""Srl""";1,5;Sì\r\n');
  });

  it("neutralizza le formule (CSV injection)", () => {
    for (const bad of ["=1+1", "+39 333", "-2", "@SUM(A1)"]) {
      expect(csvCell(bad).startsWith("'")).toBe(true);
    }
    expect(csvCell(-2)).toBe("-2"); // i numeri veri restano numeri
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
  });
});

describe("Esportazioni", () => {
  it("esporta solo i dati dell'azienda, con i filtri, e registra l'esportazione", async () => {
    const s = await createSession(pool, owner);
    const r = await run(s, async (tx) =>
      exportSection(tx, await resolveActiveTenant(tx), "customers", { q: "rossi" }),
    );
    expect(r.rows).toBe(1);
    expect(r.truncated).toBe(false);
    expect(r.filename).toMatch(/^clienti-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(r.csv).toContain('"Rossi; Figli ""Srl"""');
    expect(r.csv).not.toContain("Cliente di B");

    const all = await run(s, async (tx) =>
      exportSection(tx, await resolveActiveTenant(tx), "customers", {}),
    );
    expect(all.rows).toBe(2);
    expect(all.csv).toContain("'=HYPERLINK");
    expect(all.csv).not.toContain("Cliente di B");

    const log = await run(s, async (tx) =>
      listActivity(tx, await resolveActiveTenant(tx), { verb: "exported" }),
    );
    expect(log.events).toHaveLength(2);
    expect(log.events[0]!.verb).toBe("exported");
    expect(log.events[0]!.actorId).toBe(owner.id);
    expect(log.events[0]!.recordTitle).toBe("Clienti (2 righe)");
    const filters = log.events[1]!.changes.find((c) => c.field === "filters");
    expect(filters?.after).toBe("ricerca: rossi");
  });

  it("serve il permesso della sezione: il tecnico non esporta il registro attività", async () => {
    const t = await createSession(pool, tech);
    await expect(
      run(t, async (tx) => exportSection(tx, await resolveActiveTenant(tx), "audit", {})),
    ).rejects.toBeInstanceOf(AuthError);
    // ma può esportare i clienti, che può leggere
    const r = await run(t, async (tx) =>
      exportSection(tx, await resolveActiveTenant(tx), "customers", {}),
    );
    expect(r.rows).toBe(2);
  });

  it("il registro attività esportato include le esportazioni precedenti", async () => {
    const s = await createSession(pool, owner);
    const r = await run(s, async (tx) =>
      exportSection(tx, await resolveActiveTenant(tx), "audit", { operazione: "exported" }),
    );
    expect(r.csv.split("\r\n")[0]).toBe("﻿Data e ora;Utente;Operazione;Sezione;Elemento;Modifiche");
    expect(r.csv).toContain("Esportazione");
    expect(r.rows).toBeGreaterThanOrEqual(3);
  });
});
