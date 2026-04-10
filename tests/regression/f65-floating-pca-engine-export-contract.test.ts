import assert from 'node:assert/strict'

async function main() {
  const pcaModule = await import('../../lib/algorithms/pcaAllocation')

  assert.equal(
    typeof pcaModule.allocateFloatingPCA_v1LegacyPreference,
    'function',
    'Expected pcaAllocation module to expose allocateFloatingPCA_v1LegacyPreference as the canonical V1 floating allocator export.'
  )

  assert.equal(
    typeof pcaModule.allocateFloatingPCA_v2RankedSlot,
    'function',
    'Expected pcaAllocation module to expose allocateFloatingPCA_v2RankedSlot as the canonical V2 floating allocator export.'
  )

  assert.equal(
    'allocateFloatingPCA_v2' in pcaModule,
    false,
    'Expected legacy ambiguous export allocateFloatingPCA_v2 to be removed from the canonical module surface.'
  )

  assert.equal(
    'allocateFloatingPCA_rankedV2' in pcaModule,
    false,
    'Expected legacy ambiguous export allocateFloatingPCA_rankedV2 to be removed from the canonical module surface.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
