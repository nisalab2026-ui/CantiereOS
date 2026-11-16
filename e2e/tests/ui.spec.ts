import { expect, test } from "@playwright/test";
import { createOwner, signIn, uniqueEmail, verifyMfa } from "./helpers";

/**
 * Interfaccia: anagrafiche, ricerca globale, tema, menu, conferme.
 * Tutto contro lo stack reale (Supabase Auth + PostgreSQL con RLS).
 */
test.describe.configure({ mode: "serial" });

const company = `E2E Interfaccia ${Date.now().toString(36)}`;
let owner: { email: string; secret: string };

test("titolare: crea un cliente dalla finestra «Nuovo cliente» con validazione", async ({
  page,
}) => {
  owner = await createOwner(page, "ui", company);
  await page.getByRole("link", { name: "Clienti", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/clienti$/);
  await expect(page.getByTestId("empty-state")).toContainText("Ancora nessun cliente");

  await page.getByRole("button", { name: "Nuovo cliente" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuovo cliente" });
  await dialog.getByLabel("Email").fill("non-una-email");
  await dialog.getByRole("button", { name: "Crea cliente" }).click();
  await expect(dialog.getByText("Inserisci il nome")).toBeVisible();
  await expect(dialog.getByText("Email non valida")).toBeVisible();

  await dialog.getByLabel("Nome o ragione sociale").fill("Bianchi Costruzioni Srl");
  await dialog.getByLabel("Email").fill("");
  await dialog.getByLabel("Partita IVA").fill("it01234567890");
  await dialog.getByLabel("Città").fill("Bergamo");
  await dialog.getByLabel("Prov.").fill("bg");
  await dialog.getByRole("button", { name: "Crea cliente" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/clienti\?id=[0-9a-f-]{36}&creato=1$/);
  const table = page.getByTestId("data-table");
  await expect(table).toContainText("Bianchi Costruzioni Srl");
  await expect(table).toContainText("IT01234567890");
  await expect(table).toContainText("Bergamo (BG)");

  // Partita IVA duplicata: errore sul campo, nessun secondo cliente.
  await page.getByRole("button", { name: "Nuovo cliente" }).click();
  await dialog.getByLabel("Nome o ragione sociale").fill("Doppione");
  await dialog.getByLabel("Partita IVA").fill("IT01234567890");
  await dialog.getByRole("button", { name: "Crea cliente" }).click();
  await expect(dialog.getByText("Esiste già un cliente con questa partita IVA")).toBeVisible();
  await page.keyboard.press("Escape");

  // Ricerca e filtri finiscono nell'URL.
  await page.goto("/app/clienti?q=bianchi");
  await expect(page.getByTestId("table-total")).toContainText("1 risultato");
  await page.goto("/app/clienti?q=inesistente");
  await expect(page.getByTestId("empty-state")).toContainText("Nessun cliente trovato");
});

test("ricerca globale con Ctrl K porta al cliente", async ({ page }) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Cerca clienti/).fill("bianchi");
  const result = page.getByTestId("search-result").filter({ hasText: "Bianchi Costruzioni Srl" });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/\/app\/clienti\?id=[0-9a-f-]{36}$/);
  await expect(page.getByTestId("data-table")).toContainText("Bianchi Costruzioni Srl");
});

test("tema scuro e menu compresso restano dopo il ricaricamento", async ({ page }) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitemradio", { name: "Scuro" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.getByRole("button", { name: "Comprimi menu" }).click();
  await expect(page.getByRole("button", { name: "Espandi menu" })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("button", { name: "Espandi menu" })).toBeVisible();

  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitemradio", { name: "Chiaro" }).click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  await page.getByRole("button", { name: "Espandi menu" }).click();
});

test("revoca di un invito con finestra di conferma", async ({ page }) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.goto("/app/membri");
  const email = uniqueEmail("darevocare");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Invia invito" }).click();
  await expect(page.getByText(`Invito inviato a ${email}.`)).toBeVisible();
  await page.reload();
  const pending = page.getByTestId("pending-invitations");
  await expect(pending).toContainText(email);

  await pending.getByRole("button", { name: "Revoca", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Revocare l'invito?" });
  await expect(confirm).toContainText(email);
  await confirm.getByRole("button", { name: "Annulla" }).click();
  await expect(pending).toContainText(email);

  await pending.getByRole("button", { name: "Revoca", exact: true }).click();
  await confirm.getByRole("button", { name: "Revoca invito" }).click();
  await expect(page.getByTestId("pending-invitations")).toHaveCount(0);
  await expect(page.getByText("Nessun invito in attesa")).toBeVisible();
});

test("mobile: il menu laterale si apre dal pulsante e mostra le voci permesse", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.getByRole("button", { name: "Apri menu" }).click();
  const nav = page.getByRole("dialog");
  await expect(nav.getByRole("link", { name: "Clienti", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Clienti", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/clienti$/);
  await context.close();
});
