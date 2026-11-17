import { expect, test } from "@playwright/test";

/**
 * Sito pubblico: aperto senza accesso, separato dal gestionale, con prezzi coerenti e la guida.
 * Non serve un account: questi test girano anche senza Supabase configurato.
 */
test("la home pubblica si apre senza accesso e porta alle pagine del sito", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Il cantiere in ordine");
  await expect(page.getByRole("link", { name: /Prova gratis 30 giorni/ })).toHaveAttribute(
    "href",
    "/registrati",
  );
  await expect(page.getByRole("link", { name: "Accedi" }).first()).toHaveAttribute(
    "href",
    "/accedi",
  );

  const nav = page.getByRole("navigation", { name: "Principale" });
  for (const [label, path, heading] of [
    ["Funzionalità", "/funzionalita", "Tutto quello che serve"],
    ["Chi siamo", "/chi-siamo", "Software serio"],
    ["Prezzi", "/prezzi", "Paghi per l'impresa"],
    ["Guida", "/guida", "Come si usa"],
  ] as const) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
  }
  // nessun errore di script (CSP con nonce compresa)
  expect(errors).toEqual([]);
});

test("i prezzi cambiano tra annuale e mensile e il calcolo indica il piano giusto", async ({
  page,
}) => {
  await page.goto("/prezzi");
  const impresa = page.locator("article", { hasText: "Il più scelto" });
  await expect(impresa).toContainText("89 €");
  await page.getByRole("radio", { name: "Mensile" }).click();
  await expect(impresa).toContainText("109 €");

  const users = page.getByLabel("Quante persone useranno CantiereOS?");
  await users.fill("4");
  await expect(page.getByText(/Per 4 utenti il piano giusto è Base/)).toBeVisible();
  await users.fill("12");
  await expect(page.getByText(/Per 12 utenti il piano giusto è Impresa/)).toBeVisible();
  await users.fill("120");
  await expect(page.getByText(/Oltre 80 utenti prepariamo/)).toBeVisible();
});

test("la guida pubblica cerca senza accedere e non rimanda a pagine riservate", async ({
  page,
}) => {
  await page.goto("/guida");
  await page.getByLabel("Cerca nella guida").fill("scadenza");
  await expect(page.getByTestId("guide-topic").first()).toBeVisible();
  await expect(page.locator('main a[href^="/app"]')).toHaveCount(0);
});

test("il menu del telefono si apre e si chiude", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Apri il menu" }).click();
  const menu = page.getByRole("navigation", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Prezzi" }).click();
  await expect(page).toHaveURL(/\/prezzi$/);
  await expect(menu).toBeHidden();
  await ctx.close();
});
