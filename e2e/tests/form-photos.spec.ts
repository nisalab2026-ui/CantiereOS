import { expect, test } from "@playwright/test";
import { createOwner } from "./helpers";

/**
 * Campo "Foto" dei moduli (ADR-013) con lo storage reale: dal modello pronto
 * «Rapportino giornaliero» una foto caricata, ridotta nel browser, verificata
 * dal server e visibile nel modulo chiuso; un file finto viene rifiutato.
 */
// PNG 8×8 valido
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4UaGBFTEMLQkAUtVaAV8W4QQAAAAASUVORK5CYII=",
  "base64",
);

test("rapportino giornaliero con foto dal cantiere", async ({ page }) => {
  await createOwner(page, "fot", `E2E Foto ${Date.now().toString(36)}`);
  await page.goto("/app/moduli/modelli");
  await page
    .getByTestId("library-entry")
    .filter({ hasText: "Rapportino giornaliero" })
    .getByRole("button", { name: "Usa questo modello" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Crea la copia" }).click();
  await expect(page).toHaveURL(/\/app\/moduli\/modelli\/[0-9a-f-]{36}\?nuovo=1$/);
  await page.getByRole("button", { name: "Pubblica", exact: true }).click();
  await expect(page.getByTestId("template-version")).toHaveText("Versione 1 in uso");

  await page.goto("/app/moduli");
  await page.getByRole("button", { name: "Compila un modulo" }).click();
  const start = page.getByRole("dialog", { name: "Nuovo modulo" });
  await start.getByLabel("Modello").selectOption({ label: "Rapportino giornaliero" });
  await start.getByLabel("Titolo").fill("Rapportino via Roma");
  await start.getByRole("button", { name: "Inizia la compilazione" }).click();
  await expect(page).toHaveURL(/\/app\/moduli\/[0-9a-f-]{36}\?nuovo=1$/);

  await page.getByLabel("Persone presenti e ore").fill("Mario Rossi 8\nLuca Bianchi 8");
  await page.getByLabel("Lavori eseguiti").fill("Posa massetto piano terra");

  const photos = page.getByTestId("photo-list");
  const input = page.getByTestId("photo-input-foto_lavori");
  await input.setInputFiles({ name: "IMG_0001.png", mimeType: "image/png", buffer: PNG });
  await expect(photos.getByRole("img", { name: "Foto 1 di Foto dei lavori" })).toBeVisible();

  // un file che dice di essere una foto ma non lo è: il server lo rifiuta
  await input.setInputFiles({
    name: "finta.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("questo non è un JPEG"),
  });
  await expect(photos.getByRole("alert")).toContainText("non è una foto");
  await expect(photos.getByRole("img")).toHaveCount(1);

  await page.getByRole("button", { name: "Salva bozza" }).click();
  await expect(page.getByText("Bozza salvata.")).toBeVisible();
  await page.reload();
  await expect(photos.getByRole("img", { name: "Foto 1 di Foto dei lavori" })).toBeVisible();

  // firma del caposquadra e chiusura: la foto resta nel documento
  const pad = page.locator("canvas#f-firma_responsabile");
  await pad.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + 20 + i * 25, box.y + box.height / 2 + (i % 2 ? -12 : 12));
  }
  await page.mouse.up();
  await page.getByRole("button", { name: "Conferma firma" }).first().click();
  await page.getByRole("button", { name: "Chiudi modulo" }).click();
  await page
    .getByRole("dialog", { name: "Chiudere il modulo?" })
    .getByRole("button", { name: "Chiudi modulo" })
    .click();
  await expect(page.getByTestId("form-status")).toHaveText("Chiuso");
  const doc = page.getByTestId("form-document");
  await expect(doc.getByRole("img", { name: "Foto 1 di Foto dei lavori" })).toBeVisible();
  await expect(doc).toContainText("Posa massetto piano terra");
});
