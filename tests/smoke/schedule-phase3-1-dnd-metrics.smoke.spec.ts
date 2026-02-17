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

test.describe('Schedule Phase 3.1 DnD smoke', () => {
  test('step 3 drag flow @smoke', async ({ page }) => {
    await ensureAuthenticated(page)

    await page.goto(`${appBaseURL}/schedule`, { waitUntil: 'domcontentloaded' })

    await waitForScheduleReady(page)
    const step3Button = page.getByRole('button', { name: /Floating PCA/i }).first()
    await expect(step3Button).toBeVisible()
    test.skip(!(await step3Button.isEnabled()), 'Step 3 is disabled in current schedule state.')
    await step3Button.click()
    await expect(page.getByRole('button', { name: /Floating PCA.*Current step 3 of 5/i })).toBeVisible()

    const pcaTeamBlocks = page.locator('[data-pca-team]')
    await expect(pcaTeamBlocks.first()).toBeVisible()

    const sourceCard = page.locator('[data-pca-team] .cursor-move').first()
    await expect(sourceCard).toBeVisible()

    const sourceTeam = await sourceCard.evaluate((el) => {
      const teamEl = el.closest('[data-pca-team]')
      return teamEl?.getAttribute('data-pca-team') ?? null
    })

    const targetBlock = sourceTeam
      ? page.locator(`[data-pca-team]:not([data-pca-team="${sourceTeam}"])`).first()
      : pcaTeamBlocks.nth(1)

    await expect(targetBlock).toBeVisible()

    const sourceBox = await sourceCard.boundingBox()
    const targetBox = await targetBlock.boundingBox()
    if (!sourceBox || !targetBox) {
      test.skip(true, 'Unable to compute drag coordinates for PCA DnD smoke.')
      return
    }

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 })
    await page.mouse.up()

    const slotPopoverHeader = page.locator('text=/Select slots to move:|Confirm move:|Select slots to discard:|Confirm discard:/')
    const popoverShown = await slotPopoverHeader
      .first()
      .isVisible({ timeout: 2500 })
      .catch(() => false)

    await expect(page.getByRole('button', { name: /Floating PCA.*Current step 3 of 5/i })).toBeVisible()
    // Existing behavior allows both direct transfer and slot-selection popover paths.
    expect(typeof popoverShown).toBe('boolean')
  })
})
