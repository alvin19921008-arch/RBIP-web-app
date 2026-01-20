import type {
  BaselineSnapshot,
  BaselineSnapshotEnvelope,
  BaselineSnapshotSource,
  BaselineSnapshotStored,
  GlobalHeadAtCreation,
} from '@/types/schedule'

export function isBaselineSnapshotEnvelope(value: unknown): value is BaselineSnapshotEnvelope {
  const schemaVersion = (value as any)?.schemaVersion
  return (
    !!value &&
    typeof value === 'object' &&
    (schemaVersion === 1 || schemaVersion === 2) &&
    typeof (value as any).createdAt === 'string' &&
    typeof (value as any).source === 'string' &&
    !!(value as any).data &&
    typeof (value as any).data === 'object'
  )
}

export function buildBaselineSnapshotEnvelope(params: {
  data: BaselineSnapshot
  source: BaselineSnapshotSource
  createdAt?: string
  globalHeadAtCreation?: GlobalHeadAtCreation | null
}): BaselineSnapshotEnvelope {
  return {
    schemaVersion: 2,
    createdAt: params.createdAt ?? new Date().toISOString(),
    source: params.source,
    globalHeadAtCreation: params.globalHeadAtCreation ?? null,
    data: params.data,
  }
}

/**
 * Backward-compatible unwrap:
 * - If DB stored the new envelope, return it.
 * - If DB stored the legacy raw BaselineSnapshot, wrap it as an envelope (runtime-only unless caller persists).
 */
export function unwrapBaselineSnapshotStored(
  stored: BaselineSnapshotStored | null | undefined
): { envelope: BaselineSnapshotEnvelope; data: BaselineSnapshot; wasWrapped: boolean } {
  if (isBaselineSnapshotEnvelope(stored)) {
    return { envelope: stored, data: stored.data, wasWrapped: false }
  }
  const legacy = (stored || null) as BaselineSnapshot | null
  const data = legacy || ({
    staff: [],
    specialPrograms: [],
    sptAllocations: [],
    wards: [],
    pcaPreferences: [],
  } as BaselineSnapshot)
  return {
    envelope: buildBaselineSnapshotEnvelope({ data, source: 'migration', globalHeadAtCreation: null }),
    data,
    wasWrapped: true,
  }
}

