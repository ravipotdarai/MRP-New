import { test, expect } from "@playwright/test";

test.describe("Emergency monitoring desk", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in|login|pathsync|mrp/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("emergency monitoring route exists", async ({ page }) => {
    await page.goto("/emergency-monitoring");
    // Vault gate or desk title
    await expect(
      page.getByText(/Emergency monitoring|Unlock device data|PIN/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
