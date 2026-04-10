/**
 * Behavior-named legacy-facing wrapper.
 * Keep this stable for callers; do not repoint feature work at mixed files.
 *
 * Canonical legacy-facing Step 3.4 entrypoint.
 * This wrapper must remain stable even if the underlying implementation moves.
 */
export { allocateFloatingPCA_v1LegacyPreferenceImpl as allocateFloatingPCA_v1LegacyPreference } from './floatingPcaLegacy/allocator'
