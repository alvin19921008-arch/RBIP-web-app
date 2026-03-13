import assert from 'node:assert/strict'

import { mergeStep2Point2StaffOverrides } from '../../lib/features/schedule/step2Point2StateMerge'

async function main() {
  const next = mergeStep2Point2StaffOverrides({
    baseOverrides: {
      'robotic-pca': {
        specialProgramOverrides: [
          {
            programId: 'robotic',
            pcaId: 'robotic-pca',
            slots: [1, 2, 3, 4],
            requiredSlots: [1, 2, 3, 4],
          },
        ],
      },
      'float-mc': {
        substitutionForBySlot: {
          1: { team: 'MC', nonFloatingPCAId: 'nf-mc', nonFloatingPCAName: 'NF MC' },
          2: { team: 'MC', nonFloatingPCAId: 'nf-mc', nonFloatingPCAName: 'NF MC' },
          3: { team: 'MC', nonFloatingPCAId: 'nf-mc', nonFloatingPCAName: 'NF MC' },
          4: { team: 'MC', nonFloatingPCAId: 'nf-mc', nonFloatingPCAName: 'NF MC' },
        },
      },
      'float-gmc': {
        substitutionForBySlot: {
          3: { team: 'GMC', nonFloatingPCAId: 'nf-gmc', nonFloatingPCAName: 'NF GMC' },
          4: { team: 'GMC', nonFloatingPCAId: 'nf-gmc', nonFloatingPCAName: 'NF GMC' },
        },
      },
      'spt-a': {
        leaveType: null,
        fteRemaining: 1,
      },
    } as any,
    updates: {
      'spt-a': {
        leaveType: 'AL',
        fteRemaining: 0,
        fteSubtraction: 1,
        team: 'SMM',
        sptOnDayOverride: {
          enabled: true,
          assignedTeam: 'SMM',
          slots: [1, 2],
        },
      },
    } as any,
  })

  assert.deepEqual(
    next['robotic-pca']?.specialProgramOverrides,
    [
      {
        programId: 'robotic',
        pcaId: 'robotic-pca',
        slots: [1, 2, 3, 4],
        requiredSlots: [1, 2, 3, 4],
      },
    ],
    'Expected Step 2.2 SPT edits to preserve existing Step 2 special-program slot overrides'
  )

  assert.deepEqual(
    next['float-mc']?.substitutionForBySlot,
    {
      1: { team: 'MC', nonFloatingPCAId: 'nf-mc', nonFloatingPCAName: 'NF MC' },
      2: { team: 'MC', nonFloatingPCAId: 'nf-mc', nonFloatingPCAName: 'NF MC' },
      3: { team: 'MC', nonFloatingPCAId: 'nf-mc', nonFloatingPCAName: 'NF MC' },
      4: { team: 'MC', nonFloatingPCAId: 'nf-mc', nonFloatingPCAName: 'NF MC' },
    },
    'Expected Step 2.2 SPT edits to preserve existing MC substitution coverage markers'
  )

  assert.deepEqual(
    next['float-gmc']?.substitutionForBySlot,
    {
      3: { team: 'GMC', nonFloatingPCAId: 'nf-gmc', nonFloatingPCAName: 'NF GMC' },
      4: { team: 'GMC', nonFloatingPCAId: 'nf-gmc', nonFloatingPCAName: 'NF GMC' },
    },
    'Expected Step 2.2 SPT edits to preserve existing GMC substitution coverage markers'
  )

  assert.deepEqual(
    next['spt-a'],
    {
      leaveType: 'AL',
      fteRemaining: 0,
      fteSubtraction: 1,
      team: 'SMM',
      sptOnDayOverride: {
        enabled: true,
        assignedTeam: 'SMM',
        slots: [1, 2],
      },
    },
    'Expected Step 2.2 merge to still apply the SPT edit itself'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
