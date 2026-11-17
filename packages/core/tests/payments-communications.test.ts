import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  createCommunication,
  createPayment,
  formatCents,
  getCommunication,
  getPayment,
  getPaymentSummary,
  getRecordHistory,
  listCalendar,
  listCommunications,
  listPayments,
  markPaymentPaid,
  parseEuroToCents,
  resolveActiveTenant,
  setFollowUpDone,
  setPaymentStatus,
  updatePayment,
  ValidationError,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

/** Pagamenti attesi e registro comunicazioni (ADR-012). */
let pool: pg.Pool;
type User = { id: string; email: string };
let owner: User, office: User, manager: User, tech: User, ownerB: User;
let tenantA: string;
let customerId: string, supplierId: string;

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  pool = createPool();
  owner = await createUser(pool, "pag-titolare");
  office = await createUser(pool, "pag-ufficio");
  manager = await createUser(pool, "pag-responsabile");
  tech = await createUser(pool, "pag-tecnico");
  ownerB = await createUser(pool, "pag-titolareb");
  tenantA = await createTenant(pool, "Pagamenti A", owner.id);
  await createTenant(pool, "Pagamenti B", ownerB.id);
  await addMember(pool, tenantA, office.id, "back_office");
  await addMember(pool, tenantA, manager.id, "operations_manager");
  await addMember(pool, tenantA, tech.id, "technician");
  customerId = (
    await pool.query<{ id: string }>(
      "insert into public.customers (tenant_id, display_name) values ($1, 'Condominio Aurora') returning id",
      [tenantA],
    )
  ).rows[0]!.id;
  supplierId = (
    await pool.query<{ id: string }>(
      "insert into public.suppliers (tenant_id, display_name) values ($1, 'Ponteggi Nord') returning id",
      [tenantA],
    )
  ).rows[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

describe("Importi", () => {
  it("interpreta gli importi all'italiana e formatta in euro", () => {
    expect(parseEuroToCents("1.250,50")).toBe(125_050);
    expect(parseEuroToCents("1250.5")).toBe(125_050);
    expect(parseEuroToCents("€ 80")).toBe(8_000);
    expect(parseEuroToCents("1.250")).toBe(125_000);
    expect(parseEuroToCents("0")).toBeNull();
    expect(parseEuroToCents("12,345")).toBeNull();
    expect(parseEuroToCents("abc")).toBeNull();
    expect(formatCents(125_050).replace(/\s/g, " ")).toBe("1.250,50 €");
  });
});

describe("Pagamenti attesi", () => {
  it("crea, registra il saldo con importo parziale, riapre; totali e stato in ritardo", async () => {
    const s = await createSession(pool, office);
    const ids = await run(s, async (tx) => {
      const a = await resolveActiveTenant(tx);
      const inc = await createPayment(tx, a, {
        direction: "incoming",
        description: "SAL 2 Condominio Aurora",
        referenceCode: "FT 45/2026",
        amount: "12.500,00",
        dueDate: day(-3),
        counterpartyId: customerId,
      });
      const out = await createPayment(tx, a, {
        direction: "outgoing",
        description: "Noleggio ponteggi novembre",
        amount: "800",
        dueDate: day(10),
        counterpartyId: supplierId,
        method: "bank_transfer",
      });
      return { inc: inc.id, out: out.id };
    });
    const before = await run(s, async (tx) => {
      const a = await resolveActiveTenant(tx);
      return {
        overdue: await listPayments(tx, a, { state: "overdue" }),
        open: await listPayments(tx, a, {}),
        summary: await getPaymentSummary(tx, a),
      };
    });
    expect(before.overdue.rows.map((r) => r.id)).toEqual([ids.inc]);
    expect(before.overdue.rows[0]).toMatchObject({
      state: "overdue",
      amountCents: 1_250_000,
      counterparty: { type: "customer", name: "Condominio Aurora" },
    });
    expect(before.open.totals).toEqual({ incomingCents: 1_250_000, outgoingCents: 80_000 });
    expect(before.summary).toMatchObject({
      incomingOverdueCents: 1_250_000,
      incomingOverdue: 1,
      outgoingDueSoonCents: 80_000,
    });

    await run(s, async (tx) =>
      markPaymentPaid(tx, await resolveActiveTenant(tx), ids.inc, {
        paidOn: day(0),
        paidAmount: "12.000",
        method: "bank_transfer",
      }),
    );
    const paid = await run(s, async (tx) => getPayment(tx, await resolveActiveTenant(tx), ids.inc));
    expect(paid).toMatchObject({
      state: "paid",
      paidOn: day(0),
      paidAmountCents: 1_200_000,
      method: "bank_transfer",
      recordedByName: office.email,
    });

    const again = await run(s, async (tx) =>
      markPaymentPaid(tx, await resolveActiveTenant(tx), ids.inc, { paidOn: day(0) }),
    ).catch((e) => e);
    expect(again).toBeInstanceOf(ValidationError);

    await run(s, async (tx) =>
      setPaymentStatus(tx, await resolveActiveTenant(tx), ids.inc, "open"),
    );
    const reopened = await run(s, async (tx) =>
      getPayment(tx, await resolveActiveTenant(tx), ids.inc),
    );
    expect(reopened).toMatchObject({ state: "overdue", paidOn: null, recordedByName: null });

    const history = await run(s, async (tx) =>
      getRecordHistory(tx, await resolveActiveTenant(tx), "customers", customerId),
    );
    expect(history.map((h) => h.verb)).toEqual(expect.arrayContaining(["paid", "reopened"]));
    const created = history.find((h) => h.table === "payments" && h.verb === "created")!;
    expect(
      created.changes.find((c) => c.field === "amount_cents")!.after?.replace(/\s/g, " "),
    ).toBe("12.500,00 €");
  });

  it("validazione: importo, data futura del saldo, concorrenza", async () => {
    const s = await createSession(pool, office);
    const err = await run(s, async (tx) =>
      createPayment(tx, await resolveActiveTenant(tx), {
        direction: "incoming",
        description: "",
        amount: "dieci",
        dueDate: "",
      }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys((err as ValidationError).fieldErrors)).toEqual(
      expect.arrayContaining(["description", "amount", "dueDate"]),
    );
    const { id } = await run(s, async (tx) =>
      createPayment(tx, await resolveActiveTenant(tx), {
        direction: "outgoing",
        description: "Fornitura cemento",
        amount: "300",
        dueDate: day(5),
      }),
    );
    const future = await run(s, async (tx) =>
      markPaymentPaid(tx, await resolveActiveTenant(tx), id, { paidOn: day(3) }),
    ).catch((e) => e);
    expect((future as ValidationError).fieldErrors.paidOn).toBeDefined();
    const stale = await run(s, async (tx) =>
      updatePayment(
        tx,
        await resolveActiveTenant(tx),
        id,
        { direction: "outgoing", description: "X", amount: "1", dueDate: day(5) },
        new Date(Date.now() - 60_000).toISOString(),
      ),
    ).catch((e) => e);
    expect(stale).toBeInstanceOf(ValidationError);
  });

  it("permessi: il responsabile operativo legge ma non scrive, il tecnico non vede", async () => {
    const sm = await createSession(pool, manager);
    const page = await run(sm, async (tx) =>
      listPayments(tx, await resolveActiveTenant(tx), { state: "all" }),
    );
    expect(page.total).toBeGreaterThan(0);
    const denied = await run(sm, async (tx) =>
      createPayment(tx, await resolveActiveTenant(tx), {
        direction: "incoming",
        description: "x",
        amount: "1",
        dueDate: day(1),
      }),
    ).catch((e) => e);
    expect(denied).toBeInstanceOf(AuthError);
    const st = await createSession(pool, tech);
    const techErr = await run(st, async (tx) =>
      listPayments(tx, await resolveActiveTenant(tx), {}),
    ).catch((e) => e);
    expect(techErr).toBeInstanceOf(AuthError);
    const sb = await createSession(pool, ownerB);
    const other = await run(sb, async (tx) =>
      listPayments(tx, await resolveActiveTenant(tx), { state: "all" }),
    );
    expect(other.total).toBe(0);
  });
});

describe("Registro comunicazioni", () => {
  it("registra con ora italiana, richiamo nel calendario, filtri e richiamo fatto", async () => {
    const s = await createSession(pool, office);
    const { id } = await run(s, async (tx) =>
      createCommunication(tx, await resolveActiveTenant(tx), {
        channel: "phone",
        direction: "inbound",
        occurredAt: "2026-11-17T09:30",
        subject: "Segnalazione perdita in cantina",
        body: "L'amministratore chiede un sopralluogo.",
        contactName: "Sig. Neri",
        relatedType: "customer",
        relatedId: customerId,
        followUpDate: day(2),
      }),
    );
    const c = await run(s, async (tx) => getCommunication(tx, await resolveActiveTenant(tx), id));
    expect(c!.occurredAt.toISOString()).toBe("2026-11-17T08:30:00.000Z"); // 09:30 a Roma (CET)
    expect(c).toMatchObject({
      channel: "phone",
      related: { type: "customer", id: customerId, name: "Condominio Aurora" },
      followUpDone: false,
      createdByName: office.email,
    });

    const lists = await run(s, async (tx) => {
      const a = await resolveActiveTenant(tx);
      return {
        pending: await listCommunications(tx, a, { followUp: "pending" }),
        byCustomer: await listCommunications(tx, a, { customerId }),
        email: await listCommunications(tx, a, { channel: "email" }),
        q: await listCommunications(tx, a, { q: "neri" }),
        cal: await listCalendar(tx, a, { from: day(0), to: day(5) }),
      };
    });
    expect(lists.pending.rows.map((r) => r.id)).toEqual([id]);
    expect(lists.byCustomer.rows.map((r) => r.id)).toEqual([id]);
    expect(lists.email.total).toBe(0);
    expect(lists.q.rows.map((r) => r.id)).toEqual([id]);
    expect(lists.cal.find((i) => i.id === id)).toMatchObject({
      kind: "follow_up",
      href: `/app/comunicazioni/${id}`,
    });
    expect(lists.cal.some((i) => i.kind === "payment")).toBe(true);

    await run(s, async (tx) => setFollowUpDone(tx, await resolveActiveTenant(tx), id, true));
    const after = await run(s, async (tx) =>
      listCommunications(tx, await resolveActiveTenant(tx), { followUp: "pending" }),
    );
    expect(after.total).toBe(0);
  });

  it("validazione e permessi: soggetto obbligatorio se si sceglie il tipo; tecnico escluso", async () => {
    const s = await createSession(pool, office);
    const err = await run(s, async (tx) =>
      createCommunication(tx, await resolveActiveTenant(tx), {
        channel: "fax" as "phone", // valore non ammesso, come da un modulo manomesso
        direction: "inbound",
        occurredAt: "ieri",
        subject: "",
        relatedType: "customer",
      }),
    ).catch((e) => e);
    expect(Object.keys((err as ValidationError).fieldErrors)).toEqual(
      expect.arrayContaining(["channel", "occurredAt", "subject"]),
    );
    const noSubject = await run(s, async (tx) =>
      createCommunication(tx, await resolveActiveTenant(tx), {
        channel: "email",
        direction: "inbound",
        occurredAt: "2026-11-17T10:00",
        subject: "Preventivo",
        relatedType: "customer",
      }),
    ).catch((e) => e);
    expect((noSubject as ValidationError).fieldErrors.relatedId).toBeDefined();
    const st = await createSession(pool, tech);
    const denied = await run(st, async (tx) =>
      listCommunications(tx, await resolveActiveTenant(tx), {}),
    ).catch((e) => e);
    expect(denied).toBeInstanceOf(AuthError);
  });
});
