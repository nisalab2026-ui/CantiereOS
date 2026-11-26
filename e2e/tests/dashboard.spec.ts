import { expect, test } from "@playwright/test";
import { createOwner } from "./helpers";

/**
 * Panoramica "centro di controllo" (ADR-018): indicatori con dati reali,
 * filtro di periodo e disposizione personale salvata nel database.
 */
test("panoramica: periodo, personalizzazione salvata e ripristino", async ({ page }) => {
  await createOwner(page, "dash", `E2E Panoramica ${Date.now().toString(36)}`);

  // Azienda nuova: indicatori a zero, nessun dato inventato.
  const kpis = page.getByTestId("kpi-strip");
  await expect(kpis).toBeVisible();
  await expect(kpis.getByTestId("kpi-collected").getByTestId("stat-value")).toHaveText(/^0,00\s€$/);
  await expect(kpis.getByTestId("kpi-customers").getByTestId("stat-value")).toHaveText("0");
  await expect(page.getByTestId("cash-trend")).toContainText("Nessun incasso registrato");

  // Filtro di periodo: link condivisibile, voce attiva evidenziata.
  const period = page.getByTestId("period-switch");
  await period.getByRole("link", { name: "Trimestre" }).click();
  await expect(page).toHaveURL(/\/app\?periodo=quarter$/);
  await expect(period.getByRole("link", { name: "Trimestre" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(kpis.getByTestId("kpi-collected")).toContainText("Incassato · trimestre");
  await period.getByRole("link", { name: "Questo mese" }).click();
  await expect(page).toHaveURL(/\/app$/);

  // Personalizza: nascondo «Le tue attività» e porto «Da chiudere» in cima.
  await expect(page.getByTestId("my-tasks")).toBeVisible();
  await page.getByTestId("customize-dashboard").click();
  const dialog = page.getByRole("dialog", { name: "Personalizza la panoramica" });
  await dialog.getByRole("button", { name: "Nascondi: Le tue attività" }).click();
  for (let i = 0; i < 8; i++) {
    const up = dialog.getByRole("button", { name: "Sposta su: Da chiudere" });
    if (await up.isDisabled()) break;
    await up.click();
  }
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByTestId("toast")).toContainText("Panoramica aggiornata.");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("my-tasks")).toHaveCount(0);
  await expect(page.locator("[data-widget]").first()).toHaveAttribute("data-widget", "queues");

  // La scelta è nel database: resta dopo il ricaricamento.
  await page.reload();
  await expect(page.getByTestId("my-tasks")).toHaveCount(0);
  await expect(page.locator("[data-widget]").first()).toHaveAttribute("data-widget", "queues");

  // Ripristina: torna la disposizione iniziale.
  await page.getByTestId("customize-dashboard").click();
  await dialog.getByRole("button", { name: "Ripristina" }).click();
  await expect(page.getByTestId("my-tasks")).toBeVisible();
  await expect(page.locator("[data-widget]").first()).toHaveAttribute("data-widget", "kpis");
});
