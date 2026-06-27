import { type Page, expect } from "@playwright/test";

/**
 * Asserts the app toast snackbar shows an expected message (PC-56).
 * Scoped to `.MuiSnackbar-root` to avoid matching unrelated page alerts.
 */
export async function expectToast(
  page: Page,
  message: string | RegExp,
  options?: { timeout?: number },
): Promise<void> {
  const toast = page.locator(".MuiSnackbar-root").getByRole("alert");
  await expect(toast.filter({ hasText: message })).toBeVisible({
    timeout: options?.timeout ?? 15_000,
  });
}
