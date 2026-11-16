import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  createOwner,
  extractLink,
  PASSWORD,
  sessionCookies,
  signIn,
  signUpAndConfirm,
  uniqueEmail,
  verifyMfa,
  waitForEmail,
} from "./helpers";

/**
 * Autenticazione e autorizzazione end-to-end contro Supabase Auth reale
 * (GoTrue), email reali catturate da mailpit e il database con RLS.
 */
test.describe.configure({ mode: "serial" });

const company = `E2E Edilizia ${Date.now().toString(36)}`;
let owner: { email: string; secret: string };
const techEmail = uniqueEmail("tecnico");

async function newPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

test("registrazione azienda: conferma email, creazione azienda, MFA obbligatoria per il titolare", async ({
  page,
}) => {
  owner = await createOwner(page, "titolare", company);
  await expect(page.getByTestId("role-name")).toHaveText("Proprietario azienda");
  // Dashboard di amministrazione e voce "Utenti e accessi" (permesso members.read, sessione aal2).
  await expect(page.getByTestId("dashboard-admin")).toBeVisible();
  await expect(page.getByRole("link", { name: "Utenti e accessi" })).toBeVisible();
});

test("login: password errata con messaggio generico; il titolare deve verificare la MFA", async ({
  browser,
}) => {
  const page = await newPage(browser);
  await signIn(page, owner.email, "password-sbagliata-123");
  await expect(page.getByTestId("form-error")).toHaveText("Email o password non corretti.");
  await signIn(page, uniqueEmail("inesistente"), "password-sbagliata-123");
  await expect(page.getByTestId("form-error")).toHaveText("Email o password non corretti.");

  await signIn(page, owner.email);
  await page.waitForURL(/\/mfa/);
  // Senza MFA l'area applicativa resta chiusa.
  await page.goto("/app/membri");
  await expect(page).toHaveURL(/\/mfa/);
  await page.getByLabel("Codice").fill("000000");
  await page.getByRole("button", { name: "Verifica" }).click();
  await expect(page.getByTestId("form-error")).toHaveText("Codice non valido o scaduto.");
  await verifyMfa(page, owner.secret);
  await expect(page.getByTestId("company-name")).toHaveText(company);
});

test("invito: email reale, accettazione con l'indirizzo invitato, ruolo Tecnico", async ({
  page,
  browser,
}) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.goto("/app/membri");
  const since = new Date(Date.now() - 1000);
  await page.getByLabel("Email").fill(techEmail);
  await page.getByLabel("Ruolo").selectOption("technician");
  await page.getByRole("button", { name: "Invia invito" }).click();
  await expect(page.getByText(`Invito inviato a ${techEmail}.`)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("pending-invitations")).toContainText(techEmail);

  const mail = await waitForEmail(techEmail, /Invito a/, since);
  const link = extractLink(mail, "/invito?token=");

  const invitee = await newPage(browser);
  await invitee.goto(link);
  // Il token esce subito dall'URL.
  await expect(invitee).toHaveURL(/\/invito\/conferma$/);
  await expect(invitee.getByText("Sei stato invitato in CantiereOS")).toBeVisible();
  await signUpAndConfirm(invitee, {
    email: techEmail,
    fullName: "E2E Tecnico",
    next: "/invito/conferma",
  });
  await expect(invitee).toHaveURL(/\/invito\/conferma$/);
  await invitee.getByRole("button", { name: "Accetta invito" }).click();
  await expect(invitee).toHaveURL(/\/app\?invito=accettato/);
  await expect(invitee.getByTestId("company-name")).toHaveText(company);
  await expect(invitee.getByTestId("role-name")).toHaveText("Tecnico");
  await expect(invitee.getByTestId("dashboard-technician")).toBeVisible();
  // Il tecnico non entra nella gestione utenti (né dal menu né dall'URL).
  await expect(invitee.getByRole("link", { name: "Utenti e accessi" })).toHaveCount(0);
  await invitee.goto("/app/membri");
  await expect(invitee.getByTestId("forbidden")).toBeVisible();
  await expect(invitee.getByTestId("members-table")).toHaveCount(0);

  // Chi ha invitato riceve una notifica reale (trigger nel database).
  await page.reload();
  await expect(page.getByTestId("notifications-unread")).toHaveText("1");
  await page.getByTestId("notifications").click();
  await expect(page.getByTestId("notification-item").first()).toContainText("Invito accettato");
  await page.getByRole("button", { name: "Segna tutte come lette" }).click();
  await expect(page.getByTestId("notifications-unread")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("notifications-unread")).toHaveCount(0);

  // Lo stesso link non funziona una seconda volta.
  await invitee.goto(link);
  await invitee.getByRole("button", { name: "Accetta invito" }).click();
  await expect(invitee.getByTestId("form-error")).toContainText("non è valido");
});

test("un invito non può essere usato da un account con un'altra email", async ({
  page,
  browser,
}) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.goto("/app/membri");
  const target = uniqueEmail("destinatario");
  const since = new Date(Date.now() - 1000);
  await page.getByLabel("Email").fill(target);
  await page.getByRole("button", { name: "Invia invito" }).click();
  await expect(page.getByText(`Invito inviato a ${target}.`)).toBeVisible();
  const link = extractLink(await waitForEmail(target, /Invito a/, since), "/invito?token=");

  const intruder = await newPage(browser);
  await signIn(intruder, techEmail);
  await expect(intruder).toHaveURL(/\/app$/);
  await intruder.goto(link);
  await intruder.getByRole("button", { name: "Accetta invito" }).click();
  await expect(intruder.getByTestId("form-error")).toContainText(
    "inviato a un altro indirizzo email",
  );
});

test("cookie manomessi: token alterato (utente o livello MFA) viene rifiutato", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, techEmail);
  await expect(page).toHaveURL(/\/app$/);

  const original = await sessionCookies(context);
  expect(original.length).toBeGreaterThan(0);
  for (const c of original) expect(c.httpOnly).toBe(true);

  // Ricostruisce il valore (anche se diviso in più cookie) e altera il JWT.
  const ordered = [...original].sort((a, b) => a.name.localeCompare(b.name));
  const raw = ordered.map((c) => c.value).join("");
  const json = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString());
  const [h, p, s] = (json.access_token as string).split(".");
  const payload = JSON.parse(Buffer.from(p!, "base64url").toString());

  for (const forged of [
    { ...payload, aal: "aal2" },
    { ...payload, role: "service_role" },
    { ...payload, sub: "00000000-0000-4000-8000-000000000000" },
  ]) {
    const token = `${h}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${s}`;
    const value = `base64-${Buffer.from(JSON.stringify({ ...json, access_token: token })).toString("base64url")}`;
    await context.clearCookies();
    await context.addCookies([
      { ...ordered[0]!, name: ordered[0]!.name.replace(/\.\d+$/, ""), value },
    ]);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/accedi/);
  }
  await context.close();
});

test("cambio azienda: un id di un'altra azienda inviato dal browser viene ignorato", async ({
  browser,
}) => {
  // Seconda azienda con un altro titolare, che invita lo stesso tecnico.
  const ownerB = await newPage(browser);
  const companyB = `E2E Impianti ${Date.now().toString(36)}`;
  await createOwner(ownerB, "titolareb", companyB);
  await ownerB.goto("/app/membri");
  const since = new Date(Date.now() - 1000);
  await ownerB.getByLabel("Email").fill(techEmail);
  await ownerB.getByRole("button", { name: "Invia invito" }).click();
  await expect(ownerB.getByText(`Invito inviato a ${techEmail}.`)).toBeVisible();
  const link = extractLink(
    await waitForEmail(techEmail, /Invito a E2E Impianti/, since),
    "/invito?token=",
  );

  const tech = await newPage(browser);
  await signIn(tech, techEmail);
  await expect(tech).toHaveURL(/\/app$/);
  await tech.goto(link);
  await tech.getByRole("button", { name: "Accetta invito" }).click();
  await expect(tech.getByTestId("company-name")).toHaveText(companyB);

  // Selettore azienda: torna alla prima azienda.
  const optionFor = (page: Page, name: string) =>
    page.getByTestId("company-option").filter({ has: page.getByText(name, { exact: true }) });
  await tech.getByTestId("company-switcher").click();
  const tenantB = await optionFor(tech, companyB).getAttribute("data-tenant-id");
  await optionFor(tech, company).click();
  await expect(tech.getByTestId("company-name")).toHaveText(company);

  // Il titolare A (una sola azienda) prova a selezionare l'azienda B
  // manomettendo la richiesta inviata dal browser: il server verifica
  // l'appartenenza nel database e la ignora.
  const ownerA = await newPage(browser);
  await signIn(ownerA, owner.email);
  await verifyMfa(ownerA, owner.secret);
  await ownerA.getByTestId("company-switcher").click();
  const ownTenant = (await optionFor(ownerA, company).getAttribute("data-tenant-id"))!;
  let tampered = 0;
  await ownerA.route("**/app**", async (route) => {
    const req = route.request();
    const body = req.postData();
    if (req.method() === "POST" && req.headers()["next-action"] && body?.includes(ownTenant)) {
      tampered++;
      await route.continue({ postData: body.replaceAll(ownTenant, tenantB!) });
    } else {
      await route.continue();
    }
  });
  await optionFor(ownerA, company).click();
  await expect.poll(() => tampered).toBeGreaterThan(0);
  await ownerA.waitForLoadState("networkidle");
  await expect(ownerA.getByTestId("company-name")).toHaveText(company);
  await expect(ownerA.getByTestId("active-company")).toHaveText(company);
});

test("esci da tutti i dispositivi: le altre sessioni sono rifiutate subito", async ({
  browser,
}) => {
  const deviceA = await newPage(browser);
  const deviceB = await newPage(browser);
  await signIn(deviceA, techEmail);
  await expect(deviceA).toHaveURL(/\/app/);
  await signIn(deviceB, techEmail);
  await expect(deviceB).toHaveURL(/\/app/);

  await deviceA.goto("/account/sicurezza");
  await deviceA.getByRole("button", { name: "Esci da tutti i dispositivi" }).click();
  await expect(deviceA).toHaveURL(/\/accedi\?motivo=uscito/);

  // Il JWT del dispositivo B non è scaduto, ma la sessione non esiste più.
  await deviceB.goto("/app");
  await expect(deviceB).toHaveURL(/\/accedi/);
});

test("recupero password: link via email, nuova password, vecchia non più valida", async ({
  page,
  browser,
}) => {
  const other = await newPage(browser);
  await signIn(other, techEmail);
  await expect(other).toHaveURL(/\/app/);

  const since = new Date(Date.now() - 1000);
  await page.goto("/password-dimenticata");
  await page.getByLabel("Email").fill(techEmail);
  await page.getByRole("button", { name: "Invia link" }).click();
  await expect(page.getByText("Se l'indirizzo è registrato")).toBeVisible();
  // Stessa risposta per un indirizzo inesistente (niente enumerazione). In un altro
  // browser: il link PKCE vale solo nel browser che ha fatto l'ultima richiesta.
  const probe = await newPage(browser);
  await probe.goto("/password-dimenticata");
  await probe.getByLabel("Email").fill(uniqueEmail("nessuno"));
  await probe.getByRole("button", { name: "Invia link" }).click();
  await expect(probe.getByText("Se l'indirizzo è registrato")).toBeVisible();

  const mail = await waitForEmail(techEmail, /reset/i, since);
  await page.goto(extractLink(mail, "/verify"));
  await expect(page).toHaveURL(/\/reimposta-password$/);
  const newPassword = `${PASSWORD}-nuova`;
  await page.getByLabel("Nuova password").fill(newPassword);
  await page.getByLabel("Ripeti la password").fill(newPassword);
  await page.getByRole("button", { name: "Salva password" }).click();
  await expect(page).toHaveURL(/\/app\?password=aggiornata/);

  // Le altre sessioni sono state chiuse.
  await other.goto("/app");
  await expect(other).toHaveURL(/\/accedi/);

  const fresh = await newPage(browser);
  await signIn(fresh, techEmail, PASSWORD);
  await expect(fresh.getByTestId("form-error")).toHaveText("Email o password non corretti.");
  await signIn(fresh, techEmail, newPassword);
  await expect(fresh).toHaveURL(/\/app$/);
});

test("redirect aperti bloccati e pagine protette senza sessione", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/accedi$/);
  await page.goto("/accedi?next=//evil.invalid/x");
  await expect(page.locator('input[name="next"]')).toHaveValue("/app");
  await page.goto("/accedi?next=https://evil.invalid");
  await expect(page.locator('input[name="next"]')).toHaveValue("/app");
});
