import assert from 'node:assert/strict'

import { buildExistingProgramOverrideSeed } from '../../lib/utils/specialProgramOverrideSeed'

async function main() {
  const canonicalResult = buildExistingProgramOverrideSeed({
    programName: 'CRP',
    foundTherapistId: 'amanda',
    foundPrimaryPcaId: 'jun',
    foundSlots: [1],
    foundRequiredSlots: [1],
    foundTherapistFTE: 0,
    foundPCAFTE: 0.25,
    primaryConfiguredTherapist: {
      id: 'aggie',
      fte: 0,
    },
    isPrimaryConfiguredTherapistAvailable: true,
  })

  assert.ok(canonicalResult, 'Expected CRP existing fragments to still seed an override result')
  assert.equal(
    canonicalResult!.therapistId,
    'aggie',
    `Expected available canonical CRP therapist Aggie to override stale therapist fragment Amanda, but got ${canonicalResult!.therapistId}`
  )
  assert.equal(
    canonicalResult!.primaryPcaId,
    'jun',
    `Expected the persisted CRP PCA fragment to stay intact while therapist canonicalizes, but got ${canonicalResult!.primaryPcaId}`
  )

  const unavailableCanonicalResult = buildExistingProgramOverrideSeed({
    programName: 'CRP',
    foundTherapistId: 'amanda',
    foundPrimaryPcaId: 'jun',
    foundSlots: [1],
    foundRequiredSlots: [1],
    foundTherapistFTE: 0,
    foundPCAFTE: 0.25,
    primaryConfiguredTherapist: {
      id: 'aggie',
      fte: 0,
    },
    isPrimaryConfiguredTherapistAvailable: false,
  })

  assert.equal(
    unavailableCanonicalResult?.therapistId,
    'amanda',
    `Expected stale override therapist to remain only when the canonical CRP therapist is unavailable, but got ${unavailableCanonicalResult?.therapistId}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
