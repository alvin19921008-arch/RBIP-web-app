import { allocatePCA, type PCAAllocationContext } from '@/lib/algorithms/pcaAllocation'
import type { Team } from '@/types/staff'
import type {
  NonFloatingSubstitutionSelection,
  PcaWorkerMainToWorkerMessage,
  PcaWorkerWorkerToMainMessage,
  SubstitutionNeed,
} from '@/lib/features/schedule/pcaAllocationWorkerTypes'

const workerScope = self as unknown as {
  postMessage: (message: PcaWorkerWorkerToMainMessage) => void
}

type PendingTieBreak = {
  requestId: string
  resolve: (team: Team) => void
  reject: (error: Error) => void
}

type PendingSubstitution = {
  requestId: string
  resolve: (selections: NonFloatingSubstitutionSelection) => void
  reject: (error: Error) => void
}

let callbackCounter = 0
const pendingTieBreaks = new Map<string, PendingTieBreak>()
const pendingSubstitutions = new Map<string, PendingSubstitution>()

function nextCallbackRequestId(): string {
  callbackCounter += 1
  return `cb-${Date.now()}-${callbackCounter}`
}

function postToMain(message: PcaWorkerWorkerToMainMessage): void {
  workerScope.postMessage(message)
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function requestTieBreak(requestId: string, teams: Team[], pendingFTE: number): Promise<Team> {
  const callbackRequestId = nextCallbackRequestId()
  return new Promise<Team>((resolve, reject) => {
    pendingTieBreaks.set(callbackRequestId, { requestId, resolve, reject })
    postToMain({
      type: 'tie-break-request',
      requestId,
      callbackRequestId,
      payload: { teams, pendingFTE },
    })
  })
}

function requestSubstitution(
  requestId: string,
  substitutions: SubstitutionNeed[]
): Promise<NonFloatingSubstitutionSelection> {
  const callbackRequestId = nextCallbackRequestId()
  return new Promise<NonFloatingSubstitutionSelection>((resolve, reject) => {
    pendingSubstitutions.set(callbackRequestId, { requestId, resolve, reject })
    postToMain({
      type: 'substitution-request',
      requestId,
      callbackRequestId,
      payload: { substitutions },
    })
  })
}

async function runAllocation(message: Extract<PcaWorkerMainToWorkerMessage, { type: 'run' }>): Promise<void> {
  try {
    const context: PCAAllocationContext = {
      ...message.context,
      onTieBreak: message.expectTieBreak
        ? async (teams, pendingFTE) => requestTieBreak(message.requestId, teams, pendingFTE)
        : undefined,
      onNonFloatingSubstitution: message.expectNonFloatingSubstitution
        ? async (substitutions) => requestSubstitution(message.requestId, substitutions)
        : undefined,
    }

    const result = await allocatePCA(context)
    postToMain({
      type: 'result',
      requestId: message.requestId,
      result,
    })
  } catch (error) {
    postToMain({
      type: 'error',
      requestId: message.requestId,
      error: toErrorMessage(error),
    })
  }
}

self.addEventListener('message', (event: MessageEvent<PcaWorkerMainToWorkerMessage>) => {
  const message = event.data
  if (!message) return

  if (message.type === 'run') {
    void runAllocation(message)
    return
  }

  if (message.type === 'tie-break-response' || message.type === 'tie-break-error') {
    const pending = pendingTieBreaks.get(message.callbackRequestId)
    if (!pending || pending.requestId !== message.requestId) return
    pendingTieBreaks.delete(message.callbackRequestId)
    if (message.type === 'tie-break-response') {
      pending.resolve(message.selectedTeam)
    } else {
      pending.reject(new Error(message.error))
    }
    return
  }

  if (message.type === 'substitution-response' || message.type === 'substitution-error') {
    const pending = pendingSubstitutions.get(message.callbackRequestId)
    if (!pending || pending.requestId !== message.requestId) return
    pendingSubstitutions.delete(message.callbackRequestId)
    if (message.type === 'substitution-response') {
      pending.resolve(message.selections)
    } else {
      pending.reject(new Error(message.error))
    }
  }
})

export {}
