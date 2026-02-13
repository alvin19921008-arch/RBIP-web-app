import type { PCAAllocation } from '@/types/schedule'
import type { Team } from '@/types/staff'
import type { PCAAllocationContext, PCAAllocationResult } from '@/lib/algorithms/pcaAllocation'
import type {
  PcaWorkerMainToWorkerMessage,
  PcaWorkerWorkerToMainMessage,
  SerializablePCAAllocationContext,
} from '@/lib/features/schedule/pcaAllocationWorkerTypes'

let pcaAlgoImport: Promise<typeof import('@/lib/algorithms/pcaAllocation')> | null = null

type WorkerRequestState = {
  context: PCAAllocationContext
  resolve: (result: PCAAllocationResult) => void
  reject: (error: Error) => void
}

let workerInstance: Worker | null = null
let workerAttached = false
let requestCounter = 0
const pendingRequests = new Map<string, WorkerRequestState>()

function loadPcaAlgo() {
  pcaAlgoImport = pcaAlgoImport ?? import('@/lib/algorithms/pcaAllocation')
  return pcaAlgoImport
}

function shouldUseWorker(): boolean {
  return process.env.NEXT_PUBLIC_SCHEDULE_PCA_WORKER === '1'
}

function shouldShadowCompare(): boolean {
  return process.env.NEXT_PUBLIC_SCHEDULE_PCA_WORKER_SHADOW_COMPARE === '1'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(toErrorMessage(error))
}

function buildRequestId(): string {
  requestCounter += 1
  return `pca-worker-${Date.now()}-${requestCounter}`
}

async function runPcaSync(context: PCAAllocationContext): Promise<PCAAllocationResult> {
  const { allocatePCA } = await loadPcaAlgo()
  return allocatePCA(context)
}

function toSerializableContext(context: PCAAllocationContext): SerializablePCAAllocationContext {
  const { onTieBreak, onNonFloatingSubstitution, ...serializable } = context
  void onTieBreak
  void onNonFloatingSubstitution
  return serializable
}

function normalizeAllocations(allocations: PCAAllocation[]): Array<Record<string, unknown>> {
  return allocations
    .map((alloc) => ({
      staff_id: alloc.staff_id,
      team: alloc.team,
      fte_pca: alloc.fte_pca,
      fte_remaining: alloc.fte_remaining,
      slot_assigned: alloc.slot_assigned,
      slot_whole: alloc.slot_whole,
      slot1: alloc.slot1,
      slot2: alloc.slot2,
      slot3: alloc.slot3,
      slot4: alloc.slot4,
      leave_type: alloc.leave_type,
      special_program_ids: [...(alloc.special_program_ids ?? [])].sort(),
    }))
    .sort((a, b) => {
      const keyA = `${a.staff_id}|${a.team}|${a.slot1}|${a.slot2}|${a.slot3}|${a.slot4}`
      const keyB = `${b.staff_id}|${b.team}|${b.slot1}|${b.slot2}|${b.slot3}|${b.slot4}`
      return keyA.localeCompare(keyB)
    })
}

function normalizeTeamRecord(record: Record<Team, number> | undefined): Record<Team, number> | null {
  if (!record) return null
  return {
    FO: record.FO,
    SMM: record.SMM,
    SFM: record.SFM,
    CPPC: record.CPPC,
    MC: record.MC,
    GMC: record.GMC,
    NSM: record.NSM,
    DRO: record.DRO,
  }
}

function normalizeResult(result: PCAAllocationResult): Record<string, unknown> {
  return {
    allocations: normalizeAllocations(result.allocations),
    totalPCAOnDuty: result.totalPCAOnDuty,
    pendingPCAFTEPerTeam: normalizeTeamRecord(result.pendingPCAFTEPerTeam),
    teamPCAAssigned: normalizeTeamRecord(result.teamPCAAssigned),
    errors: result.errors ?? null,
  }
}

function areResultsEquivalent(a: PCAAllocationResult, b: PCAAllocationResult): boolean {
  return JSON.stringify(normalizeResult(a)) === JSON.stringify(normalizeResult(b))
}

function postToWorker(message: PcaWorkerMainToWorkerMessage): void {
  const worker = workerInstance
  if (!worker) throw new Error('PCA worker is not available')
  worker.postMessage(message)
}

function setupWorkerListeners(worker: Worker): void {
  if (workerAttached) return

  worker.addEventListener('message', async (event: MessageEvent<PcaWorkerWorkerToMainMessage>) => {
    const message = event.data
    if (!message) return

    if (message.type === 'result' || message.type === 'error') {
      const pending = pendingRequests.get(message.requestId)
      if (!pending) return
      pendingRequests.delete(message.requestId)
      if (message.type === 'result') {
        pending.resolve(message.result)
      } else {
        pending.reject(new Error(message.error))
      }
      return
    }

    const pending = pendingRequests.get(message.requestId)
    if (!pending) return

    if (message.type === 'tie-break-request') {
      if (!pending.context.onTieBreak) {
        postToWorker({
          type: 'tie-break-error',
          requestId: message.requestId,
          callbackRequestId: message.callbackRequestId,
          error: 'Missing onTieBreak callback in main thread',
        })
        return
      }

      try {
        const selectedTeam = await pending.context.onTieBreak(
          message.payload.teams,
          message.payload.pendingFTE
        )
        postToWorker({
          type: 'tie-break-response',
          requestId: message.requestId,
          callbackRequestId: message.callbackRequestId,
          selectedTeam,
        })
      } catch (error) {
        postToWorker({
          type: 'tie-break-error',
          requestId: message.requestId,
          callbackRequestId: message.callbackRequestId,
          error: toErrorMessage(error),
        })
      }
      return
    }

    if (message.type === 'substitution-request') {
      if (!pending.context.onNonFloatingSubstitution) {
        postToWorker({
          type: 'substitution-error',
          requestId: message.requestId,
          callbackRequestId: message.callbackRequestId,
          error: 'Missing onNonFloatingSubstitution callback in main thread',
        })
        return
      }

      try {
        const selections = await pending.context.onNonFloatingSubstitution(message.payload.substitutions)
        postToWorker({
          type: 'substitution-response',
          requestId: message.requestId,
          callbackRequestId: message.callbackRequestId,
          selections,
        })
      } catch (error) {
        postToWorker({
          type: 'substitution-error',
          requestId: message.requestId,
          callbackRequestId: message.callbackRequestId,
          error: toErrorMessage(error),
        })
      }
    }
  })

  worker.addEventListener('error', (event) => {
    const errorMessage = event.message || 'PCA worker crashed'
    pendingRequests.forEach(({ reject }, requestId) => {
      reject(new Error(errorMessage))
      pendingRequests.delete(requestId)
    })
    workerInstance = null
    workerAttached = false
  })

  workerAttached = true
}

function getOrCreateWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null

  if (workerInstance) return workerInstance

  workerInstance = new Worker(new URL('./pcaAllocation.worker.ts', import.meta.url), {
    type: 'module',
    name: 'pca-allocation-worker',
  })
  setupWorkerListeners(workerInstance)
  return workerInstance
}

async function runPcaOnWorker(context: PCAAllocationContext): Promise<PCAAllocationResult> {
  const worker = getOrCreateWorker()
  if (!worker) {
    throw new Error('Web Worker is not supported in this environment')
  }

  const requestId = buildRequestId()
  const contextForWorker = toSerializableContext(context)

  return new Promise<PCAAllocationResult>((resolve, reject) => {
    pendingRequests.set(requestId, { context, resolve, reject })
    worker.postMessage({
      type: 'run',
      requestId,
      context: contextForWorker,
      expectTieBreak: typeof context.onTieBreak === 'function',
      expectNonFloatingSubstitution: typeof context.onNonFloatingSubstitution === 'function',
    } satisfies PcaWorkerMainToWorkerMessage)
  })
}

export async function allocatePCAWithAdapter(context: PCAAllocationContext): Promise<PCAAllocationResult> {
  const workerEnabled = shouldUseWorker()
  if (!workerEnabled) {
    return runPcaSync(context)
  }

  try {
    const workerResult = await runPcaOnWorker(context)

    if (shouldShadowCompare()) {
      const syncResult = await runPcaSync(context)
      if (!areResultsEquivalent(workerResult, syncResult)) {
        console.error('PCA worker parity mismatch detected. Falling back to sync result for this run.')
        return syncResult
      }
    }

    return workerResult
  } catch (error) {
    console.warn('PCA worker failed, falling back to sync allocation.', asError(error))
    return runPcaSync(context)
  }
}

