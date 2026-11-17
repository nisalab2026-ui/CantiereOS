import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  completeDeadline,
  createDeadline,
  createEmployee,
  getCustomer,
  getDeadline,
  getDeadlineSummary,
  getEmployee,
  getRecordHistory,
  listActivity,
  listDeadlines,
  refreshDeadlineNotifications,
  resolveActiveTenant,
  setCustomerActive,
  setDeadlineStatus,
  updateCustomer,
  updateDeadline,
  updateEmployee,
  ValidationError,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

let pool: pg.Pool;
type User = { id: string; email: string };
let owner: User, office: User, tech: User, ownerB: User;
let tenantA: string;
let customerId: string;

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  pool = createPool();
  owner = await createUser(pool, "op-titolare");
  office = await createUser(pool, "op-ufficio");
  tech = await createUser(pool, "op-tecnico");
  ownerB = await createUser(pool, "op-titolareb");
  tenantA = await createTenant(pool, "Operativa A", owner.id);
  await createTenant(pool, "Operativa B", ownerB.id);
  await addMember(pool, tenantA, office.id, "back_office");
  await addMember(pool, tenantA, tech.id, "technician");
  const c = await pool.query<{ id: string }>(
    "insert into public.customers (tenant_id, display_name) values ($1, 'Rossi Impianti Srl') returning id",
    [tenantA],
  );
  customerId = c.rows[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

describe("Scadenziario", () => {
  it("crea, elenca con stato calcolato e collega al cliente", async () => {
    const s = await createSession(pool, office);
    const { id } = await run(s, async (tx) =>
      createDeadline(tx, await resolveActiveTenant(tx), {
        kind: "maintenance",
        title: "Manutenzione caldaia",
        dueDate: day(-2),
        subjectType: "customer",
        subjectId: customerId,
        responsibleUserId: office.id,
        recurrenceMonths: "12",
        remindDaysBefore: "15",
      }),
    );
    const page = await run(s, async (tx) =>
      listDeadlines(tx, await resolveActiveTenant(tx), { state: "overdue" }),
    );
    const row = page.rows.find((r) => r.id === id)!;
    expect(row.state).toBe("overdue");
    expect(row.subject).toEqual({ type: "customer", id: customerId, name: "Rossi Impianti Srl" });
    expect(row.responsibleName).toBe(office.email);
    const byCustomer = await run(s, async (tx) =>
      listDeadlines(tx, await resolveActiveTenant(tx), { customerId, state: "all" }),
    );
    expect(byCustomer.total).toBe(1);
  });

  it("validazione per campo e collegamento obbligatorio se si sceglie il tipo", async () => {
    const s = await createSession(pool, office);
    const err = await run(s, async (tx) =>
      createDeadline(tx, await resolveActiveTenant(tx), {
        kind: "other",
        title: "",
        dueDate: "",
        subjectType: "customer",
      }).catch((e: unknown) => e),
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys((err as ValidationError).fieldErrors).sort()).toEqual(
      ["dueDate", "subjectId", "title"].sort(),
    );
  });

  it("il tecnico legge ma non crea", async () => {
    const s = await createSession(pool, tech);
    const err = await run(s, async (tx) =>
      createDeadline(tx, await resolveActiveTenant(tx), {
        kind: "other",
        title: "x",
        dueDate: day(1),
      }).catch((e: unknown) => e),
    );
    expect(err).toBeInstanceOf(AuthError);
  });

  it("completare una ricorrente crea la successiva; la storia resta collegata", async () => {
    const s = await createSession(pool, office);
    const { id } = await run(s, async (tx) =>
      createDeadline(tx, await resolveActiveTenant(tx), {
        kind: "inspection",
        title: "Verifica estintori",
        dueDate: "2026-01-31",
        recurrenceMonths: "6",
      }),
    );
    const { nextId } = await run(s, async (tx) =>
      completeDeadline(tx, await resolveActiveTenant(tx), id, { notes: "Tutto regolare" }),
    );
    expect(nextId).toBeTruthy();
    const [done, next] = await run(s, async (tx) => {
      const a = await resolveActiveTenant(tx);
      return [await getDeadline(tx, a, id), await getDeadline(tx, a, nextId!)];
    });
    expect(done!.state).toBe("done");
    expect(done!.completedByName).toBe(office.email);
    expect(done!.nextId).toBe(nextId);
    expect(next!.dueDate).toBe("2026-07-31");
    expect(next!.previousId).toBe(id);
    // non si completa due volte; non si riapre se esiste la successiva
    await expect(
      run(s, async (tx) => completeDeadline(tx, await resolveActiveTenant(tx), id, {})),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      run(s, async (tx) => setDeadlineStatus(tx, await resolveActiveTenant(tx), id, "open")),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("la modifica rifiuta una versione superata invece di sovrascrivere", async () => {
    const s = await createSession(pool, office);
    const { id } = await run(s, async (tx) =>
      createDeadline(tx, await resolveActiveTenant(tx), {
        kind: "document",
        title: "DURC",
        dueDate: day(40),
      }),
    );
    const d = await run(s, async (tx) => getDeadline(tx, await resolveActiveTenant(tx), id));
    const v1 = d!.updatedAt.toISOString();
    await run(s, async (tx) =>
      updateDeadline(
        tx,
        await resolveActiveTenant(tx),
        id,
        { kind: "document", title: "DURC aggiornato", dueDate: day(45) },
        v1,
      ),
    );
    await expect(
      run(s, async (tx) =>
        updateDeadline(
          tx,
          await resolveActiveTenant(tx),
          id,
          { kind: "document", title: "Versione vecchia", dueDate: day(10) },
          v1,
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("riepilogo per la dashboard e avvisi idempotenti", async () => {
    const s = await createSession(pool, office);
    const summary = await run(s, async (tx) =>
      getDeadlineSummary(tx, await resolveActiveTenant(tx)),
    );
    expect(summary!.overdue).toBeGreaterThanOrEqual(1);
    expect(summary!.byMonth).toHaveLength(6);
    expect(summary!.urgent.some((u) => u.title === "Manutenzione caldaia")).toBe(true);
    const first = await run(s, async (tx) =>
      refreshDeadlineNotifications(tx, await resolveActiveTenant(tx)),
    );
    const second = await run(s, async (tx) =>
      refreshDeadlineNotifications(tx, await resolveActiveTenant(tx)),
    );
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });
});

describe("Schede e storico", () => {
  it("modifica cliente con storico leggibile: chi, cosa, prima e dopo", async () => {
    const s = await createSession(pool, office);
    const c = await run(s, async (tx) =>
      getCustomer(tx, await resolveActiveTenant(tx), customerId),
    );
    await run(s, async (tx) =>
      updateCustomer(
        tx,
        await resolveActiveTenant(tx),
        customerId,
        {
          displayName: "Rossi Impianti S.r.l.",
          partyType: "company",
          city: "Bergamo",
          province: "bg",
        },
        c!.updatedAt.toISOString(),
      ),
    );
    await run(s, async (tx) =>
      setCustomerActive(tx, await resolveActiveTenant(tx), customerId, false),
    );
    // il tecnico legge il cliente: vede la cronologia anche senza audit.read
    const t = await createSession(pool, tech);
    const events = await run(t, async (tx) =>
      getRecordHistory(tx, await resolveActiveTenant(tx), "customers", customerId),
    );
    const update = events.find((e) => e.verb === "updated" && e.table === "customers")!;
    expect(update.actorName).toBe(office.email);
    expect(update.changes).toContainEqual({
      field: "display_name",
      label: "Nome",
      before: "Rossi Impianti Srl",
      after: "Rossi Impianti S.r.l.",
    });
    expect(update.changes).toContainEqual({
      field: "billing_province",
      label: "Provincia",
      before: null,
      after: "BG",
    });
    expect(events[0]!.verb).toBe("archived");
    // la scadenza collegata compare nella storia del cliente, col responsabile per nome
    const dl = events.find((e) => e.table === "deadlines" && e.verb === "created")!;
    expect(dl.changes).toContainEqual(
      expect.objectContaining({ label: "Responsabile", after: office.email }),
    );
    // campi tecnici mai mostrati
    expect(events.flatMap((e) => e.changes.map((c) => c.field))).not.toContain("tenant_id");
  });

  it("registro completo solo con audit.read, filtrabile e paginato per cursore", async () => {
    const t = await createSession(pool, tech);
    await expect(
      run(t, async (tx) => listActivity(tx, await resolveActiveTenant(tx), {})),
    ).rejects.toBeInstanceOf(AuthError);
    const o = await createSession(pool, owner);
    const p1 = await run(o, async (tx) =>
      listActivity(tx, await resolveActiveTenant(tx), { table: "deadlines", limit: 2 }),
    );
    expect(p1.events).toHaveLength(2);
    expect(p1.events.every((e) => e.table === "deadlines")).toBe(true);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await run(o, async (tx) =>
      listActivity(tx, await resolveActiveTenant(tx), {
        table: "deadlines",
        limit: 2,
        before: p1.nextCursor!,
      }),
    );
    expect(p2.events[0]!.id).not.toBe(p1.events[0]!.id);
    expect(Number(p2.events[0]!.id)).toBeLessThan(Number(p1.events[1]!.id));
    const byActor = await run(o, async (tx) =>
      listActivity(tx, await resolveActiveTenant(tx), { actorId: office.id, q: "caldaia" }),
    );
    expect(byActor.events.length).toBeGreaterThan(0);
    expect(byActor.events.every((e) => e.actorId === office.id)).toBe(true);
  });

  it("personale: crea, modifica con validazione delle date, scheda con squadre", async () => {
    const s = await createSession(pool, owner);
    const { id } = await run(s, async (tx) =>
      createEmployee(tx, await resolveActiveTenant(tx), {
        firstName: "Anna",
        lastName: "Neri",
        employmentType: "employee",
        hireDate: "2024-03-01",
      }),
    );
    const e = await run(s, async (tx) => getEmployee(tx, await resolveActiveTenant(tx), id));
    expect(e!.firstName).toBe("Anna");
    const bad = await run(s, async (tx) =>
      updateEmployee(
        tx,
        await resolveActiveTenant(tx),
        id,
        {
          firstName: "Anna",
          lastName: "Neri",
          employmentType: "employee",
          hireDate: "2024-03-01",
          terminationDate: "2023-01-01",
        },
        e!.updatedAt.toISOString(),
      ).catch((x: unknown) => x),
    );
    expect((bad as ValidationError).fieldErrors.terminationDate).toBeTruthy();
    // un tecnico non modifica il personale
    const t = await createSession(pool, tech);
    await expect(
      run(t, async (tx) =>
        updateEmployee(
          tx,
          await resolveActiveTenant(tx),
          id,
          { firstName: "X", lastName: "Y", employmentType: "employee" },
          e!.updatedAt.toISOString(),
        ),
      ),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("un'altra azienda non vede né la scheda né la cronologia", async () => {
    const b = await createSession(pool, ownerB);
    const [c, h] = await run(b, async (tx) => {
      const a = await resolveActiveTenant(tx);
      return [
        await getCustomer(tx, a, customerId),
        await getRecordHistory(tx, a, "customers", customerId),
      ];
    });
    expect(c).toBeNull();
    expect(h).toEqual([]);
  });
});
