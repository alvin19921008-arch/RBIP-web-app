import { expect, test, type Page } from '@playwright/test'

const appBaseURL = process.env.PW_APP_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

async function ensureAuthenticated(page: Page) {
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

async function waitForScheduleReady(page: Page) {
  await expect(page).toHaveURL(/\/schedule/)
  const loadingScheduleIndicator = page.getByText('Loading schedule…')
  if (await loadingScheduleIndicator.isVisible().catch(() => false)) {
    await expect(loadingScheduleIndicator).toBeHidden({ timeout: 20000 })
  }
  await expect(page.getByRole('button', { name: 'Previous step' })).toBeVisible({ timeout: 20000 })
}

async function openLeaveSimRunTab(page: Page) {
  const leaveSimButton = page.getByRole('button', { name: 'Leave Sim' }).first()
  test.skip((await leaveSimButton.count()) === 0, 'Leave Sim panel is unavailable in current role/environment.')
  await expect(leaveSimButton).toBeVisible()
  await leaveSimButton.click()

  const panelHeading = page.getByRole('heading', { name: 'Developer Leave Simulation (seeded)' }).first()
  await expect(panelHeading).toBeVisible()
  await page.getByRole('button', { name: 'Run steps' }).click()
  await expect(page.getByRole('button', { name: /Run Step 2/i })).toBeVisible()
}

async function runLeaveSimAction(page: Page, actionName: RegExp): Promise<void> {
  await openLeaveSimRunTab(page)
  const actionButton = page.getByRole('button', { name: actionName }).first()
  await expect(actionButton).toBeVisible()
  await expect(actionButton).toBeEnabled()

  await actionButton.click()

  await expect
    .poll(
      async () => !(await page.getByRole('heading', { name: 'Developer Leave Simulation (seeded)' }).first().isVisible().catch(() => false)),
      { timeout: 90000 }
    )
    .toBe(true)

  await waitForScheduleReady(page)
}

test.describe('Schedule Phase 3.4 algorithm smoke', () => {
  test('step 2 -> step 3 auto-run @smoke', async ({ page }) => {
    await ensureAuthenticated(page)

    await page.goto(`${appBaseURL}/schedule`, { waitUntil: 'domcontentloaded' })
    await waitForScheduleReady(page)
    await runLeaveSimAction(page, /^Run Step 2$/i)
    await runLeaveSimAction(page, /^Run Step 3/i)
    await expect(page.getByRole('button', { name: /Floating PCA/i }).first()).toBeVisible()
  })
})

