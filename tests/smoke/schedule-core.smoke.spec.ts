import { expect, test, type Page } from '@playwright/test'

const appBaseURL = process.env.PW_APP_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

async function ensureAuthenticated(page: Page) {
  // Preferred path for local refactor smoke runs: dev-only localhost auto-login.
  await page.goto(`${appBaseURL}/api/dev/auto-login`, { waitUntil: 'domcontentloaded' })

  if (page.url().includes('/schedule')) return

  // Fallback for environments where dev auto-login is unavailable.
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

test.describe('Schedule smoke suite', () => {
  test('loads schedule shell and step indicator @smoke', async ({ page }) => {
    await ensureAuthenticated(page)
    await page.goto(`${appBaseURL}/schedule`, { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(/\/schedule/)
    await expect(page.getByRole('button', { name: 'Previous step' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next step' })).toBeVisible()

    await expect(page.getByRole('button', { name: /^Leave & FTE/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Therapist & PCA/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Floating PCA/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Bed Relieving/i })).toBeVisible()
    await expect(page.getByText('Review and finalize schedule')).toBeVisible()
  })

  test('navigates to step 2 and opens legend popover @smoke', async ({ page }) => {
    await ensureAuthenticated(page)
    await page.goto(`${appBaseURL}/schedule`, { waitUntil: 'domcontentloaded' })

    await page.getByRole('button', { name: /^Therapist & PCA/i }).click()
    await expect(page.getByRole('button', { name: /Therapist & PCA.*Current step 2 of 5/i })).toBeVisible()

    await page.getByRole('button', { name: 'Step status legend' }).click()
    await expect(page.getByText('Pending')).toBeVisible()
    await expect(page.getByText('Modified')).toBeVisible()
    await expect(page.getByText('Completed')).toBeVisible()
  })
})

