import type { Team } from '@/types/staff'
import type { FloatingPCAAllocationContextV2, FloatingPCAAllocationResultV2 } from './pcaAllocationFloating'
import { allocateFloatingPCA_v1, allocateFloatingPCA_v2 } from './pcaAllocationFloating'

export type FloatingPCAEngineVersion = 'v1' | 'v2'

export type FloatingPCAAllocationContextWithEngine = FloatingPCAAllocationContextV2 & {
  engine?: FloatingPCAEngineVersion
}

function stampTrackerEngine(
  tracker: FloatingPCAAllocationResultV2['tracker'],
  engine: FloatingPCAEngineVersion
): void {
  for (const team of Object.keys(tracker) as Team[]) {
    tracker[team].summary.allocationEngine = engine
  }
}

/**
 * Shared Step 3.4 router for V1/V2 coexistence.
 * Default engine is V2, with explicit opt-in to V1 legacy behavior.
 */
export async function allocateFloatingPCAByEngine(
  context: FloatingPCAAllocationContextWithEngine
): Promise<FloatingPCAAllocationResultV2> {
  const { engine = 'v2', ...allocationContext } = context
  const selectedEngine: FloatingPCAEngineVersion = engine === 'v1' ? 'v1' : 'v2'

  const result =
    selectedEngine === 'v1'
      ? await allocateFloatingPCA_v1(allocationContext)
      : await allocateFloatingPCA_v2(allocationContext)

  stampTrackerEngine(result.tracker, selectedEngine)
  return result
}
