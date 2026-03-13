import assert from 'node:assert/strict'

import { buildScheduleRuntimeProjection, buildPcaAllocatorView } from '../../lib/utils/scheduleRuntimeProjection'

async function main() {
  const staff = [
    {
      id: 'float-robotic',
      name: 'Float Robotic',
      rank: 'PCA',
      floating: true,
      team: null,
      status: 'active',
      floor_pca: false,
    },
  ] as any

  const projection = buildScheduleRuntimeProjection({
    selectedDate: new Date('2026-04-03T08:00:00.000Z'),
    staff,
    staffOverrides: {
      'float-robotic': {
        fteRemaining: 1,
        availableSlots: [1, 2, 3, 4],
        specialProgramOverrides: [
          {
            programId: 'robotic',
            pcaId: 'float-robotic',
            slots: [1, 2, 3, 4],
            requiredSlots: [1, 2, 3, 4],
          },
        ],
      } as any,
    },
    excludeSubstitutionSlotsForFloating: true,
    clampBufferFteRemaining: true,
    excludeSpecialProgramSlotsForFloating: true as any,
  } as any)

  const pcaView = buildPcaAllocatorView({
    projection,
    fallbackToBaseTeamWhenEffectiveTeamMissing: true,
  })

  assert.deepEqual(
    pcaView[0]?.availableSlots ?? null,
    [],
    `Expected Step 3 runtime projection to exclude Step 2 special-program reserved slots [1,2,3,4] from floating availability, but got ${JSON.stringify(
      pcaView[0]?.availableSlots ?? null
    )}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
