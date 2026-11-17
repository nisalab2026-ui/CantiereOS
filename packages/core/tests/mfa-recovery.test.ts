import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consumeRecoveryCode,
  createRecoveryCode,
  generateRecoveryCodes,
  getRecoveryStatus,
  normalizeRecoveryCode,
  withUserTransaction,
} from "../src/index";
import { createPool, createSession, createUser } from "./helpers/fixtures";

let pool: pg.Pool;
let user: { id: string; email: string };

beforeAll(async () => {
  pool = createPool();
  user = await createUser(pool, "recupero");
});
afterAll(async () => {
  await pool.end();
});

describe("Codici di recupero MFA", () => {
  it("formato leggibile, 60 bit, senza caratteri ambigui", () => {
    const c = createRecoveryCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizeRecoveryCode(c.toLowerCase().replace(/-/g, " "))).toBe(c.replace(/-/g, ""));
    expect(normalizeRecoveryCode("abc")).toBeNull();
  });

  it("generati con MFA, usabili una sola volta con la sola password", async () => {
    const aal2 = await createSession(pool, user, "aal2");
    const codes = await withUserTransaction(pool, aal2, generateRecoveryCodes);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);

    const aal1 = await createSession(pool, user, "aal1");
    const use = (c: string) => withUserTransaction(pool, aal1, (tx) => consumeRecoveryCode(tx, c));
    expect(await use(codes[4]!.toLowerCase())).toBe(true);
    expect(await use(codes[4]!)).toBe(false);
    expect(await use("AAAA-BBBB-CCCC")).toBe(false);
    const st = await withUserTransaction(pool, aal1, getRecoveryStatus);
    expect(st.remaining).toBe(9);
    expect(st.generatedAt).toBeInstanceOf(Date);
  });

  it("senza MFA verificata non si generano codici", async () => {
    const aal1 = await createSession(pool, user, "aal1");
    await expect(withUserTransaction(pool, aal1, generateRecoveryCodes)).rejects.toMatchObject({
      code: "42501",
    });
  });
});
