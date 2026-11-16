import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  createCustomer,
  listCustomers,
  listEmployees,
  listSuppliers,
  listTeams,
  resolveActiveTenant,
  ValidationError,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

let pool: pg.Pool;
type User = { id: string; email: string };
let owner: User, tech: User, ownerB: User;
let tenantA: string, tenantB: string;

beforeAll(async () => {
  pool = createPool();
  owner = await createUser(pool, "dir-titolare");
  tech = await createUser(pool, "dir-tecnico");
  ownerB = await createUser(pool, "dir-titolareb");
  tenantA = await createTenant(pool, "Elenchi A", owner.id);
  tenantB = await createTenant(pool, "Elenchi B", ownerB.id);
  await addMember(pool, tenantA, tech.id, "technician");
  for (let i = 1; i <= 30; i++) {
    await pool.query(
      "insert into public.customers (tenant_id, display_name, code, party_type, billing_city) values ($1, $2, $3, $4::public.party_type, $5)",
      [
        tenantA,
        `Cliente ${String(i).padStart(2, "0")}`,
        `K${i}`,
        i % 3 === 0 ? "individual" : "company",
        i % 2 ? "Milano" : "Torino",
      ],
    );
  }
  await pool.query(
    "update public.customers set deleted_at = now() where tenant_id = $1 and code = 'K30'",
    [tenantA],
  );
  await pool.query(
    "insert into public.customers (tenant_id, display_name) values ($1, 'Cliente di B')",
    [tenantB],
  );
  await pool.query(
    "insert into public.suppliers (tenant_id, display_name, category) values ($1, 'Ferramenta Bianchi', 'Ferramenta')",
    [tenantA],
  );
  const emp = await pool.query<{ id: string }>(
    "insert into public.employees (tenant_id, first_name, last_name, employment_type) values ($1, 'Luca', 'Verdi', 'contractor') returning id",
    [tenantA],
  );
  const team = await pool.query<{ id: string }>(
    "insert into public.teams (tenant_id, name, leader_employee_id) values ($1, 'Squadra Blu', $2) returning id",
    [tenantA, emp.rows[0]!.id],
  );
  await pool.query(
    "insert into public.team_members (tenant_id, team_id, employee_id) values ($1, $2, $3)",
    [tenantA, team.rows[0]!.id, emp.rows[0]!.id],
  );
});

afterAll(async () => {
  await pool.end();
});

const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

describe("Elenchi anagrafiche", () => {
  it("pagina, conta ed esclude eliminati e altre aziende", async () => {
    const s = await createSession(pool, owner);
    const p1 = await run(s, async (tx) =>
      listCustomers(tx, await resolveActiveTenant(tx), { pageSize: 10 }),
    );
    expect(p1.total).toBe(29);
    expect(p1.rows).toHaveLength(10);
    expect(p1.rows[0]!.displayName).toBe("Cliente 01");
    const p3 = await run(s, async (tx) =>
      listCustomers(tx, await resolveActiveTenant(tx), { pageSize: 10, page: 3 }),
    );
    expect(p3.rows).toHaveLength(9);
    const all = await run(s, async (tx) =>
      listCustomers(tx, await resolveActiveTenant(tx), { pageSize: 100 }),
    );
    expect(all.rows.map((r) => r.displayName)).not.toContain("Cliente di B");
    expect(all.rows.map((r) => r.code)).not.toContain("K30");
  });

  it("ricerca, filtri e ordinamento solo da whitelist", async () => {
    const s = await createSession(pool, owner);
    const found = await run(s, async (tx) =>
      listCustomers(tx, await resolveActiveTenant(tx), { q: "cliente 1" }),
    );
    expect(found.total).toBe(10); // 10..19
    const ind = await run(s, async (tx) =>
      listCustomers(tx, await resolveActiveTenant(tx), { type: "individual", pageSize: 100 }),
    );
    expect(ind.rows.every((r) => r.partyType === "individual")).toBe(true);
    const bogus = await run(s, async (tx) =>
      listCustomers(tx, await resolveActiveTenant(tx), {
        type: "x'; drop table customers; --",
        sort: "1; select",
        pageSize: 100,
      }),
    );
    expect(bogus.total).toBe(29);
    const desc = await run(s, async (tx) =>
      listCustomers(tx, await resolveActiveTenant(tx), { sort: "name", dir: "desc" }),
    );
    expect(desc.rows[0]!.displayName).toBe("Cliente 29");
  });

  it("fornitori, personale con squadre, squadre con caposquadra", async () => {
    const s = await createSession(pool, owner);
    const [sup, emp, teams] = await run(s, async (tx) => {
      const a = await resolveActiveTenant(tx);
      return [
        await listSuppliers(tx, a, {}),
        await listEmployees(tx, a, { type: "contractor" }),
        await listTeams(tx, a, {}),
      ] as const;
    });
    expect(sup.rows[0]!.category).toBe("Ferramenta");
    expect(emp.rows[0]).toMatchObject({
      lastName: "Verdi",
      teams: ["Squadra Blu"],
      hasAccount: false,
    });
    expect(teams.rows[0]).toMatchObject({ name: "Squadra Blu", leader: "Luca Verdi", members: 1 });
  });

  it("un tecnico senza permesso non legge i fornitori", async () => {
    const s = await createSession(pool, tech);
    await expect(
      run(s, async (tx) => listSuppliers(tx, await resolveActiveTenant(tx), {})),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe("Creazione cliente", () => {
  it("crea nell'azienda attiva e valida i campi", async () => {
    const s = await createSession(pool, owner);
    const { id } = await run(s, async (tx) =>
      createCustomer(tx, await resolveActiveTenant(tx), {
        displayName: "Nuovo Cliente Srl",
        partyType: "company",
        vatNumber: "it12345678901",
        province: "mi",
        email: "",
      }),
    );
    const { rows } = await pool.query(
      "select tenant_id, vat_number, billing_province, email from public.customers where id = $1",
      [id],
    );
    expect(rows[0]).toEqual({
      tenant_id: tenantA,
      vat_number: "IT12345678901",
      billing_province: "MI",
      email: null,
    });

    const invalid = await run(s, async (tx) =>
      createCustomer(tx, await resolveActiveTenant(tx), {
        displayName: " ",
        partyType: "company",
        email: "non-email",
      }).catch((e) => e),
    );
    expect(invalid).toBeInstanceOf(ValidationError);
    expect(Object.keys((invalid as ValidationError).fieldErrors).sort()).toEqual([
      "displayName",
      "email",
    ]);
  });

  it("partita IVA duplicata: errore sul campo, transazione ancora usabile", async () => {
    const s = await createSession(pool, owner);
    const result = await run(s, async (tx) => {
      const a = await resolveActiveTenant(tx);
      const err = await createCustomer(tx, a, {
        displayName: "Doppione",
        partyType: "company",
        vatNumber: "IT12345678901",
      }).catch((e) => e);
      const after = await listCustomers(tx, a, { q: "nuovo cliente" });
      return { err, after: after.total };
    });
    expect((result.err as ValidationError).fieldErrors).toEqual({
      vatNumber: "Esiste già un cliente con questa partita IVA",
    });
    expect(result.after).toBe(1);
  });

  it("il tecnico non può creare clienti", async () => {
    const s = await createSession(pool, tech);
    const err = await run(s, async (tx) =>
      createCustomer(tx, await resolveActiveTenant(tx), {
        displayName: "X",
        partyType: "company",
      }).catch((e) => e),
    );
    expect(err).toBeInstanceOf(AuthError);
    const { rows } = await pool.query(
      "select count(*)::int as n from public.customers where display_name = 'X'",
    );
    expect(rows[0].n).toBe(0);
  });
});
