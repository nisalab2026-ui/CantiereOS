import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  become,
  becomeSuperuser,
  connect,
  expectPgError,
  tx,
  type Db,
} from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

let db: Db;
let s: Seed;

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
});

afterAll(async () => {
  await db.end();
});

async function visiblePartnerTenants(): Promise<string[]> {
  const { rows } = await db.query<{ tenant_id: string }>(
    "select distinct tenant_id from public.business_partners",
  );
  return rows.map((r) => r.tenant_id).sort();
}

describe("Isolamento in lettura", () => {
  it("l'owner di A vede solo i clienti di A", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      expect(await visiblePartnerTenants()).toEqual([s.tenantA]);
      const { rows } = await db.query("select id from public.business_partners");
      expect(rows.map((r) => r.id).sort()).toEqual([s.partners.a1, s.partners.a2].sort());
    });
  });

  it("l'owner di B vede solo i clienti di B", async () => {
    await asUser(db, s.users.daveOwnerB, async () => {
      expect(await visiblePartnerTenants()).toEqual([s.tenantB]);
    });
  });

  it("filtrare per tenant_id di un'altra azienda non restituisce nulla", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      const { rowCount } = await db.query(
        "select 1 from public.business_partners where tenant_id = $1",
        [s.tenantB],
      );
      expect(rowCount).toBe(0);
      const byId = await db.query("select 1 from public.business_partners where id = $1", [
        s.partners.b1,
      ]);
      expect(byId.rowCount).toBe(0);
    });
  });

  it("un utente senza aziende non vede nulla", async () => {
    await asUser(db, s.users.outsider, async () => {
      for (const table of ["tenants", "tenant_memberships", "business_partners", "audit_log"]) {
        const { rowCount } = await db.query(`select 1 from public.${table}`);
        expect(rowCount, table).toBe(0);
      }
    });
  });

  it("anon non ha alcun privilegio sulle tabelle di dominio", async () => {
    await asUser(db, null, async () => {
      await expectPgError(db.query("select 1 from public.business_partners"), "42501");
    });
  });

  it("un membro sospeso non vede i dati dell'azienda", async () => {
    await asUser(db, s.users.frankSuspendedA, async () => {
      expect(await visiblePartnerTenants()).toEqual([]);
      const { rowCount } = await db.query("select 1 from public.tenants");
      expect(rowCount).toBe(0);
    });
  });

  it("un utente solo invitato non vede i dati finché non accetta", async () => {
    await asUser(db, s.users.ivanInvitedA, async () => {
      expect(await visiblePartnerTenants()).toEqual([]);
    });
  });

  it("un utente in due aziende vede entrambe, e solo quelle", async () => {
    await asUser(db, s.users.eveMulti, async () => {
      expect(await visiblePartnerTenants()).toEqual([s.tenantA, s.tenantB].sort());
    });
  });

  it("un'azienda sospesa perde l'accesso ai dati operativi", async () => {
    await tx(db, async () => {
      await db.query("update public.tenants set status = 'suspended' where id = $1", [s.tenantB]);
      await become(db, s.users.daveOwnerB);
      expect(await visiblePartnerTenants()).toEqual([]);
    });
  });

  it("l'owner di A non vede l'azienda, i membri né l'audit di B", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      const tenants = await db.query<{ id: string }>("select id from public.tenants");
      expect(tenants.rows.map((r) => r.id)).toEqual([s.tenantA]);
      const members = await db.query(
        "select 1 from public.tenant_memberships where tenant_id = $1",
        [s.tenantB],
      );
      expect(members.rowCount).toBe(0);
      const audit = await db.query("select 1 from public.audit_log where tenant_id = $1", [
        s.tenantB,
      ]);
      expect(audit.rowCount).toBe(0);
    });
  });
});

describe("Isolamento in scrittura", () => {
  it("non si può inserire un record con il tenant_id di un'altra azienda", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query(
          "insert into public.business_partners (tenant_id, display_name) values ($1, 'Intruso')",
          [s.tenantB],
        ),
        "42501",
      );
    });
  });

  it("non si possono modificare record di un'altra azienda", async () => {
    await tx(db, async () => {
      await become(db, s.users.aliceOwnerA);
      const res = await db.query(
        "update public.business_partners set display_name = 'Manomesso' where id = $1",
        [s.partners.b1],
      );
      expect(res.rowCount).toBe(0);
      await becomeSuperuser(db);
      const { rows } = await db.query(
        "select display_name from public.business_partners where id = $1",
        [s.partners.b1],
      );
      expect(rows[0].display_name).toBe("Cliente B1");
    });
  });

  it("non si possono eliminare record di un'altra azienda", async () => {
    await tx(db, async () => {
      await become(db, s.users.aliceOwnerA);
      const res = await db.query("delete from public.business_partners where id = $1", [
        s.partners.b1,
      ]);
      expect(res.rowCount).toBe(0);
      await becomeSuperuser(db);
      const check = await db.query("select 1 from public.business_partners where id = $1", [
        s.partners.b1,
      ]);
      expect(check.rowCount).toBe(1);
    });
  });

  it("non si può spostare un proprio record in un'altra azienda", async () => {
    await asUser(db, s.users.eveMulti, async () => {
      // Eve è office in B (può scrivere) ma solo viewer in A.
      await expectPgError(
        db.query("update public.business_partners set tenant_id = $1 where id = $2", [
          s.tenantA,
          s.partners.b1,
        ]),
        "42501",
      );
    });
  });

  it("tenant_id è immutabile anche per il service_role", async () => {
    await tx(db, async () => {
      await db.query("set local role service_role");
      await expectPgError(
        db.query("update public.business_partners set tenant_id = $1 where id = $2", [
          s.tenantB,
          s.partners.a1,
        ]),
        "42501",
      );
    });
  });

  it("un contatto non può riferirsi a un cliente di un'altra azienda (FK composta)", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query(
          "insert into public.partner_contacts (tenant_id, partner_id, full_name) values ($1, $2, 'Mario Rossi')",
          [s.tenantA, s.partners.b1],
        ),
        "23503",
      );
    });
  });

  it("un contatto non può essere creato nell'azienda altrui", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query(
          "insert into public.partner_contacts (tenant_id, partner_id, full_name) values ($1, $2, 'Mario Rossi')",
          [s.tenantB, s.partners.b1],
        ),
        "42501",
      );
    });
  });

  it("un contatto valido nella propria azienda viene accettato", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      const res = await db.query(
        "insert into public.partner_contacts (tenant_id, partner_id, full_name) values ($1, $2, 'Mario Rossi') returning id",
        [s.tenantA, s.partners.a1],
      );
      expect(res.rowCount).toBe(1);
    });
  });

  it("created_by non è falsificabile dal client", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      const { rows } = await db.query<{ created_by: string }>(
        "insert into public.business_partners (tenant_id, display_name, created_by) values ($1, 'Nuovo', $2) returning created_by",
        [s.tenantA, s.users.daveOwnerB],
      );
      expect(rows[0]!.created_by).toBe(s.users.carolOfficeA);
    });
  });
});
