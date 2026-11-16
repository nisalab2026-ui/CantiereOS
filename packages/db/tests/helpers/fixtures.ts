import { addMember, createPartner, createTenant, createUser, type Db } from "./db.js";

/**
 * Due aziende indipendenti (A e B) con utenti in ruoli diversi.
 * Tutti i dati vivono solo nel database effimero dei test.
 */
export async function seedTwoTenants(db: Db) {
  const users = {
    aliceOwnerA: await createUser(db, "alice"),
    graceAdminA: await createUser(db, "grace"),
    carolOfficeA: await createUser(db, "carol"),
    bobTechA: await createUser(db, "bob"),
    frankSuspendedA: await createUser(db, "frank"),
    ivanInvitedA: await createUser(db, "ivan"),
    daveOwnerB: await createUser(db, "dave"),
    eveMulti: await createUser(db, "eve"), // viewer in A, office in B
    outsider: await createUser(db, "outsider"),
  };

  const tenantA = await createTenant(db, "Edilizia Alfa Test", users.aliceOwnerA);
  const tenantB = await createTenant(db, "Impianti Beta Test", users.daveOwnerB);

  await addMember(db, tenantA, users.graceAdminA, "admin");
  await addMember(db, tenantA, users.carolOfficeA, "office");
  await addMember(db, tenantA, users.bobTechA, "technician");
  await addMember(db, tenantA, users.frankSuspendedA, "office", "suspended");
  await addMember(db, tenantA, users.ivanInvitedA, "technician", "invited");
  await addMember(db, tenantA, users.eveMulti, "viewer");
  await addMember(db, tenantB, users.eveMulti, "office");

  const partners = {
    a1: await createPartner(db, tenantA, "Cliente A1"),
    a2: await createPartner(db, tenantA, "Cliente A2"),
    b1: await createPartner(db, tenantB, "Cliente B1"),
  };

  return { users, tenantA, tenantB, partners };
}

export type Seed = Awaited<ReturnType<typeof seedTwoTenants>>;
