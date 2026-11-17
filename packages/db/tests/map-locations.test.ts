import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  become,
  becomeSuperuser,
  connect,
  expectPgError,
  insertRow,
  tx,
  type Db,
} from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/** Posizioni sulla mappa di clienti, sedi e cantieri (ADR-016). */
let db: Db;
let s: Seed;
let projectA: string, ownSiteA: string, linkedSiteA: string;

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
  projectA = await insertRow(db, "projects", {
    tenant_id: s.tenantA,
    customer_id: s.a.customer,
    name: "Mappa",
    code: "MAP-1",
  });
  ownSiteA = await insertRow(db, "project_sites", {
    tenant_id: s.tenantA,
    project_id: projectA,
    name: "Cantiere proprio",
    address_line: "Via del Cantiere 3",
    city: "Bergamo",
  });
  linkedSiteA = await insertRow(db, "project_sites", {
    tenant_id: s.tenantA,
    project_id: projectA,
    name: "Cantiere sulla sede",
    customer_site_id: s.a.site,
  });
});
afterAll(async () => {
  await db.end();
});

const place = (
  table: string,
  id: string,
  lat: number | null,
  lng: number | null,
  src: string | null,
) =>
  db.query(
    `update public.${table} set latitude = $2, longitude = $3, location_source = $4,
            located_at = case when $4::text is null then null else now() end
      where id = $1 returning id`,
    [id, lat, lng, src],
  );

/** Esegue in un savepoint: un errore atteso non interrompe la transazione del test. */
async function sp<T>(fn: () => Promise<T>): Promise<T> {
  await db.query("savepoint t");
  try {
    const r = await fn();
    await db.query("release savepoint t");
    return r;
  } catch (e) {
    await db.query("rollback to savepoint t");
    throw e;
  }
}
const placeErr = (...a: Parameters<typeof place>) =>
  expectPgError(
    sp(() => place(...a)),
    "23514",
  );

describe("Posizioni sulla mappa", () => {
  it("chi modifica i clienti mette la puntina; il tecnico no; l'altra azienda non vede la riga", async () => {
    await tx(db, async () => {
      await become(db, s.users.carolOfficeA);
      expect((await place("customers", s.a.customer, 45.4642, 9.19, "manual")).rowCount).toBe(1);
      expect((await place("customer_sites", s.a.site, 45.47, 9.2, "geocoded")).rowCount).toBe(1);
      await becomeSuperuser(db);
      await become(db, s.users.bobTechA);
      // il tecnico legge la posizione ma non la cambia (RLS filtra l'aggiornamento)
      const { rows } = await db.query<{ latitude: string }>(
        "select latitude from public.customers where id = $1",
        [s.a.customer],
      );
      expect(Number(rows[0]!.latitude)).toBeCloseTo(45.4642, 4);
      expect((await place("customers", s.a.customer, 41.9, 12.5, "manual")).rowCount).toBe(0);
      await becomeSuperuser(db);
      await become(db, s.users.daveOwnerB);
      expect((await place("customers", s.a.customer, 41.9, 12.5, "manual")).rowCount).toBe(0);
      expect((await place("project_sites", ownSiteA, 41.9, 12.5, "manual")).rowCount).toBe(0);
      const other = await db.query(
        "select id from public.customers where latitude is not null and tenant_id = $1",
        [s.tenantA],
      );
      expect(other.rows).toHaveLength(0);
    });
  });

  it("coordinate coerenti: entrambe, con la fonte, nei limiti", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await placeErr("customers", s.a.customer, 45, null, "manual");
      await placeErr("customers", s.a.customer, 45, 9, null);
      await placeErr("customers", s.a.customer, 95, 9, "manual");
      await placeErr("customers", s.a.customer, 45, 9, "gps");
      // un cantiere su una sede del cliente usa la posizione della sede
      await placeErr("project_sites", linkedSiteA, 45, 9, "manual");
      const own = await place("project_sites", ownSiteA, 45.698, 9.677, "geocoded");
      expect(own.rowCount).toBe(1);
    });
  });

  it("se cambia l'indirizzo la posizione si azzera; altre modifiche la lasciano", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await place("customers", s.a.customer, 45.4642, 9.19, "manual");
      await db.query("update public.customers set notes = 'nota' where id = $1", [s.a.customer]);
      let { rows } = await db.query<{ latitude: string | null; location_source: string | null }>(
        "select latitude, location_source from public.customers where id = $1",
        [s.a.customer],
      );
      expect(rows[0]!.location_source).toBe("manual");
      await db.query("update public.customers set billing_city = 'Torino' where id = $1", [
        s.a.customer,
      ]);
      ({ rows } = await db.query(
        "select latitude, location_source from public.customers where id = $1",
        [s.a.customer],
      ));
      expect(rows[0]!.latitude).toBeNull();
      expect(rows[0]!.location_source).toBeNull();

      // indirizzo e posizione nuovi nello stesso aggiornamento: vale la posizione nuova
      await db.query(
        `update public.project_sites set city = 'Brescia', latitude = 45.54, longitude = 10.21,
                location_source = 'geocoded', located_at = now() where id = $1`,
        [ownSiteA],
      );
      const site = await db.query<{ latitude: string }>(
        "select latitude from public.project_sites where id = $1",
        [ownSiteA],
      );
      expect(Number(site.rows[0]!.latitude)).toBeCloseTo(45.54, 2);

      await place("customer_sites", s.a.site, 45.47, 9.2, "manual");
      await db.query(
        "update public.customer_sites set address_line = 'Via Nuova 2' where id = $1",
        [s.a.site],
      );
      const cs = await db.query<{ latitude: string | null }>(
        "select latitude from public.customer_sites where id = $1",
        [s.a.site],
      );
      expect(cs.rows[0]!.latitude).toBeNull();
    });
  });
});
