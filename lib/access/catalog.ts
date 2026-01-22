import type { FeatureId } from '@/lib/access/types'

export type FeatureGroupId = 'dashboard' | 'schedule' | 'history' | 'accounts'

export type FeatureDefinition = {
  id: FeatureId
  group: FeatureGroupId
  label: string
  description?: string
}

export const FEATURE_CATALOG: FeatureDefinition[] = [
  // Dashboard categories
  {
    id: 'dashboard.category.special-programs',
    group: 'dashboard',
    label: 'Special Programs',
    description: 'Dashboard sidebar: Special Programs panel',
  },
  {
    id: 'dashboard.category.spt-allocations',
    group: 'dashboard',
    label: 'SPT Allocations',
    description: 'Dashboard sidebar: SPT Allocations panel',
  },
  {
    id: 'dashboard.category.pca-preferences',
    group: 'dashboard',
    label: 'PCA Preferences',
    description: 'Dashboard sidebar: PCA Preferences panel',
  },
  {
    id: 'dashboard.category.staff-profile',
    group: 'dashboard',
    label: 'Staff Profile',
    description: 'Dashboard sidebar: Staff Profile panel',
  },
  {
    id: 'dashboard.category.ward-config',
    group: 'dashboard',
    label: 'Ward Config and Bed Stat',
    description: 'Dashboard sidebar: Ward config panel',
  },
  {
    id: 'dashboard.category.team-configuration',
    group: 'dashboard',
    label: 'Team Configuration',
    description: 'Dashboard sidebar: Team configuration panel',
  },
  {
    id: 'dashboard.category.account-management',
    group: 'dashboard',
    label: 'Account Management',
    description: 'Dashboard sidebar: Account management panel',
  },
  {
    id: 'dashboard.category.sync-publish',
    group: 'dashboard',
    label: 'Sync / Publish',
    description: 'Dashboard sidebar: Snapshot sync panel',
  },

  // Schedule diagnostics/tools
  {
    id: 'schedule.diagnostics.load',
    group: 'schedule',
    label: 'Schedule load diagnostics',
    description: 'Show load diagnostics tooltip on “Schedule Allocation” title',
  },
  {
    id: 'schedule.diagnostics.copy',
    group: 'schedule',
    label: 'Copy diagnostics',
    description: 'Show copy-related diagnostic UI (tooltips)',
  },
  {
    id: 'schedule.diagnostics.save',
    group: 'schedule',
    label: 'Save diagnostics',
    description: 'Show save-related diagnostic UI (tooltips)',
  },
  {
    id: 'schedule.diagnostics.snapshot-health',
    group: 'schedule',
    label: 'Snapshot health diagnostics',
    description: 'Show snapshot health diagnostics UI',
  },
  {
    id: 'schedule.tools.reset-to-baseline',
    group: 'schedule',
    label: 'Reset to baseline button',
    description: 'Show “Reset to baseline” under the Clear action',
  },

  // History actions
  {
    id: 'history.delete-schedules',
    group: 'history',
    label: 'Delete schedules',
    description: 'Show delete schedule UI on History page (still enforced by RLS)',
  },

  // Account actions
  {
    id: 'accounts.manage',
    group: 'accounts',
    label: 'Account management actions',
    description: 'Create/edit/delete accounts and change roles (still enforced by API)',
  },
  {
    id: 'accounts.view-auth-email',
    group: 'accounts',
    label: 'View internal auth email',
    description: 'Developer-only “auth email” column (still enforced by API)',
  },
  {
    id: 'accounts.reset-others-password',
    group: 'accounts',
    label: 'Reset others’ passwords',
    description: 'Developer-only reset password tool (still enforced by API)',
  },
]

export const ALL_FEATURE_IDS: FeatureId[] = FEATURE_CATALOG.map((f) => f.id)

