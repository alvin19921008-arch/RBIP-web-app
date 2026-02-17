import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const appBaseURL = process.env.PW_APP_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

type StepAlgoPerfEntry = {
  phase: 'step2' | 'step3'
  status: 'ok' | 'error'
  durationMs: number
  timestamp: string
  selectedDate: string
  details?: Record<string, unknown>
}

type Phase34MetricSnapshot = {
  label: string
  collectedAt: string
  selectedDate: string | null
  scheduleLoadMs: number
  navigation: {
    ttfbMs: number | null
    domContentLoadedMs: number | null
    loadEventMs: number | null
    durationMs: number | null
  }
  interactions: {
    runStep2ActionMs: number
    runStep3ActionMs: number
  }
  algorithms: {
    step2DurationMs: number
    step3DurationMs: number
    source: 'instrumented' | 'interaction-fallback'
    step2Details: Record<string, unknown> | null
    step3Details: Record<string, unknown> | null
  }
}

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

async function readAlgoPerfEntries(page: Page): Promise<StepAlgoPerfEntry[]> {
  return await page.evaluate(() => {
    const value = (window as any).__rbipScheduleAlgoPerf
    return Array.isArray(value) ? value : []
  })
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

async function runLeaveSimAction(page: Page, actionName: RegExp): Promise<number> {
  await openLeaveSimRunTab(page)
  const actionButton = page.getByRole('button', { name: actionName }).first()
  await expect(actionButton).toBeVisible()
  await expect(actionButton).toBeEnabled()

  const startedAt = Date.now()
  await actionButton.click()

  await expect
    .poll(
      async () => !(await page.getByRole('heading', { name: 'Developer Leave Simulation (seeded)' }).first().isVisible().catch(() => false)),
      { timeout: 90000 }
    )
    .toBe(true)

  await waitForScheduleReady(page)
  return Date.now() - startedAt
}

async function writePhase34Metrics(metrics: Phase34MetricSnapshot) {
  const outputFile = process.env.PHASE34_METRICS_FILE || path.join('metrics', 'phase3_4', 'latest.json')
  await mkdir(path.dirname(outputFile), { recursive: true })
  await writeFile(outputFile, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8')
}

test.describe('Schedule Phase 3.4 algorithm metrics', () => {
  test('step 2 -> step 3 auto-run perf snapshot @smoke', async ({ page }) => {
    await ensureAuthenticated(page)

    const scheduleLoadStart = Date.now()
    await page.goto(`${appBaseURL}/schedule`, { waitUntil: 'domcontentloaded' })
    await waitForScheduleReady(page)
    const scheduleLoadMs = Date.now() - scheduleLoadStart

    const preEntries = await readAlgoPerfEntries(page)
    const preEntryCount = preEntries.length

    const runStep2ActionMs = await runLeaveSimAction(page, /^Run Step 2$/i)
    const runStep3ActionMs = await runLeaveSimAction(page, /^Run Step 3/i)

    const postEntries = await readAlgoPerfEntries(page)
    const newEntries = postEntries.slice(preEntryCount)
    const latestStep2 = [...newEntries].reverse().find((entry) => entry.phase === 'step2' && entry.status === 'ok')
    const latestStep3 = [...newEntries].reverse().find((entry) => entry.phase === 'step3' && entry.status === 'ok')
    const hasInstrumentedDurations = !!latestStep2 && !!latestStep3

    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      return {
        navigation: {
          ttfbMs: nav ? nav.responseStart : null,
          domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
          loadEventMs: nav ? nav.loadEventEnd : null,
          durationMs: nav ? nav.duration : null,
        },
      }
    })

    const snapshot: Phase34MetricSnapshot = {
      label: process.env.PHASE34_METRICS_LABEL || `phase3_4_${Date.now()}`,
      collectedAt: new Date().toISOString(),
      selectedDate: latestStep3?.selectedDate ?? latestStep2?.selectedDate ?? null,
      scheduleLoadMs,
      navigation: perf.navigation,
      interactions: {
        runStep2ActionMs,
        runStep3ActionMs,
      },
      algorithms: {
        step2DurationMs: latestStep2?.durationMs ?? runStep2ActionMs,
        step3DurationMs: latestStep3?.durationMs ?? runStep3ActionMs,
        source: hasInstrumentedDurations ? 'instrumented' : 'interaction-fallback',
        step2Details: latestStep2?.details ?? null,
        step3Details: latestStep3?.details ?? null,
      },
    }

    await writePhase34Metrics(snapshot)
    console.log(`[phase3.4-metrics] ${JSON.stringify(snapshot)}`)
  })
})

