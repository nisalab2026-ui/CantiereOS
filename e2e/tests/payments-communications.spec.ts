import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createOwner, signIn, verifyMfa } from "./helpers";

/**
 * Pagamenti attesi e registro comunicazioni (ADR-012), contro lo stack reale:
 * incasso dalla scheda del cliente con validazione, saldo con storico,
 * filtri, CSV, calendario e ricerca; comunicazione con richiamo.
 */
test.describe.configure({ mode: "serial" });

const company = `E2E Pagamenti ${Date.now().toString(36)}`;
let owner: { email: string; secret: string };
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const due = inDays(3);
const followUp = inDays(2);

test("incasso dalla scheda cliente, saldo e comunicazione con richiamo", async ({ page }) => {
  owner = await createOwner(page, "pag", company);
  await page.getByRole("link", { name: "Clienti", exact: true }).click();
  await page.getByRole("button", { name: "Nuovo cliente" }).click();
  const newCustomer = page.getByRole("dialog", { name: "Nuovo cliente" });
  await newCustomer.getByLabel("Nome o ragione sociale").fill("Condominio Aurora");
  await newCustomer.getByRole("button", { name: "Crea cliente" }).click();
  await expect(newCustomer).toHaveCount(0);
  await page.getByTestId("data-table").getByRole("link", { name: "Condominio Aurora" }).click();
  await expect(page.getByTestId("customer-title")).toHaveText("Condominio Aurora");
  const customerUrl = page.url();

  await page.getByRole("button", { name: "Nuovo incasso" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuovo pagamento atteso" });
  await expect(dialog.getByText("Condominio Aurora")).toBeVisible(); // controparte già decisa
  await dialog.getByLabel("Descrizione").fill("SAL 1 facciata");
  await dialog.getByLabel("Importo (€)").fill("abc");
  await dialog.getByLabel("Data prevista").fill(due);
  await dialog.getByRole("button", { name: "Registra pagamento" }).click();
  await expect(dialog.locator("#p-amount-error")).toBeVisible();
  await dialog.getByLabel("Importo (€)").fill("1.250,50");
  await dialog.getByLabel("Riferimento").fill("FT-77");
  await dialog.getByRole("button", { name: "Registra pagamento" }).click();

  await expect(page).toHaveURL(/\/app\/pagamenti\/[0-9a-f-]{36}\?creato=1$/);
  await expect(page.getByTestId("payment-title")).toHaveText("SAL 1 facciata");
  await expect(page.getByTestId("payment-state")).toHaveText("Aperto");
  await expect(page.getByText("1.250,50 €").first()).toBeVisible();

  await page.getByRole("button", { name: "Registra incasso" }).click();
  const paid = page.getByRole("dialog", { name: "Registra incasso?" });
  await paid.getByLabel("Importo (€)").fill("1.200,00");
  await paid.getByRole("button", { name: "Conferma" }).click();
  await expect(paid).toHaveCount(0);
  await expect(page.getByTestId("payment-state")).toHaveText("Pagato");
  await expect(page.getByText("differenza")).toContainText("50,50 €");
  await expect(page.getByTestId("timeline")).toContainText("ha registrato il saldo di");

  // Comunicazione dalla scheda del cliente, con richiamo.
  await page.goto(customerUrl);
  await page.getByRole("button", { name: "Registra", exact: true }).click();
  const comm = page.getByRole("dialog", { name: "Registra comunicazione" });
  await comm.getByLabel("Canale").selectOption("phone");
  await comm.getByLabel("Direzione").selectOption("inbound");
  await comm.getByLabel("Oggetto").fill("Richiesta preventivo balconi");
  await comm.getByLabel("Referente").fill("Sig. Rossi");
  await comm.getByLabel("Da richiamare il").fill(followUp);
  await comm.getByRole("button", { name: "Registra" }).click();

  // Dalla scheda si resta sulla scheda: la comunicazione compare subito nell'elenco.
  await expect(comm).toHaveCount(0);
  const mini = page.getByTestId("communication-mini-list");
  await expect(mini).toContainText("Richiesta preventivo balconi");
  await mini.getByRole("link", { name: "Richiesta preventivo balconi" }).click();
  await expect(page.getByTestId("communication-title")).toHaveText("Richiesta preventivo balconi");
  await expect(page.getByTestId("follow-up")).toBeVisible();
  await page.getByRole("button", { name: "Richiamo fatto" }).click();
  await expect(page.getByText("Richiamo fatto").first()).toBeVisible();
  await expect(page.getByTestId("follow-up")).toHaveCount(0);
});

test("elenco con filtri, CSV, calendario e ricerca globale", async ({ page }) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await expect(page.getByTestId("payments-overview")).toBeVisible();

  await page.getByRole("link", { name: "Pagamenti", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/pagamenti$/);
  await expect(page.getByTestId("data-table")).not.toContainText("SAL 1 facciata");
  await page.getByLabel("Stato").selectOption("paid");
  await expect(page).toHaveURL(/state=paid/);
  await expect(page.getByTestId("payment-link")).toHaveText(["SAL 1 facciata"]);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^pagamenti-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("SAL 1 facciata");
  expect(csv).toContain("1250,50");

  await page.goto(`/app/calendario?mese=${followUp.slice(0, 7)}`);
  const item = page.getByTestId("calendar-grid").getByTestId("calendar-item");
  await expect(item.filter({ hasText: "Richiesta preventivo balconi" })).toContainText("(fatto)");
  await page.goto(`/app/calendario?mese=${due.slice(0, 7)}`);
  await expect(item.filter({ hasText: "SAL 1 facciata" })).toContainText("(saldato)");
  await item.filter({ hasText: "SAL 1 facciata" }).click();
  await expect(page.getByTestId("payment-title")).toHaveText("SAL 1 facciata");

  await page.goto("/app/comunicazioni");
  await expect(page.getByTestId("communication-link")).toHaveText(["Richiesta preventivo balconi"]);

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Cerca clienti/).fill("facciata");
  await page.getByTestId("search-result").first().click();
  await expect(page.getByTestId("payment-title")).toHaveText("SAL 1 facciata");
});
