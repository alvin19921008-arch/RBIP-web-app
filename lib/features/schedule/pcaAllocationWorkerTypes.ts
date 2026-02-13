import type { Team } from '@/types/staff'
import type { FloatingSubCandidate, PCAAllocationContext, PCAAllocationResult } from '@/lib/algorithms/pcaAllocation'

export type SerializablePCAAllocationContext = Omit<
  PCAAllocationContext,
  'onTieBreak' | 'onNonFloatingSubstitution'
>

export type TieBreakRequestPayload = {
  teams: Team[]
  pendingFTE: number
}

export type SubstitutionNeed = {
  nonFloatingPCAId: string
  nonFloatingPCAName: string
  team: Team
  fte: number
  missingSlots: number[]
  availableFloatingPCAs: FloatingSubCandidate[]
}

export type NonFloatingSubstitutionRequestPayload = {
  substitutions: SubstitutionNeed[]
}

export type NonFloatingSubstitutionSelection = Record<
  string,
  Array<{ floatingPCAId: string; slots: number[] }>
>

export type PcaWorkerMainToWorkerMessage =
  | {
      type: 'run'
      requestId: string
      context: SerializablePCAAllocationContext
      expectTieBreak: boolean
      expectNonFloatingSubstitution: boolean
    }
  | {
      type: 'tie-break-response'
      requestId: string
      callbackRequestId: string
      selectedTeam: Team
    }
  | {
      type: 'tie-break-error'
      requestId: string
      callbackRequestId: string
      error: string
    }
  | {
      type: 'substitution-response'
      requestId: string
      callbackRequestId: string
      selections: NonFloatingSubstitutionSelection
    }
  | {
      type: 'substitution-error'
      requestId: string
      callbackRequestId: string
      error: string
    }

export type PcaWorkerWorkerToMainMessage =
  | {
      type: 'result'
      requestId: string
      result: PCAAllocationResult
    }
  | {
      type: 'error'
      requestId: string
      error: string
    }
  | {
      type: 'tie-break-request'
      requestId: string
      callbackRequestId: string
      payload: TieBreakRequestPayload
    }
  | {
      type: 'substitution-request'
      requestId: string
      callbackRequestId: string
      payload: NonFloatingSubstitutionRequestPayload
    }
