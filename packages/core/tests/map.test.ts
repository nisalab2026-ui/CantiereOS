import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  createProject,
  createProjectSite,
  geocodeAddress,
  getMapAddress,
  GeocodingUnavailableError,
  listMapPoints,
  resolveActiveTenant,
  setMapLocation,
  ValidationError,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

/** Mappa di clienti, sedi e cantieri (ADR-016). */
let pool: pg.Pool;
let owner: VerifiedSession,
  tech: VerifiedSession,
  office: VerifiedSession,
  otherOwner: VerifiedSession;
let customerId: string, siteId: string, ownSiteId: string, linkedSiteId: string;
const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

beforeAll(async () => {
  pool = createPool();
  const o = await createUser(pool, "map-titolare");
  const t = await createUser(pool, "map-tecnico");
  const f = await createUser(pool, "map-ufficio");
  const x = await createUser(pool, "map-altra");
  const tenant = await createTenant(pool, "Mappa A", o.id);
  await createTenant(pool, "Mappa B", x.id);
  await addMember(pool, tenant, t.id, "technician");
  await addMember(pool, tenant, f.id, "back_office");
  owner = await createSession(pool, o);
  tech = await createSession(pool, t);
  office = await createSession(pool, f);
  otherOwner = await createSession(pool, x);
  const ins = async (sql: string, p: unknown[]) =>
    (await pool.query<{ id: string }>(sql, p)).rows[0]!.id;
  customerId = await ins(
    `insert into public.customers (tenant_id, display_name, billing_address_line, billing_city, billing_province)
     values ($1, 'Condominio Aurora', 'Via Verdi 3', 'Milano', 'MI') returning id`,
    [tenant],
  );
  siteId = await ins(
    `insert into public.customer_sites (tenant_id, customer_id, name, address_line, city)
     values ($1, $2, 'Scala B', 'Via Verdi 5', 'Milano') returning id`,
    [tenant, customerId],
  );
  await run(owner, async (tx) => {
    const access = await resolveActiveTenant(tx);
    const p = await createProject(tx, access, { customerId, name: "Facciata", kind: "lump_sum" });
    ownSiteId = (
      await createProjectSite(tx, access, p.id, {
        name: "Box auto",
        addressLine: "Via Monti 1",
        city: "Bergamo",
      })
    ).id;
    linkedSiteId = (
      await createProjectSite(tx, access, p.id, { name: "Scala B", customerSiteId: siteId })
    ).id;
  });
});
afterAll(async () => {
  await pool.end();
});

describe("Mappa", () => {
  it("elenca clienti, sedi e cantieri con indirizzo proprio; il cantiere sulla sede non si ripete", async () => {
    const m = await run(owner, async (tx) => listMapPoints(tx, await resolveActiveTenant(tx)));
    const kinds = m.points.map((p) => `${p.kind}:${p.name}`).sort();
    expect(kinds).toEqual([
      "customer:Condominio Aurora",
      "customer_site:Scala B",
      "project_site:Box auto",
    ]);
    expect(m.points.find((p) => p.id === linkedSiteId)).toBeUndefined();
    expect(m.missing).toBe(3);
    expect(m.points.every((p) => p.canEdit)).toBe(true);
    const site = m.points.find((p) => p.kind === "project_site")!;
    expect(site.href).toMatch(/^\/app\/commesse\//);
  });

  it("salva la posizione a mano, la toglie; l'ufficio non tocca i cantieri", async () => {
    await run(owner, async (tx) => {
      const access = await resolveActiveTenant(tx);
      expect(
        await setMapLocation(tx, access, {
          kind: "customer",
          id: customerId,
          lat: 45.4642,
          lng: 9.19,
          source: "manual",
        }),
      ).toBe(true);
      const m = await listMapPoints(tx, access);
      const c = m.points.find((p) => p.id === customerId)!;
      expect(c.lat).toBeCloseTo(45.4642, 4);
      expect(c.source).toBe("manual");
      await setMapLocation(tx, access, {
        kind: "customer",
        id: customerId,
        lat: null,
        lng: null,
        source: "manual",
      });
      expect(
        (await listMapPoints(tx, access)).points.find((p) => p.id === customerId)!.lat,
      ).toBeNull();
      // un cantiere sulla sede del cliente non ha posizione propria
      await expect(
        setMapLocation(tx, access, {
          kind: "project_site",
          id: linkedSiteId,
          lat: 45,
          lng: 9,
          source: "manual",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
    // back_office: clienti sì; cantieri secondo il permesso projects.write del ruolo
    await run(office, async (tx) => {
      const access = await resolveActiveTenant(tx);
      expect(
        await setMapLocation(tx, access, {
          kind: "customer_site",
          id: siteId,
          lat: 45.47,
          lng: 9.2,
          source: "manual",
        }),
      ).toBe(true);
      const site = (await listMapPoints(tx, access)).points.find((p) => p.kind === "project_site");
      if (site) expect(site.canEdit).toBe(access.permissions.has("projects.write"));
    });
  });

  it("il tecnico vede ma non modifica; un'altra azienda non trova nulla", async () => {
    await run(tech, async (tx) => {
      const access = await resolveActiveTenant(tx);
      const m = await listMapPoints(tx, access);
      expect(m.points.some((p) => p.id === customerId)).toBe(true);
      expect(m.points.every((p) => !p.canEdit)).toBe(true);
      await expect(
        setMapLocation(tx, access, {
          kind: "customer",
          id: customerId,
          lat: 45,
          lng: 9,
          source: "manual",
        }),
      ).rejects.toBeInstanceOf(AuthError);
      await expect(getMapAddress(tx, access, "customer", customerId)).rejects.toBeInstanceOf(
        AuthError,
      );
    });
    await run(otherOwner, async (tx) => {
      const access = await resolveActiveTenant(tx);
      expect((await listMapPoints(tx, access)).points).toHaveLength(0);
      expect(
        await setMapLocation(tx, access, {
          kind: "customer",
          id: customerId,
          lat: 45,
          lng: 9,
          source: "manual",
        }),
      ).toBe(false);
      expect(await getMapAddress(tx, access, "customer", customerId)).toBeNull();
    });
  });

  it("indirizzo per la geocodifica; nessuna chiamata se il servizio è disattivato", async () => {
    const addr = await run(owner, async (tx) =>
      getMapAddress(tx, await resolveActiveTenant(tx), "customer", customerId),
    );
    expect(addr).toBe("Via Verdi 3, Milano, MI, IT");
    await expect(geocodeAddress({ url: null, userAgent: "test" }, addr!)).rejects.toBeInstanceOf(
      GeocodingUnavailableError,
    );
  });

  it("legge la risposta di Nominatim e manda User-Agent e parametri giusti", async () => {
    let seen: { url: string; ua: string | null } | null = null;
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      seen = { url: String(url), ua: new Headers(init.headers).get("User-Agent") };
      return new Response(
        JSON.stringify([{ lat: "45.4781", lon: "9.2272", display_name: "Via Verdi, Milano" }]),
        {
          headers: { "content-type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;
    const hit = await geocodeAddress(
      { url: "https://geocoder.test.invalid", userAgent: "CantiereOS/test" },
      "Via Verdi 3, Milano",
      { fetchImpl, countryCodes: "IT" },
    );
    expect(hit).toEqual({ lat: 45.4781, lng: 9.2272, label: "Via Verdi, Milano" });
    expect(seen!.ua).toBe("CantiereOS/test");
    expect(seen!.url).toContain("format=jsonv2");
    expect(seen!.url).toContain("countrycodes=it");
    const empty = (async () => new Response("[]")) as unknown as typeof fetch;
    expect(
      await geocodeAddress({ url: "https://geocoder.test.invalid", userAgent: "t" }, "Nowhere", {
        fetchImpl: empty,
      }),
    ).toBeNull();
  });
});
