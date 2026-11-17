import { expect, test } from "@playwright/test";
import { createOwner } from "./helpers";

/**
 * Commesse e cantieri (ADR-014): creazione con importi e primo cantiere,
 * codice automatico, secondo cantiere con indirizzo proprio, cambio di stato,
 * margine previsto e rapportino collegato che entra nel riepilogo.
 */
test("commessa con cantieri, importi, stato e rapportino collegato", async ({ page }) => {
  await createOwner(page, "com", `E2E Commesse ${Date.now().toString(36)}`);

  await page.getByRole("link", { name: "Clienti", exact: true }).click();
  await page.getByRole("button", { name: "Nuovo cliente" }).click();
  const newCustomer = page.getByRole("dialog", { name: "Nuovo cliente" });
  await newCustomer.getByLabel("Nome o ragione sociale").fill("Condominio Aurora");
  await newCustomer.getByRole("button", { name: "Crea cliente" }).click();
  await expect(newCustomer).toHaveCount(0);

  await page.getByRole("link", { name: "Commesse", exact: true }).click();
  await expect(page.getByText("Nessuna commessa aperta")).toBeVisible();
  await page.getByRole("button", { name: "Nuova commessa" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuova commessa" });
  await dlg.getByLabel("Nome della commessa").fill("Rifacimento facciate");
  await dlg.getByLabel("Cliente").selectOption({ label: "Condominio Aurora" });
  await dlg.getByLabel("Tipo").selectOption({ label: "A corpo" });
  await dlg.getByLabel("Importo del contratto (€)").fill("48.500,00");
  await dlg.getByLabel("Costo previsto (€)").fill("36.000");
  await dlg.getByLabel("Aggiungi subito il primo cantiere").check();
  await dlg.getByLabel("Nome del cantiere").fill("Facciata nord");
  // validazione: indirizzo mancante
  await dlg.getByRole("button", { name: "Crea commessa" }).click();
  await expect(
    dlg.getByText("Scegli una sede del cliente oppure scrivi indirizzo e città"),
  ).toBeVisible();
  await dlg.getByLabel("Indirizzo").fill("Via Verdi 3");
  await dlg.getByLabel("Città").fill("Milano");
  await dlg.getByRole("button", { name: "Crea commessa" }).click();

  await expect(page).toHaveURL(/\/app\/commesse\/[0-9a-f-]{36}\?creata=1$/);
  const year = new Date().getFullYear();
  await expect(page.getByTestId("project-code")).toHaveText(`${year}-001`);
  await expect(page.getByTestId("project-status")).toHaveText("In corso");
  const money = page.getByTestId("project-money");
  await expect(money).toContainText("48.500,00");
  await expect(money).toContainText("12.500,00");
  await expect(money).toContainText("25,8% del contratto");
  await expect(page.getByTestId("site-row")).toHaveCount(1);
  await expect(page.getByTestId("site-row")).toContainText("Via Verdi 3, Milano");

  // secondo cantiere
  await page.getByRole("button", { name: "Aggiungi cantiere" }).click();
  const site = page.getByRole("dialog", { name: "Nuovo cantiere" });
  await site.getByLabel("Nome del cantiere").fill("Facciata sud");
  await site.getByLabel("Indirizzo").fill("Via Verdi 5");
  await site.getByLabel("CAP").fill("20121");
  await site.getByLabel("Città").fill("Milano");
  await site.getByLabel("Sicurezza").fill("Linea elettrica a 4 m dal ponteggio");
  await site.getByRole("button", { name: "Aggiungi cantiere" }).click();
  await expect(site).toHaveCount(0);
  await expect(page.getByTestId("site-row")).toHaveCount(2);
  await expect(page.getByTestId("site-list")).toContainText("Linea elettrica a 4 m");

  // importi: il costo sale, il margine diventa negativo
  await page.getByRole("button", { name: "Modifica importi" }).click();
  const fin = page.getByRole("dialog", { name: "Importi della commessa" });
  await fin.getByLabel("Costo previsto (€)").fill("50.000,00");
  await fin.getByRole("button", { name: "Salva importi" }).click();
  await expect(fin).toHaveCount(0);
  await expect(money).toContainText("-1.500,00");

  // rapportino collegato dalla scheda della commessa
  await page.goto("/app/moduli/modelli");
  await page
    .getByTestId("library-entry")
    .filter({ hasText: "Rapportino giornaliero" })
    .getByRole("button", { name: "Usa questo modello" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Crea la copia" }).click();
  await page.getByRole("button", { name: "Pubblica", exact: true }).click();
  await expect(page.getByTestId("template-version")).toHaveText("Versione 1 in uso");
  await page.goBack();
  await page.goto("/app/commesse");
  await page.getByTestId("project-link").filter({ hasText: "Rifacimento facciate" }).click();
  await page.getByRole("button", { name: "Compila" }).click();
  const start = page.getByRole("dialog", { name: "Nuovo modulo" });
  await expect(start.getByLabel("Commessa")).toHaveValue(/[0-9a-f-]{36}/);
  await start.getByLabel("Titolo").fill("Rapportino facciata nord");
  await start.getByRole("button", { name: "Inizia la compilazione" }).click();
  await expect(page).toHaveURL(/\/app\/moduli\/[0-9a-f-]{36}\?nuovo=1$/);
  await expect(page.getByTestId("form-project")).toHaveText(`Commessa ${year}-001`);
  await page.getByTestId("form-project").click();
  await expect(page.getByTestId("form-mini-list")).toContainText("Rapportino facciata nord");
  await expect(page.getByTestId("project-summary")).toContainText("1Moduli in bozza");

  // stato: conclusa → sparisce dalle aperte, resta in «Concluse e annullate»
  await page.getByRole("button", { name: /^Stato: In corso/ }).click();
  await page.getByRole("menuitemradio", { name: "Conclusa" }).click();
  await expect(page.getByTestId("project-status")).toHaveText("Conclusa");
  await expect(page.getByText("Chiusa", { exact: true })).toBeVisible();
  await page.goto("/app/commesse");
  await expect(page.getByTestId("project-link")).toHaveCount(0);
  await page.goto("/app/commesse?status=closed");
  await expect(page.getByTestId("project-link")).toHaveCount(1);

  // cronologia con i valori degli importi
  await page.getByTestId("project-link").click();
  const change = page
    .getByRole("listitem")
    .filter({ hasText: "modificato Importi della commessa" });
  await expect(change).toContainText("36.000,00");
  await expect(change).toContainText("50.000,00");
});
