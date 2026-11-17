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

/** Catena di hash sul registro attività (ADR-010). */
let db: Db;
let s: Seed;

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
});

afterAll(async () => {
  await db.end();
});

const verify = (tenant: string) =>
  db.query<{ valid: boolean; checked: string; first_invalid_id: string | null; last_hash: string }>(
    "select * from app.verify_audit_chain($1)",
    [tenant],
  );

describe("Catena di hash del registro attività", () => {
  it("ogni azienda ha una catena continua e valida", async () => {
    const { rows } = await db.query<{ tenant_id: string; n: string; max: string; missing: string }>(
      `select tenant_id, count(*) n, max(chain_seq) max,
              count(*) filter (where chain_seq > 1 and prev_hash is null) missing
         from public.audit_log where tenant_id in ($1, $2) group by tenant_id`,
      [s.tenantA, s.tenantB],
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.max).toBe(r.n);
      expect(r.missing).toBe("0");
    }
    await asUser(db, s.users.aliceOwnerA, async () => {
      const { rows: v } = await verify(s.tenantA);
      expect(v[0]).toMatchObject({ valid: true, first_invalid_id: null });
      expect(Number(v[0]!.checked)).toBeGreaterThan(5);
      expect(v[0]!.last_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it("una nuova modifica si aggancia all'ultima riga della stessa azienda", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      const before = (await verify(s.tenantA)).rows[0]!;
      await db.query("update public.customers set notes = 'catena' where id = $1", [s.a.customer]);
      await becomeSuperuser(db);
      const { rows } = await db.query<{ chain_seq: string; prev: string }>(
        `select chain_seq, encode(prev_hash, 'hex') prev from public.audit_log
          where tenant_id = $1 order by chain_seq desc limit 1`,
        [s.tenantA],
      );
      expect(Number(rows[0]!.chain_seq)).toBe(Number(before.checked) + 1);
      expect(rows[0]!.prev).toBe(before.last_hash);
      await become(db, s.users.aliceOwnerA);
      expect((await verify(s.tenantA)).rows[0]!.valid).toBe(true);
    });
  });

  it("il chiamante non può scegliere hash o posizione", async () => {
    await tx(db, async () => {
      const { rows } = await db.query<{ chain_seq: string; row_hash: string }>(
        `insert into public.audit_log (tenant_id, action, chain_seq, prev_hash, row_hash)
         values ($1, 'test.forged', 1, '\\x00', '\\x00')
         returning chain_seq, encode(row_hash, 'hex') row_hash`,
        [s.tenantB],
      );
      expect(Number(rows[0]!.chain_seq)).toBeGreaterThan(1);
      expect(rows[0]!.row_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it("una riga alterata direttamente nel database viene individuata", async () => {
    await tx(db, async () => {
      const { rows } = await db.query<{ id: string }>(
        "select id from public.audit_log where tenant_id = $1 order by chain_seq limit 1 offset 2",
        [s.tenantA],
      );
      const tampered = rows[0]!.id;
      await db.query("alter table public.audit_log disable trigger audit_log_no_update");
      await db.query(
        `update public.audit_log set new_data = new_data || '{"name":"manomesso"}' where id = $1`,
        [tampered],
      );
      await db.query("alter table public.audit_log enable trigger audit_log_no_update");
      await become(db, s.users.aliceOwnerA);
      const v = (await verify(s.tenantA)).rows[0]!;
      expect(v.valid).toBe(false);
      expect(v.first_invalid_id).toBe(tampered);
      expect(v.checked).toBe("2");
    });
  });

  it("una riga cancellata in mezzo viene individuata", async () => {
    await tx(db, async () => {
      await db.query("alter table public.audit_log disable trigger audit_log_no_update");
      await db.query(
        `delete from public.audit_log where id = (
           select id from public.audit_log where tenant_id = $1 order by chain_seq limit 1 offset 3)`,
        [s.tenantB],
      );
      await db.query("alter table public.audit_log enable trigger audit_log_no_update");
      await become(db, s.users.daveOwnerB);
      const v = (await verify(s.tenantB)).rows[0]!;
      expect(v.valid).toBe(false);
      expect(v.checked).toBe("3");
    });
  });

  it("verifica solo con audit.read e solo per la propria azienda", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      await expectPgError(verify(s.tenantA), "42501");
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(verify(s.tenantB), "42501");
    });
    await asUser(db, null, async () => {
      await expectPgError(verify(s.tenantA), "42501");
    });
  });
});
