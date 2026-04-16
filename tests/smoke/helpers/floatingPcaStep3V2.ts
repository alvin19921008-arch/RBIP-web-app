import { expect, type Page } from '@playwright/test'

/**
 * Step 3 opens `FloatingPCAEntryDialog` first (V1 legacy vs V2 ranked).
 * Product direction: **ranked-slot V2** is the primary engine — smoke tests should
 * choose V2 and assert V2-specific chrome (not legacy V1-only copy).
 */
export async function chooseFloatingPcaV2RankedFromEntryDialog(page: Page) {
  const v2Choice = page.getByRole('button', { name: /V2 ranked/i }).first()
  await expect(v2Choice).toBeVisible({ timeout: 20_000 })
  await expect(v2Choice).toBeEnabled()
  await v2Choice.click()
}

/**
 * V1 footer uses "Continue to 3.2" (no "Preferred"). V2 uses `getStepDisplayLabel`:
 * "Continue to 3.2 Preferred", "Continue to 3.3 Adjacent", "Continue to 3.4 Final".
 */
export async function expectFloatingPcaV2ConfigDialogFromStep31(page: Page) {
  await expect(page.getByRole('heading', { name: 'Floating PCA allocation' })).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: /Continue to (3\.2 Preferred|3\.3 Adjacent|3\.4 Final)/,
    })
  ).toBeVisible({ timeout: 30_000 })
}
