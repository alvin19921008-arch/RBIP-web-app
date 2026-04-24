import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  A1_DUPLICATE_RELIEF_POLICY_VERSION,
  countTeamsMaterialShort,
  teamHasMaterialRemainingFloatingPending,
} from '../../../lib/algorithms/floatingPcaV2/duplicateRepairPolicy'
import type { Team } from '../../../types/staff'

function allZeroPending(): Record<Team, number> {
  return {
    FO: 0,
    SMM: 0,
    SFM: 0,
    CPPC: 0,
    MC: 0,
    GMC: 0,
    NSM: 0,
    DRO: 0,
  }
}

describe('duplicateRepairPolicy', () => {
  it('exports A1_DUPLICATE_RELIEF_POLICY_VERSION', () => {
    assert.equal(A1_DUPLICATE_RELIEF_POLICY_VERSION, 1)
  })

  it('teamHasMaterialRemainingFloatingPending: 0 and sub-0.125 (e.g. 0.1) → false; 0.25 → true; 0.24 → true (midpoint round → 0.25)', () => {
    const t: Team = 'FO'
    let p = { ...allZeroPending(), [t]: 0 }
    assert.equal(teamHasMaterialRemainingFloatingPending(p, t), false)
    p = { ...allZeroPending(), [t]: 0.1 }
    assert.equal(teamHasMaterialRemainingFloatingPending(p, t), false)
    p = { ...allZeroPending(), [t]: 0.24 }
    assert.equal(teamHasMaterialRemainingFloatingPending(p, t), true)
    p = { ...allZeroPending(), [t]: 0.25 }
    assert.equal(teamHasMaterialRemainingFloatingPending(p, t), true)
  })

  it('countTeamsMaterialShort: only teams with quarter-rounded pending ≥ 0.25', () => {
    const p: Record<Team, number> = {
      FO: 0,
      SMM: 0.25,
      SFM: 0.1,
      CPPC: 0.1,
      MC: 0.3,
      GMC: 0,
      NSM: 0.5,
      DRO: 0.1,
    }
    assert.equal(countTeamsMaterialShort(p), 3)
  })
})
