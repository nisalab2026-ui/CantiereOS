import { expect, test } from "@playwright/test";
import { createOwner } from "./helpers";

/** Editor dei modelli: componenti, duplicazione, annulla/ripristina, Ctrl S, foglio A4. */
test("l'editor aggiunge, duplica, annulla e salva con Ctrl S", async ({ page }) => {
  await createOwner(page, "edt", `E2E Editor ${Date.now().toString(36)}`);
  await page.goto("/app/moduli/modelli");
  await page
    .getByTestId("library-entry")
    .filter({ hasText: "Ispezione linea vita" })
    .getByRole("button", { name: "Usa questo modello" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Crea la copia" }).click();
  await expect(page).toHaveURL(/\/app\/moduli\/modelli\/[0-9a-f-]{36}\?nuovo=1$/);

  const fields = page.getByTestId("field-editor");
  const before = await fields.count();
  await page.getByTestId("palette-item").filter({ hasText: "Data" }).first().click();
  await expect(fields).toHaveCount(before + 1);
  await expect(page.getByLabel("Etichetta").last()).toHaveValue("Nuovo campo");

  await fields.last().getByRole("button", { name: "Duplica campo" }).click();
  await expect(fields).toHaveCount(before + 2);

  await page.getByRole("button", { name: "Annulla (Ctrl Z)" }).click();
  await page.getByRole("button", { name: "Annulla (Ctrl Z)" }).click();
  await expect(fields).toHaveCount(before);
  await page.getByRole("button", { name: "Ripristina (Ctrl Maiusc Z)" }).click();
  await expect(fields).toHaveCount(before + 1);

  // il foglio A4 disegna le tabelle di controllo vuote come sul cartaceo
  await expect(
    page.getByText("Elaborato grafico rappresentativo del sistema").last(),
  ).toBeVisible();

  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("Control+s");
  await expect(page.getByText("Bozza salvata.")).toBeVisible();
  await page.reload();
  await expect(fields).toHaveCount(before + 1);
});

/** Aspetto del documento: logo, colore, caratteri e codice finiscono nel foglio e restano salvati. */
test("l'editor cambia logo, colore, caratteri e intestazione del documento", async ({ page }) => {
  await createOwner(page, "asp", `E2E Aspetto ${Date.now().toString(36)}`);
  await page.goto("/app/moduli/modelli");
  await page
    .getByTestId("library-entry")
    .filter({ hasText: "Rapportino giornaliero" })
    .getByRole("button", { name: "Usa questo modello" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Crea la copia" }).click();
  await expect(page).toHaveURL(/\/app\/moduli\/modelli\/[0-9a-f-]{36}\?nuovo=1$/);

  await page.getByRole("tab", { name: "Aspetto" }).click();
  const panel = page.getByTestId("appearance-panel");
  await panel.getByTestId("logo-input").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4UaGBFTEMLQkAUtVaAV8W4QQAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(panel.getByRole("img", { name: "Logo attuale" })).toBeVisible();
  await panel.getByRole("radio", { name: "Verde petrolio" }).click();
  await panel
    .getByRole("radiogroup", { name: "Carattere: Testo" })
    .getByRole("radio", { name: /Classico/ })
    .click();
  await panel
    .getByRole("radiogroup", { name: "Intestazioni" })
    .getByRole("radio", { name: "Fascia colorata" })
    .click();
  await panel.getByLabel("Codice del modulo").fill("MOD-07");
  await panel.getByLabel("Piè di pagina").fill("Impresa di prova · P. IVA 00000000000");

  const doc = page.getByTestId("form-document");
  await expect(doc.getByTestId("doc-logo")).toBeVisible();
  await expect(doc.getByTestId("doc-header")).toContainText("MOD-07");
  await expect(doc.getByTestId("doc-footer")).toContainText("P. IVA");
  await expect(doc).toHaveCSS("font-family", /Source Serif 4/);

  await page.getByRole("button", { name: "Salva bozza" }).click();
  await expect(page.getByText("Bozza salvata.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("form-document").getByTestId("doc-logo")).toBeVisible();
  await expect(page.getByTestId("form-document").getByTestId("doc-header")).toContainText("MOD-07");
});
