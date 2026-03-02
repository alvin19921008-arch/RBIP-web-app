import type { AccessControlSettingsV1, AccessRole, FeatureId, RoleFeatureMap } from '@/lib/access/types'
import { ALL_FEATURE_IDS } from '@/lib/access/catalog'

const allEnabled = (): RoleFeatureMap => {
  const out: RoleFeatureMap = {}
  ALL_FEATURE_IDS.forEach((id) => {
    out[id] = true
  })
  return out
}

const dashboardOnly = (enabledCategoryIds: FeatureId[]): RoleFeatureMap => {
  const out: RoleFeatureMap = {}
  ALL_FEATURE_IDS.forEach((id) => {
    out[id] = enabledCategoryIds.includes(id)
  })
  return out
}

export const DEFAULT_ACCESS_CONTROL_SETTINGS: AccessControlSettingsV1 = {
  version: 1,
  roles: {
    // Developer can see everything by default.
    developer: allEnabled(),
    // Admin can see/config most things but not developer-only diagnostics/actions by default.
    admin: {
      ...allEnabled(),
      'accounts.view-auth-email': false,
      'accounts.reset-others-password': false,
      'schedule.diagnostics.load': false,
      'schedule.diagnostics.copy': false,
      'schedule.diagnostics.save': false,
      'schedule.diagnostics.snapshot-health': false,
      'schedule.tools.reset-to-baseline': false,
      // Admins can submit feedback but cannot access the review page
      'feedback.review': false,
    },
    // Users can access /dashboard, but start with no panels enabled until configured.
    // Users get feedback nav link + float button by default; review is developer-only.
    user: {
      ...dashboardOnly([]),
      'feedback.nav-link': true,
      'feedback.float-button': true,
      'feedback.review': false,
    },
  },
}

export function isRoleAtLeast(role: AccessRole, minRole: AccessRole): boolean {
  const rank: Record<AccessRole, number> = { user: 0, admin: 1, developer: 2 }
  return rank[role] >= rank[minRole]
}

