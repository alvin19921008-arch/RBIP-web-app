import type { DevLeaveSimDebugBundle } from '@/lib/dev/leaveSim/types'

export function serializeDevLeaveSimBundle(bundle: DevLeaveSimDebugBundle): string {
  return JSON.stringify(bundle, null, 2)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

export function parseDevLeaveSimBundle(text: string): { ok: true; bundle: DevLeaveSimDebugBundle } | { ok: false; error: string } {
  let raw: any
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as any)?.message ?? String(e)}` }
  }

  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Bundle must be an object.' }
  if (raw.schemaVersion !== 1) return { ok: false, error: 'Unsupported bundle schemaVersion (expected 1).' }
  if (!isNonEmptyString(raw.dateKey)) return { ok: false, error: 'Missing/invalid dateKey.' }
  if (!isNonEmptyString(raw.exportedAt)) return { ok: false, error: 'Missing/invalid exportedAt.' }
  if (!raw.draft || typeof raw.draft !== 'object') return { ok: false, error: 'Missing/invalid draft.' }
  if (raw.draft.schemaVersion !== 1) return { ok: false, error: 'Unsupported draft schemaVersion (expected 1).' }
  if (!Array.isArray(raw.draft.patches)) return { ok: false, error: 'draft.patches must be an array.' }
  if (!raw.draft.config || typeof raw.draft.config !== 'object') return { ok: false, error: 'Missing/invalid draft.config.' }
  if (!isNonEmptyString(raw.draft.seedUsed)) return { ok: false, error: 'Missing/invalid draft.seedUsed.' }

  return { ok: true, bundle: raw as DevLeaveSimDebugBundle }
}

