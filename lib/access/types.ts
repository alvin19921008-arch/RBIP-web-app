export type AccessRole = 'developer' | 'admin' | 'user'

// Keep feature IDs stable; these are persisted in DB settings JSON.
export type FeatureId =
  // Dashboard categories (sidebar + panels)
  | 'dashboard.category.special-programs'
  | 'dashboard.category.spt-allocations'
  | 'dashboard.category.pca-preferences'
  | 'dashboard.pca-preferences.scarcity-threshold'
  | 'dashboard.category.staff-profile'
  | 'dashboard.category.ward-config'
  | 'dashboard.category.team-configuration'
  | 'dashboard.category.account-management'
  | 'dashboard.category.sync-publish'
  | 'dashboard.sync-publish.show-internal-config-version'
  // Schedule diagnostics/tools
  | 'schedule.diagnostics.load'
  | 'schedule.diagnostics.copy'
  | 'schedule.diagnostics.save'
  | 'schedule.diagnostics.snapshot-health'
  | 'schedule.tools.reset-to-baseline'
  // History actions
  | 'history.delete-schedules'
  // Account management actions
  | 'accounts.manage'
  | 'accounts.view-auth-email'
  | 'accounts.reset-others-password'

export type RoleFeatureMap = Partial<Record<FeatureId, boolean>>

export type AccessControlSettingsV1 = {
  version: 1
  roles: Record<AccessRole, RoleFeatureMap>
}

export type AccessControlResponse = {
  role: AccessRole
  settings: AccessControlSettingsV1
}

