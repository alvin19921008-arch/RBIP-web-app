import type { AccessControlSettingsV1, AccessRole, FeatureId, RoleFeatureMap } from '@/lib/access/types'
import { DEFAULT_ACCESS_CONTROL_SETTINGS } from '@/lib/access/defaults'
import { ALL_FEATURE_IDS } from '@/lib/access/catalog'

export function normalizeAccessControlSettings(input: any): AccessControlSettingsV1 {
  const base = DEFAULT_ACCESS_CONTROL_SETTINGS

  const safeVersion = input?.version === 1 ? 1 : 1
  const rolesRaw = (input?.roles || {}) as Partial<Record<AccessRole, any>>

  const normalizeRole = (role: AccessRole): RoleFeatureMap => {
    const raw = (rolesRaw as any)?.[role]
    const out: RoleFeatureMap = {}
    ALL_FEATURE_IDS.forEach((id: FeatureId) => {
      const v = raw?.[id]
      const fallback = (base.roles[role] as any)?.[id]
      out[id] = typeof v === 'boolean' ? v : typeof fallback === 'boolean' ? fallback : false
    })
    return out
  }

  return {
    version: safeVersion,
    roles: {
      developer: normalizeRole('developer'),
      admin: normalizeRole('admin'),
      user: normalizeRole('user'),
    },
  }
}

export function canFeature(settings: AccessControlSettingsV1, role: AccessRole, featureId: FeatureId): boolean {
  const v = settings?.roles?.[role]?.[featureId]
  return v === true
}

