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

async function waitForStaffProfile(page: Page) {
  await page.goto(`${appBaseURL}/dashboard?category=staff-profile`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Add New Staff' })).toBeVisible({ timeout: 20000 })
  await expect(page.locator('table')).toBeVisible()
}

async function openFirstEditableStaff(page: Page) {
  const editButtons = page.locator('button[title="Edit staff"]')
  const editCount = await editButtons.count()
  test.skip(editCount === 0, 'No editable staff rows are available in Staff Profile.')
  await editButtons.first().click()
}

async function openFirstEditableSptStaff(page: Page) {
  const sptRowEditButtons = page
    .locator('tbody tr')
    .filter({ hasText: 'SPT' })
    .locator('button[title="Edit staff"]')

  const count = await sptRowEditButtons.count()
  test.skip(count === 0, 'No editable SPT staff rows are available in Staff Profile.')
  await sptRowEditButtons.first().click()
}

test.describe('Dashboard staff edit overlay smoke suite', () => {
  test('new staff special-program overlay is draft-only and resists accidental dismiss @smoke', async ({ page }) => {
    await ensureAuthenticated(page)
    await waitForStaffProfile(page)

    await page.getByRole('button', { name: 'Add New Staff' }).click()
    await expect(page.getByRole('heading', { name: 'Add New Staff' })).toBeVisible()

    await page.mouse.click(10, 10)
    await expect(page.getByRole('heading', { name: 'Add New Staff' })).toBeVisible()

    const candidatePrograms = ['CRP', 'DRM', 'Robotic'] as const
    let selectedProgram: (typeof candidatePrograms)[number] | null = null

    for (const candidate of candidatePrograms) {
      const checkbox = page.getByRole('checkbox', { name: candidate })
      if (await checkbox.isVisible().catch(() => false)) {
        selectedProgram = candidate
        await checkbox.click()
        break
      }
    }

    test.skip(!selectedProgram, 'No supported special program options are available in the current environment.')

    const programButton = page.getByTestId(`staff-edit-special-program-card-${selectedProgram}`)
    await expect(programButton).toBeVisible()
    await expect(programButton).toBeEnabled()
    await programButton.click()
    await expect(page.getByRole('heading', { name: new RegExp(`${selectedProgram} configuration`) })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply to draft' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Discard changes' })).toBeVisible()

    await page.mouse.click(10, 10)
    await expect(page.getByRole('heading', { name: new RegExp(`${selectedProgram} configuration`) })).toBeVisible()
  })

  test('existing SPT overlay is draft-only and resists accidental dismiss @smoke', async ({ page }) => {
    await ensureAuthenticated(page)
    await waitForStaffProfile(page)
    await openFirstEditableSptStaff(page)

    await expect(page.getByRole('heading', { name: 'Edit Staff' })).toBeVisible()
    const sptButton = page.getByTestId('staff-edit-spt-card')
    await expect(sptButton).toBeVisible()

    await sptButton.click()
    await expect(page.getByRole('heading', { name: /SPT allocation/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply to draft' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Discard changes' })).toBeVisible()

    await page.mouse.click(10, 10)
    await expect(page.getByRole('heading', { name: /SPT allocation/i })).toBeVisible()
  })

  test('existing staff exposes a special-program overlay trigger after selection @smoke', async ({ page }) => {
    await ensureAuthenticated(page)
    await waitForStaffProfile(page)
    await openFirstEditableStaff(page)

    await expect(page.getByRole('heading', { name: 'Edit Staff' })).toBeVisible()

    const candidatePrograms = ['CRP', 'DRM', 'Robotic'] as const
    let selectedProgram: (typeof candidatePrograms)[number] | null = null

    for (const candidate of candidatePrograms) {
      const checkbox = page.getByRole('checkbox', { name: candidate })
      if (await checkbox.isVisible().catch(() => false)) {
        selectedProgram = candidate
        await checkbox.click()
        break
      }
    }

    test.skip(!selectedProgram, 'No supported special program options are available in the current environment.')

    await expect(page.getByRole('button', { name: new RegExp(`^${selectedProgram}`) })).toBeVisible()
  })
})
