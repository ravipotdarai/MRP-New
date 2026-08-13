import { test, expect } from "@playwright/test";

test.describe("Digital Safety web parity", () => {
  test("route exists behind console auth/vault", async ({ page }) => {
    await page.goto("/digital-safety");
    await expect(
      page.getByText(/Digital Safety|Unlock device data|Sign in|PIN/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
