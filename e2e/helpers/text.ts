import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Asserts exact visible text so activity-log substrings cannot steal the match (PC-448).
 */
export async function expectExactText(
  root: Page | Locator,
  text: string,
  options?: { timeout?: number },
): Promise<void> {
  await expect(root.getByText(text, { exact: true })).toBeVisible({
    timeout: options?.timeout ?? 15_000,
  });
}
