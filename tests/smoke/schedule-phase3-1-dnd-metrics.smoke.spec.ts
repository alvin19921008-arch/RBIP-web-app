import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

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

async function installWebVitalsObservers(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).__rbipPhase31Vitals = {
      cls: 0,
      lcp: 0,
      fcp: 0,
      fp: 0,
    }

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const vitals = (window as any).__rbipPhase31Vitals
        for (const entry of entries) {
          const ls = entry as any
          if (!ls.hadRecentInput && typeof ls.value === 'number') {
            vitals.cls += ls.value
          }
        }
      }).observe({ type: 'layout-shift', buffered: true })
    } catch {}

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const vitals = (window as any).__rbipPhase31Vitals
        const last = entries[entries.length - 1]
        if (last && typeof last.startTime === 'number') {
          vitals.lcp = last.startTime
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {}

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const vitals = (window as any).__rbipPhase31Vitals
        for (const entry of entries) {
          if (entry.name === 'first-contentful-paint') vitals.fcp = entry.startTime
          if (entry.name === 'first-paint') vitals.fp = entry.startTime
        }
      }).observe({ type: 'paint', buffered: true })
    } catch {}
  })
}

type Phase31MetricSnapshot = {
  label: string
  collectedAt: string
  scheduleLoadMs: number
  navigation: {
    ttfbMs: number | null
    domContentLoadedMs: number | null
    loadEventMs: number | null
    durationMs: number | null
  }
  webVitals: {
    fcpMs: number
    lcpMs: number
    cls: number
  }
  interaction: {
    sourceTeam: string | null
    targetTeam: string | null
    popoverShown: boolean
  }
}

async function writePhase31Metrics(metrics: Phase31MetricSnapshot) {
  const outDir = process.env.PHASE31_METRICS_DIR || path.join('metrics', 'phase3_1')
  await mkdir(outDir, { recursive: true })
  const file = path.join(outDir, `${metrics.label}.json`)
  await writeFile(file, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8')
}

test.describe('Schedule Phase 3.1 DnD smoke metrics', () => {
  test('step 3 drag flow + perf snapshot @smoke', async ({ page }) => {
    await installWebVitalsObservers(page)
    await ensureAuthenticated(page)

    const scheduleLoadStart = Date.now()
    await page.goto(`${appBaseURL}/schedule`, { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(/\/schedule/)
    await expect(page.getByRole('button', { name: /^Floating PCA/i })).toBeVisible()
    await page.getByRole('button', { name: /^Floating PCA/i }).click()
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

    const scheduleLoadMs = Date.now() - scheduleLoadStart
    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const vitals = (window as any).__rbipPhase31Vitals || {}
      return {
        navigation: {
          ttfbMs: nav ? nav.responseStart : null,
          domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
          loadEventMs: nav ? nav.loadEventEnd : null,
          durationMs: nav ? nav.duration : null,
        },
        webVitals: {
          fcpMs: Number(vitals.fcp || 0),
          lcpMs: Number(vitals.lcp || 0),
          cls: Number(vitals.cls || 0),
        },
      }
    })

    const targetTeam = await targetBlock.getAttribute('data-pca-team')
    const metrics: Phase31MetricSnapshot = {
      label: process.env.PHASE31_METRICS_LABEL || `phase3_1_${Date.now()}`,
      collectedAt: new Date().toISOString(),
      scheduleLoadMs,
      navigation: perf.navigation,
      webVitals: perf.webVitals,
      interaction: {
        sourceTeam,
        targetTeam,
        popoverShown,
      },
    }

    await writePhase31Metrics(metrics)
    console.log(`[phase3.1-metrics] ${JSON.stringify(metrics)}`)
  })
})
import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

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

async function installWebVitalsObservers(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).__rbipPhase31Vitals = {
      cls: 0,
      lcp: 0,
      fcp: 0,
      fp: 0,
    }

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const vitals = (window as any).__rbipPhase31Vitals
        for (const entry of entries) {
          const ls = entry as any
          if (!ls.hadRecentInput && typeof ls.value === 'number') {
            vitals.cls += ls.value
          }
        }
      }).observe({ type: 'layout-shift', buffered: true })
    } catch {}

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const vitals = (window as any).__rbipPhase31Vitals
        const last = entries[entries.length - 1]
        if (last && typeof last.startTime === 'number') {
          vitals.lcp = last.startTime
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {}

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const vitals = (window as any).__rbipPhase31Vitals
        for (const entry of entries) {
          if (entry.name === 'first-contentful-paint') vitals.fcp = entry.startTime
          if (entry.name === 'first-paint') vitals.fp = entry.startTime
        }
      }).observe({ type: 'paint', buffered: true })
    } catch {}
  })
}

type Phase31MetricSnapshot = {
  label: string
  collectedAt: string
  scheduleLoadMs: number
  navigation: {
    ttfbMs: number | null
    domContentLoadedMs: number | null
    loadEventMs: number | null
    durationMs: number | null
  }
  webVitals: {
    fcpMs: number
    lcpMs: number
    cls: number
  }
  interaction: {
    sourceTeam: string | null
    targetTeam: string | null
    popoverShown: boolean
  }
  dndPersistence: {
    eventsCaptured: number
    latestEvent: {
      id: string
      kind: string
      status: string
      uiRenderLatencyMs: number | null
      uiToPersistenceStartMs: number | null
      uiToPersistenceMs: number | null
      persistenceDurationMs: number | null
      sourceTeam: string | null
      targetTeam: string | null
      slots: number[]
    } | null
  }
}

async function writePhase31Metrics(metrics: Phase31MetricSnapshot) {
  const outDir = process.env.PHASE31_METRICS_DIR || path.join('metrics', 'phase3_1')
  await mkdir(outDir, { recursive: true })
  const file = path.join(outDir, `${metrics.label}.json`)
  await writeFile(file, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8')
}

test.describe('Schedule Phase 3.1 DnD smoke metrics', () => {
  test('step 3 drag flow + perf snapshot @smoke', async ({ page }) => {
    await installWebVitalsObservers(page)
    await ensureAuthenticated(page)

    const scheduleLoadStart = Date.now()
    await page.goto(`${appBaseURL}/schedule`, { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(/\/schedule/)
    await expect(page.getByRole('button', { name: /^Floating PCA/i })).toBeVisible()
    await page.getByRole('button', { name: /^Floating PCA/i }).click()
    await expect(page.getByRole('button', { name: /Floating PCA.*Current step 3 of 5/i })).toBeVisible()

    const pcaTeamBlocks = page.locator('[data-pca-team]')
    await expect(pcaTeamBlocks.first()).toBeVisible()

    const sourceCards = page.locator('[data-pca-team] .cursor-move')
    const sourceCardCount = await sourceCards.count()
    const maxAttempts = Math.min(sourceCardCount, 6)

    let sourceTeam: string | null = null
    let targetTeam: string | null = null
    let popoverShown = false
    let triggeredPersistenceEvent = false

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const sourceCard = sourceCards.nth(attempt)
      const isVisible = await sourceCard.isVisible().catch(() => false)
      if (!isVisible) continue

      const nextSourceTeam = await sourceCard.evaluate((el) => {
        const teamEl = el.closest('[data-pca-team]')
        return teamEl?.getAttribute('data-pca-team') ?? null
      })
      const nextTargetBlock = nextSourceTeam
        ? page.locator(`[data-pca-team]:not([data-pca-team="${nextSourceTeam}"])`).first()
        : pcaTeamBlocks.nth(1)

      const targetVisible = await nextTargetBlock.isVisible().catch(() => false)
      if (!targetVisible) continue

      const sourceBox = await sourceCard.boundingBox()
      const targetBox = await nextTargetBlock.boundingBox()
      if (!sourceBox || !targetBox) continue

      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 })
      await page.mouse.up()

      const slotPopoverHeader = page.locator('text=/Select slots to move:|Confirm move:|Select slots to discard:|Confirm discard:/')
      const attemptPopoverShown = await slotPopoverHeader
        .first()
        .isVisible({ timeout: 1000 })
        .catch(() => false)

      const eventCount = await page.evaluate(() => {
        const events = ((window as any).__rbipDndPersistence?.events || []) as Array<unknown>
        return events.length
      })

      if (eventCount > 0) {
        sourceTeam = nextSourceTeam
        targetTeam = await nextTargetBlock.getAttribute('data-pca-team')
        popoverShown = attemptPopoverShown
        triggeredPersistenceEvent = true
        break
      }

      if (attemptPopoverShown) {
        const closeButton = page
          .locator('text=/Select slots to move:|Confirm move:|Select slots to discard:|Confirm discard:/')
          .first()
          .locator('xpath=ancestor::div[1]//button')
          .first()
        await closeButton.click({ timeout: 1000 }).catch(() => null)
      }
    }

    if (!triggeredPersistenceEvent) {
      test.skip(true, 'Unable to trigger a persistence-instrumented PCA DnD operation.')
      return
    }

    await expect(page.getByRole('button', { name: /Floating PCA.*Current step 3 of 5/i })).toBeVisible()
    await page
      .waitForFunction(() => {
        const events = ((window as any).__rbipDndPersistence?.events || []) as Array<{ status?: string }>
        if (events.length === 0) return true
        const latest = events[events.length - 1]
        return latest.status === 'completed' || latest.status === 'failed'
      })
      .catch(() => null)

    const scheduleLoadMs = Date.now() - scheduleLoadStart
    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const vitals = (window as any).__rbipPhase31Vitals || {}
      const dndEvents = ((window as any).__rbipDndPersistence?.events || []) as Array<any>
      const latestDndEvent = dndEvents.length > 0 ? dndEvents[dndEvents.length - 1] : null
      return {
        navigation: {
          ttfbMs: nav ? nav.responseStart : null,
          domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
          loadEventMs: nav ? nav.loadEventEnd : null,
          durationMs: nav ? nav.duration : null,
        },
        webVitals: {
          fcpMs: Number(vitals.fcp || 0),
          lcpMs: Number(vitals.lcp || 0),
          cls: Number(vitals.cls || 0),
        },
        dndPersistence: {
          eventsCaptured: dndEvents.length,
          latestEvent: latestDndEvent
            ? {
                id: String(latestDndEvent.id || ''),
                kind: String(latestDndEvent.kind || ''),
                status: String(latestDndEvent.status || ''),
                uiRenderLatencyMs:
                  typeof latestDndEvent.uiRenderLatencyMs === 'number' ? latestDndEvent.uiRenderLatencyMs : null,
                uiToPersistenceStartMs:
                  typeof latestDndEvent.uiToPersistenceStartMs === 'number'
                    ? latestDndEvent.uiToPersistenceStartMs
                    : null,
                uiToPersistenceMs:
                  typeof latestDndEvent.uiToPersistenceMs === 'number' ? latestDndEvent.uiToPersistenceMs : null,
                persistenceDurationMs:
                  typeof latestDndEvent.persistenceStartAtMs === 'number' &&
                  typeof latestDndEvent.persistenceEndAtMs === 'number'
                    ? latestDndEvent.persistenceEndAtMs - latestDndEvent.persistenceStartAtMs
                    : null,
                sourceTeam: latestDndEvent.sourceTeam ?? null,
                targetTeam: latestDndEvent.targetTeam ?? null,
                slots: Array.isArray(latestDndEvent.slots)
                  ? latestDndEvent.slots.filter((slot: unknown) => typeof slot === 'number')
                  : [],
              }
            : null,
        },
      }
    })

    const metrics: Phase31MetricSnapshot = {
      label: process.env.PHASE31_METRICS_LABEL || `phase3_1_${Date.now()}`,
      collectedAt: new Date().toISOString(),
      scheduleLoadMs,
      navigation: perf.navigation,
      webVitals: perf.webVitals,
      interaction: {
        sourceTeam,
        targetTeam,
        popoverShown,
      },
      dndPersistence: perf.dndPersistence,
    }

    await writePhase31Metrics(metrics)
    console.log(`[phase3.1-metrics] ${JSON.stringify(metrics)}`)
  })
})
