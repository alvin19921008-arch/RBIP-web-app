/**
 * Behavior-named ranked V2 wrapper.
 * Keep V2 work pointed at the explicit floatingPcaV2 implementation.
 *
 * Canonical ranked V2 Step 3.4 entrypoint.
 * Do not point V2 feature work back at pcaAllocationFloating.ts.
 */
export { allocateFloatingPCA_v2RankedSlotImpl as allocateFloatingPCA_v2RankedSlot } from './floatingPcaV2/allocator'
