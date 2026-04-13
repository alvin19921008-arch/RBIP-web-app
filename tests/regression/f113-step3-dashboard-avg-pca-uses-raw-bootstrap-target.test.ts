import assert from 'node:assert/strict'

import { getStep3AveragePcaDisplayTargets } from '../../lib/features/schedule/step3Bootstrap'
import type { Step3BootstrapSummary } from '../../lib/features/schedule/step3Bootstrap'

async function main() {
  const summary: Step3BootstrapSummary = {
    teamTargets: {
      FO: 1.3454545454545452,
      SMM: 1.3454545454545452,
      SFM: 0,
      CPPC: 1.3454545454545452,
      MC: 0,
      GMC: 0,
      NSM: 0,
      DRO: 1.9696969696969697,
    },
    existingAssignedByTeam: {
      FO: 1,
      SMM: 1,
      SFM: 0,
      CPPC: 1,
      MC: 0,
      GMC: 0,
      NSM: 0,
      DRO: 1,
    },
    pendingByTeam: {
      FO: 0.34545454545454524,
      SMM: 0.34545454545454524,
      SFM: 0,
      CPPC: 0.34545454545454524,
      MC: 0,
      GMC: 0,
      NSM: 0,
      DRO: 0.9696969696969697,
    },
    reservedSpecialProgramPcaFte: 0,
    availableFloatingSlots: 0,
    neededFloatingSlots: 0,
    slackFloatingSlots: 0,
    roundedAdjustedTeamTargets: {
      FO: 1.5,
      SMM: 1.5,
      SFM: 0,
      CPPC: 1.5,
      MC: 0,
      GMC: 0,
      NSM: 0,
      DRO: 2,
    },
  }

  const displayTargets = getStep3AveragePcaDisplayTargets(summary)

  assert.equal(
    displayTargets?.FO,
    1.3454545454545452,
    'Expected dashboard Avg PCA/team to show the raw Step 3 team target, not the rounded surplus-adjusted operational target.'
  )
  assert.equal(
    displayTargets?.DRO,
    1.9696969696969697,
    'Expected dashboard Avg PCA/team to preserve the raw DRO target instead of rounding it to a quarter increment.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
