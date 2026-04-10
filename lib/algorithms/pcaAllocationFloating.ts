/**
 * Transitional façade for Step 3.4 floating allocation during migration.
 * Prefer importing from `floatingPcaLegacy/allocator`, `floatingPcaV2/allocator`, or `floatingPcaShared/contracts` directly.
 */
export type {
  FloatingPCAAllocationContextV2,
  FloatingPCAAllocationMode,
  FloatingPCAAllocationResultV2,
} from '@/lib/algorithms/floatingPcaShared/contracts'
export { allocateFloatingPCA_v1LegacyPreferenceImpl as allocateFloatingPCA_v2 } from '@/lib/algorithms/floatingPcaLegacy/allocator'
export { allocateFloatingPCA_v2RankedSlotImpl as allocateFloatingPCA_rankedV2 } from '@/lib/algorithms/floatingPcaV2/allocator'
