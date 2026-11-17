import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addComment,
  AuthError,
  createDeadline,
  createTask,
  deleteComment,
  editComment,
  getTask,
  getTaskSummary,
  listCalendar,
  listComments,
  listTasks,
  resolveActiveTenant,
  setTaskStatus,
  updateTask,
  ValidationError,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

/** Attività assegnabili, calendario e commenti interni (ADR-011). */
let pool: pg.Pool;
type User = { id: string; email: string };
let owner: User, office: User, tech: User, tech2: User, viewer: User, ownerB: User;
let tenantA: string;
let customerId: string;

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  pool = createPool();
  owner = await createUser(pool, "att-titolare");
  office = await createUser(pool, "att-ufficio");
  tech = await createUser(pool, "att-tecnico");
  tech2 = await createUser(pool, "att-tecnico2");
  viewer = await createUser(pool, "att-lettore");
  ownerB = await createUser(pool, "att-titolareb");
  tenantA = await createTenant(pool, "Attività A", owner.id);
  await createTenant(pool, "Attività B", ownerB.id);
  await addMember(pool, tenantA, office.id, "back_office");
  await addMember(pool, tenantA, tech.id, "technician");
  await addMember(pool, tenantA, tech2.id, "technician");
  await addMember(pool, tenantA, viewer.id, "viewer");
  const c = await pool.query<{ id: string }>(
    "insert into public.customers (tenant_id, display_name) values ($1, 'Bianchi Costruzioni') returning id",
    [tenantA],
  );
  customerId = c.rows[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

async function newTask(s: VerifiedSession, input: Record<string, string>) {
  return run(s, async (tx) =>
    createTask(tx, await resolveActiveTenant(tx), { title: "Attività", ...input }),
  );
}

describe("Attività", () => {
  it("crea con assegnatario e cliente; l'assegnatario riceve la notifica", async () => {
    const s = await createSession(pool, office);
    const { id } = await newTask(s, {
      title: "Sopralluogo cantiere",
      priority: "high",
      dueDate: day(3),
      assigneeUserId: tech.id,
      subjectType: "customer",
      subjectId: customerId,
    });
    const t = await run(s, async (tx) => getTask(tx, await resolveActiveTenant(tx), id));
    expect(t).toMatchObject({
      title: "Sopralluogo cantiere",
      status: "todo",
      priority: "high",
      assigneeId: tech.id,
      subject: { type: "customer", id: customerId, name: "Bianchi Costruzioni" },
      createdByName: office.email,
    });
    const n = await pool.query(
      "select link from public.notifications where user_id = $1 and kind = 'tasks.assigned'",
      [tech.id],
    );
    expect(n.rows.map((r) => r.link)).toContain(`/app/attivita/${id}`);
  });

  it("validazione per campo", async () => {
    const s = await createSession(pool, office);
    const err = await newTask(s, { title: " ", subjectType: "customer" }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys((err as ValidationError).fieldErrors)).toEqual(
      expect.arrayContaining(["title", "subjectId"]),
    );
    const bad = await newTask(s, { assigneeUserId: ownerB.id }).catch((e) => e);
    expect(bad).toBeInstanceOf(ValidationError);
    expect((bad as ValidationError).fieldErrors.assigneeUserId).toBeDefined();
  });

  it("il tecnico aggiorna lo stato solo delle proprie attività e non può crearne", async () => {
    const office_s = await createSession(pool, office);
    const { id: mine } = await newTask(office_s, { title: "Mia", assigneeUserId: tech.id });
    const { id: other } = await newTask(office_s, { title: "Altrui", assigneeUserId: tech2.id });
    const s = await createSession(pool, tech);
    await run(s, async (tx) =>
      setTaskStatus(tx, await resolveActiveTenant(tx), mine, { status: "done", notes: "Fatto" }),
    );
    const t = await run(s, async (tx) => getTask(tx, await resolveActiveTenant(tx), mine));
    expect(t).toMatchObject({
      status: "done",
      completionNotes: "Fatto",
      completedByName: tech.email,
    });
    expect(t!.completedAt).toBeInstanceOf(Date);
    const err = await run(s, async (tx) =>
      setTaskStatus(tx, await resolveActiveTenant(tx), other, { status: "in_progress" }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    const denied = await newTask(s, { title: "No" }).catch((e) => e);
    expect(denied).toBeInstanceOf(AuthError);
  });

  it("la modifica completa controlla la concorrenza", async () => {
    const s = await createSession(pool, office);
    const { id } = await newTask(s, { title: "Da rivedere" });
    const t = await run(s, async (tx) => getTask(tx, await resolveActiveTenant(tx), id));
    const stale = new Date(t!.updatedAt.getTime() - 5000).toISOString();
    const err = await run(s, async (tx) =>
      updateTask(tx, await resolveActiveTenant(tx), id, { title: "X" }, stale),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    await run(s, async (tx) =>
      updateTask(
        tx,
        await resolveActiveTenant(tx),
        id,
        { title: "Rivista", priority: "urgent" },
        t!.updatedAt.toISOString(),
      ),
    );
    const after = await run(s, async (tx) => getTask(tx, await resolveActiveTenant(tx), id));
    expect(after).toMatchObject({ title: "Rivista", priority: "urgent" });
  });

  it("filtri: scadute, assegnate a me, ricerca, cliente; riepilogo", async () => {
    const s = await createSession(pool, office);
    const { id: late } = await newTask(s, {
      title: "Preventivo ritardatario",
      dueDate: day(-1),
      assigneeUserId: office.id,
      subjectType: "customer",
      subjectId: customerId,
    });
    const page = await run(s, async (tx) => {
      const a = await resolveActiveTenant(tx);
      return {
        overdue: await listTasks(tx, a, { state: "overdue" }),
        mine: await listTasks(tx, a, { assignee: "me" }),
        q: await listTasks(tx, a, { q: "ritardat" }),
        byCustomer: await listTasks(tx, a, { customerId, state: "all" }),
        done: await listTasks(tx, a, { state: "done" }),
        summary: await getTaskSummary(tx, a),
      };
    });
    expect(page.overdue.rows.map((r) => r.id)).toEqual([late]);
    expect(page.overdue.rows[0]!.overdue).toBe(true);
    expect(page.mine.rows.map((r) => r.id)).toContain(late);
    expect(page.mine.rows.every((r) => r.assigneeId === office.id)).toBe(true);
    expect(page.q.rows.map((r) => r.id)).toEqual([late]);
    expect(page.byCustomer.rows.map((r) => r.id)).toContain(late);
    expect(page.done.rows.every((r) => r.status === "done")).toBe(true);
    expect(page.summary.overdue).toBe(1);
    expect(page.summary.mine).toBeGreaterThanOrEqual(1);
  });

  it("un'altra azienda non vede le attività", async () => {
    const s = await createSession(pool, ownerB);
    const res = await run(s, async (tx) =>
      listTasks(tx, await resolveActiveTenant(tx), { state: "all" }),
    );
    expect(res.total).toBe(0);
  });
});

describe("Calendario", () => {
  it("unisce scadenze e attività nel periodo, ciascuna col proprio permesso", async () => {
    const s = await createSession(pool, office);
    const { id: dl } = await run(s, async (tx) =>
      createDeadline(tx, await resolveActiveTenant(tx), {
        kind: "maintenance",
        title: "Verifica estintori",
        dueDate: day(5),
      }),
    );
    const { id: tk } = await newTask(s, {
      title: "Ordine materiale",
      dueDate: day(5),
      assigneeUserId: tech.id,
    });
    const range = { from: day(0), to: day(10) };
    const items = await run(s, async (tx) =>
      listCalendar(tx, await resolveActiveTenant(tx), range),
    );
    expect(items.find((i) => i.id === dl)).toMatchObject({
      kind: "deadline",
      href: `/app/scadenze/${dl}`,
    });
    expect(items.find((i) => i.id === tk)).toMatchObject({ kind: "task", ownerName: tech.email });

    const techItems = await run(await createSession(pool, tech), async (tx) =>
      listCalendar(tx, await resolveActiveTenant(tx), { ...range, mine: true }),
    );
    expect(techItems.map((i) => i.id)).toContain(tk);
    expect(techItems.every((i) => i.ownerName === tech.email)).toBe(true);

    const err = await run(s, async (tx) =>
      listCalendar(tx, await resolveActiveTenant(tx), { from: day(0), to: day(90) }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
  });
});

describe("Commenti", () => {
  it("aggiunge, modifica solo i propri, elimina; il lettore legge ma non scrive", async () => {
    const so = await createSession(pool, office);
    const st = await createSession(pool, tech);
    const subject = { table: "customers", id: customerId };
    const { id: c1 } = await run(so, async (tx) =>
      addComment(tx, await resolveActiveTenant(tx), subject, { body: "Chiamato il cliente" }),
    );
    const { id: c2 } = await run(st, async (tx) =>
      addComment(tx, await resolveActiveTenant(tx), subject, { body: "Materiale in arrivo" }),
    );
    const editErr = await run(st, async (tx) =>
      editComment(tx, await resolveActiveTenant(tx), c1, { body: "manomesso" }),
    ).catch((e) => e);
    expect(editErr).toBeInstanceOf(ValidationError);
    await run(so, async (tx) =>
      editComment(tx, await resolveActiveTenant(tx), c1, {
        body: "Chiamato il cliente, richiamare",
      }),
    );
    const delErr = await run(so, async (tx) =>
      deleteComment(tx, await resolveActiveTenant(tx), c2),
    ).catch((e) => e);
    expect(delErr).toBeInstanceOf(ValidationError);

    const sv = await createSession(pool, viewer);
    const list = await run(sv, async (tx) =>
      listComments(tx, await resolveActiveTenant(tx), subject),
    );
    expect(list.map((c) => c.body)).toEqual([
      "Chiamato il cliente, richiamare",
      "Materiale in arrivo",
    ]);
    expect(list[0]!.editedAt).toBeInstanceOf(Date);
    expect(list[0]!.authorName).toBe(office.email);
    const vErr = await run(sv, async (tx) =>
      addComment(tx, await resolveActiveTenant(tx), subject, { body: "no" }),
    ).catch((e) => e);
    expect(vErr).toBeInstanceOf(AuthError);

    // Il titolare (comments.delete, MFA) può moderare.
    const sOwner = await createSession(pool, owner);
    await run(sOwner, async (tx) => deleteComment(tx, await resolveActiveTenant(tx), c2));
    const after = await run(so, async (tx) =>
      listComments(tx, await resolveActiveTenant(tx), subject),
    );
    expect(after.map((c) => c.id)).toEqual([c1]);
  });

  it("commento su un elemento di un'altra azienda: rifiutato", async () => {
    const s = await createSession(pool, ownerB);
    const err = await run(s, async (tx) =>
      addComment(
        tx,
        await resolveActiveTenant(tx),
        { table: "customers", id: customerId },
        { body: "x" },
      ),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
  });
});
