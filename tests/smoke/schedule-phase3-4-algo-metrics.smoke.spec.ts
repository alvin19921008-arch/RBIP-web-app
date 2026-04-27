import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  chooseFloatingPcaV2RankedFromEntryDialog,
  expectFloatingPcaV2ConfigDialogFromStep31,
} from './helpers/floatingPcaStep3V2'

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

function mainStepIndicator(page: Page) {
  return page.locator('[data-tour="step-indicator"]').first()
}

async function openLeaveSimRunTab(page: Page) {
  const leaveSimButton = page.getByRole('button', { name: 'Leave Sim' }).first()
  test.skip((await leaveSimButton.count()) === 0, 'Leave Sim panel is unavailable in current role/environment.')
  await expect(leaveSimButton).toBeVisible()
  await leaveSimButton.click()

  const panelHeading = page.getByRole('heading', { name: 'Developer Leave Simulation (seeded)' }).first()
  await expect(panelHeading).toBeVisible()
  await page.getByRole('button', { name: 'Run steps' }).click()
  await expect(page.getByRole('button', { name: /^Run Step 2/i })).toBeVisible()
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

async function dismissNotificationToasts(page: Page) {
  const dismissButtons = page.locator('button[aria-label="Dismiss notification"]')

  for (let pass = 0; pass < 3; pass += 1) {
    const count = await dismissButtons.count()
    if (count === 0) return

    for (let index = 0; index < count; index += 1) {
      const dismissButton = dismissButtons.nth(index)
      if (!(await dismissButton.isVisible().catch(() => false))) continue
      await dismissButton.click({ timeout: 1000, force: true }).catch(() => undefined)
    }

    if ((await dismissButtons.count()) === 0) return
    await page.waitForTimeout(100)
  }

  await expect
    .poll(async () => dismissButtons.count(), { timeout: 2000 })
    .toBe(0)
    .catch(() => undefined)
}

function isPointerInterceptError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /intercepts pointer events|not receiving pointer events/i.test(error.message)
}

async function clickWithOverlayRetry(page: Page, target: Locator) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await dismissNotificationToasts(page)
    try {
      await target.click({ timeout: 5000 })
      return
    } catch (error) {
      if (attempt === 3 || !isPointerInterceptError(error)) throw error
      await page.waitForTimeout(150)
    }
  }
}

async function saveScheduleChanges(page: Page) {
  const saveScheduleButton = page.getByRole('button', { name: 'Save Schedule' }).first()
  await expect(saveScheduleButton).toBeVisible()
  await clickWithOverlayRetry(page, saveScheduleButton)

  await expect
    .poll(
      async () => {
        const savedButton = page.getByRole('button', { name: 'Saved' }).first()
        return (await savedButton.isVisible().catch(() => false)) ? 'saved' : 'pending'
      },
      { timeout: 15000 }
    )
    .toBe('saved')
}

async function openFloatingPcaAllocationDialog(page: Page) {
  const floatingStepButton = mainStepIndicator(page).getByRole('button', { name: /Floating PCA/i }).first()
  const startStep3Button = page
    .getByRole('button', { name: /^(Re-run Algorithm|Initialize Algorithm)$/ })
    .first()
  const dialogHeading = page.getByRole('heading', { name: 'Floating PCA allocation' })

  await expect(floatingStepButton).toBeVisible()
  await expect(floatingStepButton).toBeEnabled({ timeout: 30000 })

  await expect
    .poll(
      async () => {
        await dismissNotificationToasts(page)
        if (await dialogHeading.isVisible().catch(() => false)) return 'open'

        try {
          await clickWithOverlayRetry(page, floatingStepButton)
        } catch (error) {
          if (
            isPointerInterceptError(error) &&
            (await dialogHeading.isVisible().catch(() => false))
          ) {
            return 'open'
          }
          throw error
        }

        if (await dialogHeading.isVisible().catch(() => false)) return 'open'

        if (!(await startStep3Button.isVisible().catch(() => false))) {
          return 'warming-up'
        }

        await clickWithOverlayRetry(page, startStep3Button)
        try {
          await expect(dialogHeading).toBeVisible({ timeout: 5000 })
          return 'open'
        } catch {
          return 'retry'
        }
      },
      { timeout: 30000 }
    )
    .toBe('open')
}

test.describe('Schedule Phase 3.4 algorithm smoke', () => {
  test('step 2 -> step 3 auto-run @smoke', async ({ page }) => {
    await ensureAuthenticated(page)

    await page.goto(`${appBaseURL}/schedule`, { waitUntil: 'domcontentloaded' })
    await waitForScheduleReady(page)
    await runLeaveSimAction(page, /^Run Step 2/i)
    await runLeaveSimAction(page, /^Run Step 3/i)
    await expect(mainStepIndicator(page).getByRole('button', { name: /Floating PCA/i }).first()).toBeVisible()
  })

  test('saved step 3 can re-open after reload without forcing step 2 rerun @smoke', async ({ page }) => {
    await ensureAuthenticated(page)

    await page.goto(`${appBaseURL}/schedule`, { waitUntil: 'domcontentloaded' })
    await waitForScheduleReady(page)
    await runLeaveSimAction(page, /^Run Step 2/i)
    await runLeaveSimAction(page, /^Run Step 3/i)
    await saveScheduleChanges(page)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForScheduleReady(page)
    await openFloatingPcaAllocationDialog(page)
    await chooseFloatingPcaV2RankedFromEntryDialog(page)
    await expectFloatingPcaV2ConfigDialogFromStep31(page)
    await expect(page.getByText('Step 2 must be completed before Step 3.')).toHaveCount(0)

    // Dismiss Step 3 config surface (footer may show Close or Back depending on step history).
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Floating PCA allocation' })).toBeHidden({ timeout: 20_000 })
  })
})

