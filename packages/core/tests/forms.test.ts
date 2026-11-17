import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  createFormSubmission,
  createFormTemplate,
  FORM_LIBRARY,
  formDefinitionSchema,
  formProgress,
  getFormSubmission,
  getFormTemplate,
  getRecordHistory,
  listFormSubmissions,
  listFormTemplates,
  parseFormDefinition,
  publishFormTemplate,
  reopenFormSubmission,
  resolveActiveTenant,
  saveFormSubmission,
  updateFormTemplateDraft,
  validateFormData,
  ValidationError,
  withUserTransaction,
  type FormDefinition,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

/** Moduli compilabili (ADR-013). */
let pool: pg.Pool;
type User = { id: string; email: string };
let owner: User, office: User, tech: User;
let tenantA: string, customerId: string, siteId: string;

const SIGN = "data:image/png;base64,iVBORw0KGgo=";

beforeAll(async () => {
  pool = createPool();
  owner = await createUser(pool, "mod-titolare");
  office = await createUser(pool, "mod-ufficio");
  tech = await createUser(pool, "mod-tecnico");
  tenantA = await createTenant(pool, "Moduli A", owner.id);
  await addMember(pool, tenantA, office.id, "back_office");
  await addMember(pool, tenantA, tech.id, "technician");
  customerId = (
    await pool.query<{ id: string }>(
      `insert into public.customers (tenant_id, display_name, billing_address_line, billing_postal_code, billing_city, billing_province)
       values ($1, 'Condominio Aurora', 'Via Roma 1', '20100', 'Milano', 'MI') returning id`,
      [tenantA],
    )
  ).rows[0]!.id;
  siteId = (
    await pool.query<{ id: string }>(
      `insert into public.customer_sites (tenant_id, customer_id, name, address_line, postal_code, city, province)
       values ($1, $2, 'Copertura scala B', 'Via Verdi 3', '20121', 'Milano', 'MI') returning id`,
      [tenantA, customerId],
    )
  ).rows[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

describe("Definizione e valori (puri)", () => {
  it("i modelli pronti sono definizioni valide", () => {
    for (const e of FORM_LIBRARY)
      expect(formDefinitionSchema.safeParse(e.definition).success).toBe(true);
  });

  it("rifiuta campi duplicati, scelte con una sola opzione, due identificativi d'impianto", () => {
    const bad = parseFormDefinition({
      sections: [
        {
          id: "s",
          title: "Sezione",
          fields: [
            { id: "a", type: "text", label: "A" },
            { id: "a", type: "date", label: "Data" },
          ],
        },
      ],
    });
    expect(bad).toEqual({ ok: false, error: "«Sezione», «Data»: Campo duplicato: a" });
    expect(
      parseFormDefinition({
        sections: [
          {
            id: "s",
            title: "S",
            fields: [{ id: "c", type: "choice", label: "C", options: ["x"] }],
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      parseFormDefinition({
        sections: [
          {
            id: "s",
            title: "S",
            fields: [
              { id: "a", type: "text", label: "A", isSubjectCode: true },
              { id: "b", type: "text", label: "B", isSubjectCode: true },
            ],
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it("bozza: solo formato; chiusura: anche gli obbligatori; ignora campi sconosciuti", () => {
    const def: FormDefinition = {
      sections: [
        {
          id: "s",
          title: "S",
          fields: [
            { id: "n", type: "number", label: "N", min: 0, max: 10 },
            { id: "yn", type: "yes_no", label: "YN", required: true, withNote: true },
            {
              id: "ck",
              type: "checklist",
              label: "CK",
              required: true,
              rows: ["r1", "r2"],
              options: ["Positivo", "Negativo"],
              withNote: true,
            },
            { id: "ch", type: "choice", label: "CH", options: ["A", "B"], multiple: true },
            { id: "sig", type: "signature", label: "Firma" },
          ],
        },
      ],
    };
    const draft = validateFormData(
      def,
      {
        n: "3,5",
        ck: { rows: [{ value: "Positivo", note: " ok " }] },
        ch: ["B", "A"],
        evil: "x",
      },
      "draft",
    );
    expect(draft.errors).toEqual({});
    expect(draft.data).toEqual({
      n: 3.5,
      ck: { rows: [{ value: "Positivo", note: "ok" }, { value: null }] },
      ch: ["A", "B"],
    });
    expect(validateFormData(def, draft.data, "complete").errors).toEqual({
      yn: "Campo obbligatorio",
      ck: "Completa tutte le righe",
    });
    expect(
      validateFormData(def, { n: 11, ch: ["Z"], sig: { image: "javascript:x" } }, "draft").errors,
    ).toEqual({
      n: "Massimo 10",
      ch: "Scelta non valida",
      sig: "Firma non valida",
    });
    expect(formProgress(def, draft.data)).toEqual({ done: 2, total: 5 });
  });
});

describe("Modelli e compilazioni", () => {
  let templateId: string;

  it("dal modello pronto alla pubblicazione; il tecnico non gestisce modelli", async () => {
    const s = await createSession(pool, office);
    templateId = await run(s, async (tx) => {
      const a = await resolveActiveTenant(tx);
      const { id } = await createFormTemplate(tx, a, {
        name: "Ispezione linea vita",
        category: "inspection",
        libraryKey: "linea-vita-uni-11560",
      });
      expect((await publishFormTemplate(tx, a, id)).version).toBe(1);
      await expect(publishFormTemplate(tx, a, id)).rejects.toThrow(ValidationError);
      return id;
    });
    const t = await run(s, async (tx) =>
      getFormTemplate(tx, await resolveActiveTenant(tx), templateId),
    );
    expect(t).toMatchObject({
      currentVersion: 1,
      hasDraftChanges: false,
      libraryKey: "linea-vita-uni-11560",
    });

    const ts = await createSession(pool, tech);
    await expect(
      run(ts, async (tx) =>
        createFormTemplate(tx, await resolveActiveTenant(tx), { name: "Mio", category: "other" }),
      ),
    ).rejects.toThrow(AuthError);
    const visible = await run(ts, async (tx) =>
      listFormTemplates(tx, await resolveActiveTenant(tx), { onlyPublished: true }),
    );
    expect(visible.map((r) => r.id)).toEqual([templateId]);
  });

  it("compilazione: dati automatici, chiusura con obbligatori, ultima ispezione dello stesso impianto", async () => {
    const ts = await createSession(pool, tech);
    const fill = {
      n_impianto: "LV-07",
      tipologia: ["Ispezione periodica (IP)"],
      documenti: { rows: Array.from({ length: 11 }, () => ({ value: "Sì" })) },
      tipo_controllo: ["Visivo", "Funzionale"],
      controlli: { rows: Array.from({ length: 9 }, () => ({ value: "Positivo" })) },
      esito_finale: "Sistema idoneo all'uso",
      firma_tecnico: { image: SIGN, name: "Tecnico", signedAt: new Date().toISOString() },
    };
    const first = await run(ts, async (tx) => {
      const a = await resolveActiveTenant(tx);
      const { id } = await createFormSubmission(tx, a, { templateId, customerId, siteId });
      const sub = (await getFormSubmission(tx, a, id))!;
      expect(sub.title).toBe("Ispezione linea vita");
      expect(sub.data).toMatchObject({
        committente: "Condominio Aurora",
        committente_indirizzo: "Via Roma 1, 20100 Milano (MI)",
        sito: "Via Verdi 3, 20121 Milano (MI)",
        installatore: "Moduli A",
      });
      // chiusura senza obbligatori: errori per campo
      const err = await saveFormSubmission(
        tx,
        a,
        id,
        { title: sub.title, customerId, siteId, data: { n_impianto: "LV-07" } },
        new Date(sub.updatedAt).toISOString(),
        true,
      ).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(Object.keys((err as ValidationError).fieldErrors)).toContain("firma_tecnico");
      await saveFormSubmission(
        tx,
        a,
        id,
        { title: sub.title, customerId, siteId, data: fill },
        new Date(sub.updatedAt).toISOString(),
        true,
      );
      return id;
    });
    const closed = await run(ts, async (tx) =>
      getFormSubmission(tx, await resolveActiveTenant(tx), first),
    );
    expect(closed).toMatchObject({
      status: "completed",
      subjectCode: "LV-07",
      completedByName: tech.email,
      data: { data_ultima_ispezione: "Nessuna precedente", tecnico: tech.email },
    });

    // la seconda ispezione dello stesso impianto trova la data della prima
    const second = await run(ts, async (tx) => {
      const a = await resolveActiveTenant(tx);
      const { id } = await createFormSubmission(tx, a, {
        templateId,
        customerId,
        title: "Seconda",
      });
      const sub = (await getFormSubmission(tx, a, id))!;
      await saveFormSubmission(
        tx,
        a,
        id,
        { title: "Seconda", customerId, data: { n_impianto: "lv-07" } },
        new Date(sub.updatedAt).toISOString(),
        false,
      );
      return (await getFormSubmission(tx, a, id))!;
    });
    expect(second.data.data_ultima_ispezione).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(second.status).toBe("draft");

    // chiuso: il tecnico non modifica né riapre
    await expect(
      run(ts, async (tx) =>
        saveFormSubmission(
          tx,
          await resolveActiveTenant(tx),
          first,
          { title: "x", data: {} },
          new Date(closed!.updatedAt).toISOString(),
          false,
        ),
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      run(ts, async (tx) => reopenFormSubmission(tx, await resolveActiveTenant(tx), first)),
    ).rejects.toThrow(AuthError);

    // l'ufficio riapre; resta nella cronologia del cliente
    const os = await createSession(pool, office);
    await run(os, async (tx) => reopenFormSubmission(tx, await resolveActiveTenant(tx), first));
    const after = await run(os, async (tx) => {
      const a = await resolveActiveTenant(tx);
      return {
        list: await listFormSubmissions(tx, a, { q: "lv-07" }),
        history: await getRecordHistory(tx, a, "customers", customerId),
      };
    });
    expect(after.list.rows.map((r) => r.id).sort()).toEqual([first, second.id].sort());
    expect(after.history.some((h) => h.table === "form_submissions")).toBe(true);
  });

  it("modificare il modello non cambia i moduli già compilati", async () => {
    const s = await createSession(pool, office);
    const res = await run(s, async (tx) => {
      const a = await resolveActiveTenant(tx);
      const t = (await getFormTemplate(tx, a, templateId))!;
      const def = structuredClone(t.draftDefinition);
      def.sections[0]!.title = "Anagrafica";
      await updateFormTemplateDraft(
        tx,
        a,
        templateId,
        { name: t.name, category: t.category, definition: def },
        new Date(t.updatedAt).toISOString(),
      );
      const v2 = await publishFormTemplate(tx, a, templateId);
      const subs = await listFormSubmissions(tx, a, { templateId });
      const old = (await getFormSubmission(tx, a, subs.rows[0]!.id))!;
      return { v2, old };
    });
    expect(res.v2.version).toBe(2);
    expect(res.old.version).toBe(1);
    expect(res.old.definition.sections[0]!.title).toBe("Dati generali");
  });

  it("una definizione non valida non si salva", async () => {
    const s = await createSession(pool, office);
    await expect(
      run(s, async (tx) => {
        const a = await resolveActiveTenant(tx);
        const t = (await getFormTemplate(tx, a, templateId))!;
        await updateFormTemplateDraft(
          tx,
          a,
          templateId,
          { name: t.name, category: t.category, definition: { sections: [{ id: "1x" }] } },
          new Date(t.updatedAt).toISOString(),
        );
      }),
    ).rejects.toThrow(ValidationError);
  });
});
