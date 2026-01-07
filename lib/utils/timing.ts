export type TimingStage = { name: string; ms: number }

export type TimingReport = {
  at: string
  totalMs: number
  stages: TimingStage[]
  meta?: Record<string, unknown>
}

export function createTimingCollector(params?: { now?: () => number }) {
  const now = params?.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
  const startedAt = now()
  let lastMark = startedAt
  const stages: TimingStage[] = []

  return {
    stage: (name: string) => {
      const t = now()
      stages.push({ name, ms: t - lastMark })
      lastMark = t
    },
    finalize: (meta?: Record<string, unknown>): TimingReport => {
      const endedAt = now()
      return {
        at: new Date().toISOString(),
        totalMs: endedAt - startedAt,
        stages,
        meta,
      }
    },
  }
}

