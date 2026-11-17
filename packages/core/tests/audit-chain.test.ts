import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  resolveActiveTenant,
  verifyAuditChain,
  withUserTransaction,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

let pool: pg.Pool;
type User = { id: string; email: string };
let owner: User, tech: User;

beforeAll(async () => {
  pool = createPool();
  owner = await createUser(pool, "chain-titolare");
  tech = await createUser(pool, "chain-tecnico");
  const tenant = await createTenant(pool, "Catena A", owner.id);
  await addMember(pool, tenant, tech.id, "technician");
});

afterAll(async () => {
  await pool.end();
});

describe("Integrità del registro", () => {
  it("il titolare verifica la catena della propria azienda", async () => {
    const s = await createSession(pool, owner);
    const st = await withUserTransaction(pool, s, async (tx) =>
      verifyAuditChain(tx, await resolveActiveTenant(tx)),
    );
    expect(st.valid).toBe(true);
    expect(st.checked).toBeGreaterThan(0);
    expect(st.firstInvalidId).toBeNull();
    expect(st.lastHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("senza audit.read la verifica è negata", async () => {
    const s = await createSession(pool, tech);
    await expect(
      withUserTransaction(pool, s, async (tx) =>
        verifyAuditChain(tx, await resolveActiveTenant(tx)),
      ),
    ).rejects.toBeInstanceOf(AuthError);
  });
});
