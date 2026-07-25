import { expect, test } from "@playwright/test";

test("home page responds and renders a document", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  // A non-empty <title> confirms the app rendered rather than erroring.
  await expect(page).toHaveTitle(/.+/);
});
