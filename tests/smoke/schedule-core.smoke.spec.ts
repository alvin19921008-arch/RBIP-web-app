import { expect, test, type Page } from '@playwright/test'

async function ensureAuthenticated(page: Page) {
  // Preferred path for local refactor smoke runs: dev-only localhost auto-login.
  await page.goto('/api/dev/auto-login', { waitUntil: 'domcontentloaded' })

  if (page.url().includes('/schedule')) return

  // Fallback for environments where dev auto-login is unavailable.
  const identifier = process.env.PW_LOGIN_IDENTIFIER
  const password = process.env.PW_LOGIN_PASSWORD
  if (!identifier || !password) {
    test.skip(true, 'No auth path available. Use localhost auto-login or PW_LOGIN_IDENTIFIER/PW_LOGIN_PASSWORD.')
    return
  }

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('#identifier').fill(identifier)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL('**/schedule**')
}

test.describe('Schedule smoke suite', () => {
  test('loads schedule shell and step indicator @smoke', async ({ page }) => {
    await ensureAuthenticated(page)
    await page.goto('/schedule', { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(/\/schedule/)
    await expect(page.getByRole('button', { name: 'Previous step' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next step' })).toBeVisible()

    await expect(page.getByText('Leave & FTE')).toBeVisible()
    await expect(page.getByText('Therapist & PCA')).toBeVisible()
    await expect(page.getByText('Floating PCA')).toBeVisible()
    await expect(page.getByText('Bed Relieving')).toBeVisible()
    await expect(page.getByText('Review')).toBeVisible()
  })

  test('navigates to step 2 and opens legend popover @smoke', async ({ page }) => {
    await ensureAuthenticated(page)
    await page.goto('/schedule', { waitUntil: 'domcontentloaded' })

    await page.getByRole('button', { name: 'Next step' }).click()
    await expect(page.getByText('Step 2/5')).toBeVisible()

    await page.getByRole('button', { name: 'Step status legend' }).click()
    await expect(page.getByText('Pending')).toBeVisible()
    await expect(page.getByText('Modified')).toBeVisible()
    await expect(page.getByText('Completed')).toBeVisible()
    await expect(page.getByText('Current')).toBeVisible()
  })
})

