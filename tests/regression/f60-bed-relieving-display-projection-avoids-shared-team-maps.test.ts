import assert from 'node:assert/strict'

import { projectBedRelievingNotesForDisplay } from '../../lib/features/schedule/bedRelievingDisplayProjection'

async function main() {
  const notesByToTeam = {
    CPPC: {
      FO: {
        resolution: 'taken',
        rows: [{ ward: 'R9C', bedNumbersText: '5' }],
      },
    },
  } as any

  const projected = projectBedRelievingNotesForDisplay({
    bedRelievingNotesByToTeam: notesByToTeam,
    mergedInto: {},
  })

  assert.deepEqual(
    projected.CPPC?.FO,
    {
      resolution: 'taken',
      rows: [{ ward: 'R9C', bedNumbersText: '5' }],
    },
    'Expected CPPC to keep the saved FO transfer entry'
  )

  assert.equal(
    projected.FO?.FO,
    undefined,
    'Expected FO not to inherit CPPC note state through shared object references'
  )

  assert.equal(
    projected.MC?.FO,
    undefined,
    'Expected unrelated teams not to display CPPC transfer notes'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
