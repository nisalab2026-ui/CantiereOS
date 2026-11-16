import { addMember, createTenant, createUser, insertRow, uniq, type Db } from "./db.js";

/** Un set completo di dati aziendali per un tenant (almeno una riga per tabella). */
async function seedTenantData(db: Db, tenantId: string, linkedUserId: string) {
  const customer = await insertRow(db, "customers", {
    tenant_id: tenantId,
    display_name: `Cliente ${uniq("c")}`,
  });
  const supplier = await insertRow(db, "suppliers", {
    tenant_id: tenantId,
    display_name: `Fornitore ${uniq("s")}`,
  });
  const customerContact = await insertRow(db, "contacts", {
    tenant_id: tenantId,
    customer_id: customer,
    first_name: "Referente",
  });
  const supplierContact = await insertRow(db, "contacts", {
    tenant_id: tenantId,
    supplier_id: supplier,
    first_name: "Agente",
  });
  const site = await insertRow(db, "customer_sites", {
    tenant_id: tenantId,
    customer_id: customer,
    name: "Sede principale",
    address_line: "Via di Prova 1",
    city: "Milano",
  });
  const employee = await insertRow(db, "employees", {
    tenant_id: tenantId,
    user_id: linkedUserId,
    first_name: "Mario",
    last_name: "Prova",
  });
  const employee2 = await insertRow(db, "employees", {
    tenant_id: tenantId,
    first_name: "Luigi",
    last_name: "Prova",
  });
  const team = await insertRow(db, "teams", {
    tenant_id: tenantId,
    name: `Squadra ${uniq("t")}`,
    leader_employee_id: employee,
  });
  const teamMember = await insertRow(db, "team_members", {
    tenant_id: tenantId,
    team_id: team,
    employee_id: employee,
  });
  const customRole = await insertRow(db, "roles", {
    tenant_id: tenantId,
    key: `custom_${Math.random().toString(36).slice(2, 10)}`,
    name: "Ruolo personalizzato",
  });
  const { rows } = await db.query<{ id: string }>(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, id from public.permissions where key = 'customers.read' returning id`,
    [customRole],
  );
  return {
    customer,
    supplier,
    customerContact,
    supplierContact,
    site,
    employee,
    employee2,
    team,
    teamMember,
    customRole,
    customRolePermission: rows[0]!.id,
  };
}

export type TenantData = Awaited<ReturnType<typeof seedTenantData>>;

/**
 * Due aziende indipendenti (A e B) con utenti in ruoli diversi e almeno una
 * riga in ogni tabella aziendale. I dati vivono solo nel database effimero.
 */
export async function seedTwoTenants(db: Db) {
  const users = {
    aliceOwnerA: await createUser(db, "alice"),
    graceAdminA: await createUser(db, "grace"),
    martaManagerA: await createUser(db, "marta"),
    carolOfficeA: await createUser(db, "carol"),
    bobTechA: await createUser(db, "bob"),
    victorViewerA: await createUser(db, "victor"),
    frankSuspendedA: await createUser(db, "frank"),
    ivanInvitedA: await createUser(db, "ivan"),
    daveOwnerB: await createUser(db, "dave"),
    tomTechB: await createUser(db, "tom"),
    eveMulti: await createUser(db, "eve"), // viewer in A, office in B
    outsider: await createUser(db, "outsider"),
  };

  const tenantA = await createTenant(db, "Edilizia Alfa Test", users.aliceOwnerA);
  const tenantB = await createTenant(db, "Impianti Beta Test", users.daveOwnerB);

  await addMember(db, tenantA, users.graceAdminA, "admin");
  await addMember(db, tenantA, users.martaManagerA, "manager");
  await addMember(db, tenantA, users.carolOfficeA, "office");
  await addMember(db, tenantA, users.bobTechA, "technician");
  await addMember(db, tenantA, users.victorViewerA, "viewer");
  await addMember(db, tenantA, users.frankSuspendedA, "office", "suspended");
  await addMember(db, tenantA, users.ivanInvitedA, "technician", "invited");
  await addMember(db, tenantA, users.eveMulti, "viewer");
  await addMember(db, tenantB, users.tomTechB, "technician");
  await addMember(db, tenantB, users.eveMulti, "office");

  const a = await seedTenantData(db, tenantA, users.bobTechA);
  const b = await seedTenantData(db, tenantB, users.tomTechB);

  return { users, tenantA, tenantB, a, b };
}

export type Seed = Awaited<ReturnType<typeof seedTwoTenants>>;
