import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getRequesterContext } from '@/app/api/accounts/_utils'
import type { AccessControlSettingsV1, AccessRole, FeatureId } from '@/lib/access/types'
import { DEFAULT_ACCESS_CONTROL_SETTINGS } from '@/lib/access/defaults'
import { normalizeAccessControlSettings } from '@/lib/access/normalize'
import { ALL_FEATURE_IDS } from '@/lib/access/catalog'

const SETTINGS_KEY = 'global'
const FEATURE_ID_SET = new Set<string>(ALL_FEATURE_IDS as unknown as string[])

async function ensureSettingsRow(admin: ReturnType<typeof createSupabaseAdminClient>): Promise<AccessControlSettingsV1> {
  const { data, error } = await admin
    .from('access_control_settings')
    .select('settings')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const existing = (data as any)?.settings
  if (existing) return normalizeAccessControlSettings(existing)

  const insertRes = await admin
    .from('access_control_settings')
    .insert({ key: SETTINGS_KEY, settings: DEFAULT_ACCESS_CONTROL_SETTINGS })
    .select('settings')
    .maybeSingle()

  if (insertRes.error) throw new Error(insertRes.error.message)
  return normalizeAccessControlSettings((insertRes.data as any)?.settings)
}

export async function GET() {
  try {
    const { requesterRole } = await getRequesterContext()
    const admin = createSupabaseAdminClient()

    const settings = await ensureSettingsRow(admin)
    return NextResponse.json({ role: requesterRole, settings })
  } catch (e) {
    const message = (e as any)?.message || 'Unexpected error'
    const status = message.startsWith('FORBIDDEN:') ? 403 : 500
    return NextResponse.json({ error: message.replace(/^FORBIDDEN:\s*/, '') }, { status })
  }
}

export async function PUT(req: Request) {
  try {
    const { requesterId, requesterRole } = await getRequesterContext()

    const body = (await req.json().catch(() => ({}))) as {
      targetRole?: AccessRole
      updates?: Record<string, unknown>
    }

    const targetRole = body.targetRole
    if (targetRole !== 'developer' && targetRole !== 'admin' && targetRole !== 'user') {
      return NextResponse.json({ error: 'Invalid targetRole' }, { status: 400 })
    }

    // Hierarchy enforcement:
    // - developer can edit admin + user
    // - admin can edit user only
    // - user cannot edit anything
    if (requesterRole === 'user') {
      throw new Error('FORBIDDEN: users cannot edit access settings')
    }
    if (requesterRole === 'admin' && targetRole !== 'user') {
      throw new Error('FORBIDDEN: admins can only edit user access settings')
    }
    if (requesterRole === 'developer' && targetRole === 'developer') {
      throw new Error('FORBIDDEN: developer access settings are read-only')
    }

    const updatesRaw = (body.updates || {}) as Record<string, unknown>
    const updates: Partial<Record<FeatureId, boolean>> = {}
    Object.entries(updatesRaw).forEach(([k, v]) => {
      if (!FEATURE_ID_SET.has(k)) return
      if (typeof v !== 'boolean') return
      updates[k as FeatureId] = v
    })

    const admin = createSupabaseAdminClient()
    const current = await ensureSettingsRow(admin)
    const next = normalizeAccessControlSettings({
      ...current,
      roles: {
        ...current.roles,
        [targetRole]: { ...current.roles[targetRole], ...updates },
      },
    })

    const { data, error } = await admin
      .from('access_control_settings')
      .update({ settings: next, updated_by: requesterId, updated_at: new Date().toISOString() })
      .eq('key', SETTINGS_KEY)
      .select('settings')
      .maybeSingle()

    if (error) throw new Error(error.message)
    const saved = normalizeAccessControlSettings((data as any)?.settings)

    return NextResponse.json({ role: requesterRole, settings: saved })
  } catch (e) {
    const message = (e as any)?.message || 'Unexpected error'
    const status = message.startsWith('FORBIDDEN:') ? 403 : 500
    return NextResponse.json({ error: message.replace(/^FORBIDDEN:\s*/, '') }, { status })
  }
}

