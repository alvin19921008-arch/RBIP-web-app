import assert from 'node:assert/strict'

import { buildSpecialProgramSlotsByProgramId } from '../../lib/utils/specialProgramSlotMap'

async function main() {
  const slotsByProgramId = buildSpecialProgramSlotsByProgramId({
    weekday: 'wed',
    specialPrograms: [
      {
        id: 'crp',
        name: 'CRP',
        weekdays: ['wed'],
        slots: {
          mon: [],
          tue: [],
          wed: [1],
          thu: [],
          fri: [],
        },
      } as any,
    ],
  })

  assert.deepEqual(
    Array.from(slotsByProgramId.get('crp') ?? []).sort((a, b) => a - b),
    [1],
    `Expected special-program slot map to preserve actual CRP weekday slot 1, but got ${JSON.stringify(Array.from(slotsByProgramId.get('crp') ?? []))}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
