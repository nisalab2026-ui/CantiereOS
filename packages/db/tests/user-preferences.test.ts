import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, expectPgError, type Db } from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/** Preferenze personali: ognuno legge e scrive solo le proprie, per azienda. */
let db: Db;
let s: Seed;

const upsert = `insert into public.user_preferences (tenant_id, user_id, key, value)
  values ($1, $2, $3, $4::jsonb)
  on conflict (tenant_id, user_id, key) do update set value = excluded.value`;

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
  // righe committate (come superuser) per le prove d'isolamento
  await db.query(upsert, [s.tenantA, s.users.bobTechA, "dashboard.layout", '{"hidden":["x"]}']);
  await db.query(upsert, [s.tenantA, s.users.eveMulti, "filters.clienti", '{"q":"a"}']);
  await db.query(upsert, [s.tenantB, s.users.eveMulti, "filters.clienti", '{"q":"b"}']);
});

afterAll(async () => {
  await db.end();
});

describe("Preferenze personali", () => {
  it("il proprietario rilegge, aggiorna e cancella le proprie", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      await db.query(upsert, [s.tenantA, s.users.bobTechA, "dashboard.layout", '{"hidden":[]}']);
      await db.query(upsert, [s.tenantA, s.users.bobTechA, "filters.clienti", '{"q":"z"}']);
      const { rows } = await db.query<{ key: string; value: unknown }>(
        "select key, value from public.user_preferences order by key",
      );
      expect(rows).toEqual([
        { key: "dashboard.layout", value: { hidden: [] } },
        { key: "filters.clienti", value: { q: "z" } },
      ]);
      const del = await db.query(
        "delete from public.user_preferences where key = 'filters.clienti'",
      );
      expect(del.rowCount).toBe(1);
    });
  });

  it("colleghi, titolare e altre aziende non le vedono né le toccano", async () => {
    for (const u of [
      s.users.aliceOwnerA,
      s.users.graceAdminA,
      s.users.tomTechB,
      s.users.outsider,
    ]) {
      await asUser(db, u, async () => {
        const { rowCount } = await db.query("select 1 from public.user_preferences");
        expect(rowCount).toBe(0);
        const upd = await db.query("update public.user_preferences set value = '{}'::jsonb");
        expect(upd.rowCount).toBe(0);
        const del = await db.query("delete from public.user_preferences");
        expect(del.rowCount).toBe(0);
      });
    }
  });

  it("non si scrivono preferenze per un altro utente", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(db.query(upsert, [s.tenantA, s.users.bobTechA, "x.y", "{}"]), "42501");
    });
  });

  it("non si scrivono preferenze in un'azienda di cui non si è membri", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      await expectPgError(db.query(upsert, [s.tenantB, s.users.bobTechA, "x.y", "{}"]), "42501");
    });
  });

  it("un membro sospeso non salva preferenze", async () => {
    await asUser(db, s.users.frankSuspendedA, async () => {
      await expectPgError(
        db.query(upsert, [s.tenantA, s.users.frankSuspendedA, "x.y", "{}"]),
        "42501",
      );
    });
  });

  it("chi è in due aziende ha preferenze separate", async () => {
    await asUser(db, s.users.eveMulti, async () => {
      const { rows } = await db.query<{ tenant_id: string; value: { q: string } }>(
        "select tenant_id, value from public.user_preferences order by value->>'q'",
      );
      expect(rows.map((r) => [r.tenant_id, r.value.q])).toEqual([
        [s.tenantA, "a"],
        [s.tenantB, "b"],
      ]);
    });
  });

  it("chiave e proprietario non si cambiano", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      await expectPgError(db.query("update public.user_preferences set key = 'altro.k'"), "42501");
    });
    await asUser(db, s.users.bobTechA, async () => {
      await expectPgError(
        db.query("update public.user_preferences set user_id = $1", [s.users.aliceOwnerA]),
        "42501",
      );
    });
  });

  it("chiave, tipo e dimensione del valore sono controllati", async () => {
    const cases: [string, string][] = [
      ["Chiave!", "{}"],
      ["x.y", '"testo"'],
      ["x.big", JSON.stringify({ x: "a".repeat(40000) })],
    ];
    for (const [key, value] of cases) {
      await asUser(db, s.users.bobTechA, async () => {
        await expectPgError(db.query(upsert, [s.tenantA, s.users.bobTechA, key, value]), "23514");
      });
    }
  });
});
