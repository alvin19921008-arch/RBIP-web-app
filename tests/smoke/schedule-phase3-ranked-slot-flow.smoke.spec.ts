import { expect, test } from '@playwright/test'

const appBaseURL = process.env.PW_APP_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

async function ensureAuthenticated(page: Parameters<typeof test>[0]['page']) {
  await page.goto(`${appBaseURL}/api/dev/auto-login`, { waitUntil: 'domcontentloaded' })
  if (page.url().includes('/schedule')) return

  const identifier = process.env.PW_LOGIN_IDENTIFIER
  const password = process.env.PW_LOGIN_PASSWORD
  if (!identifier || !password) {
    test.skip(true, 'No auth path available. Use localhost auto-login or PW_LOGIN_IDENTIFIER/PW_LOGIN_PASSWORD.')
    return
  }

  await page.goto(`${appBaseURL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#identifier').fill(identifier)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL('**/schedule**')
}

test('@smoke ranked-slot Step 3 flow', async ({ page }) => {
  await ensureAuthenticated(page)
  await page.goto(`${appBaseURL}/schedule`, { waitUntil: 'domcontentloaded' })

  const floatingStepBtn = page.getByRole('button', { name: /Floating PCA/i }).first()
  await expect(floatingStepBtn).toBeVisible()
  test.skip(!(await floatingStepBtn.isEnabled()), 'Step 3 is disabled in current schedule state.')
  await floatingStepBtn.click()

  await expect(page.getByRole('button', { name: /Floating PCA.*Current step 3 of 5/i })).toBeVisible({ timeout: 20000 })

  const openDialogBtn = page.getByRole('button', { name: /Floating PCA allocation/i }).first()
  const hasDialogButton = (await openDialogBtn.count()) > 0
  test.skip(!hasDialogButton, 'Floating PCA dialog entry is unavailable in current dataset.')
  await openDialogBtn.click()

  await expect(page.getByText(/Scarcity detected|No obvious risk detected/i).first()).toBeVisible({ timeout: 20000 })

  const continueBtn = page.getByRole('button', { name: /Continue to 3\.2|Continue to 3\.3|Continue to 3\.4 review|Continue/i }).first()
  await expect(continueBtn).toBeVisible()
  await continueBtn.click()

  await expect(page.getByText(/need(s)? attention|Auto-continue|Step 3\.4 Review|Final review before save/i).first()).toBeVisible({ timeout: 20000 })
})
