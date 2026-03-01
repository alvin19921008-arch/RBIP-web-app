export type FeedbackType =
  | 'bug'
  | 'wrong_calc'
  | 'ui_issue'
  | 'feature_request'
  | 'question'

export type FeedbackSeverity = 'critical' | 'high' | 'medium' | 'low'

export type FeedbackStatus =
  | 'new'
  | 'in_review'
  | 'in_progress'
  | 'fixed'
  | 'wont_fix'
  | 'duplicate'

export interface FeedbackCategory {
  id: string
  label: string
  subCategories?: { id: string; label: string }[]
}

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  {
    id: 'schedule_workflow',
    label: 'Schedule Workflow',
    subCategories: [
      { id: 'step1_leave_fte', label: 'Step 1 — Leave & FTE' },
      { id: 'step2_therapist_pca', label: 'Step 2 — Therapist / Non-Floating PCA' },
      { id: 'step3_floating_pca', label: 'Step 3 — Floating PCA Wizard' },
      { id: 'step4_bed_relieving', label: 'Step 4 — Bed Relieving' },
      { id: 'step5_review', label: 'Step 5 — Review & Finalization' },
      { id: 'dnd', label: 'Drag & Drop' },
      { id: 'schedule_general', label: 'General Schedule UI' },
    ],
  },
  {
    id: 'dashboard',
    label: 'Dashboard / Config',
    subCategories: [
      { id: 'staff_profiles', label: 'Staff Profiles' },
      { id: 'team_config', label: 'Team Configuration' },
      { id: 'pca_preferences', label: 'PCA Preferences' },
      { id: 'special_programs', label: 'Special Programs' },
      { id: 'ward_config', label: 'Ward Config & Bed Stats' },
      { id: 'spt_allocations', label: 'SPT Allocations' },
      { id: 'sync_publish', label: 'Sync / Publish' },
      { id: 'account_management', label: 'Account Management' },
    ],
  },
  {
    id: 'history',
    label: 'History',
    subCategories: [
      { id: 'history_browsing', label: 'Schedule Browsing' },
      { id: 'history_cleanup', label: 'Cleanup & Deletion' },
    ],
  },
  {
    id: 'help_onboarding',
    label: 'Help & Onboarding',
    subCategories: [
      { id: 'guided_tours', label: 'Guided Tours' },
      { id: 'faq', label: 'FAQ' },
    ],
  },
  {
    id: 'authentication',
    label: 'Authentication',
    subCategories: [
      { id: 'login_logout', label: 'Login / Logout' },
      { id: 'password_profile', label: 'Password & Profile' },
    ],
  },
  {
    id: 'performance',
    label: 'Performance',
    subCategories: [
      { id: 'slow_lag', label: 'Slow / Lag' },
      { id: 'crash_freeze', label: 'Crash / Freeze' },
    ],
  },
  {
    id: 'other',
    label: 'Other / Unsure',
  },
]

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: 'Bug',
  wrong_calc: 'Wrong Calculation',
  ui_issue: 'UI Issue',
  feature_request: 'Feature Request',
  question: 'Question',
}

export const FEEDBACK_SEVERITY_LABELS: Record<FeedbackSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  in_review: 'In Review',
  in_progress: 'In Progress',
  fixed: 'Fixed',
  wont_fix: "Won't Fix",
  duplicate: 'Duplicate',
}

export const SEVERITY_STRIP_COLOR: Record<FeedbackSeverity, string> = {
  critical: 'bg-red-400',
  high: 'bg-amber-400',
  medium: 'bg-sky-400',
  low: 'bg-slate-300',
}

export const STATUS_DOT_COLOR: Record<FeedbackStatus, string> = {
  new: 'bg-sky-500',
  in_review: 'bg-amber-400',
  in_progress: 'bg-blue-500',
  fixed: 'bg-emerald-500',
  wont_fix: 'bg-slate-400',
  duplicate: 'bg-slate-300',
}

/** Types that require severity + steps to reproduce */
export const SEVERITY_TYPES: FeedbackType[] = ['bug', 'wrong_calc']

export function getCategoryLabel(id: string): string {
  return FEEDBACK_CATEGORIES.find(c => c.id === id)?.label ?? id
}

export function getSubCategoryLabel(categoryId: string, subId: string): string {
  const cat = FEEDBACK_CATEGORIES.find(c => c.id === categoryId)
  return cat?.subCategories?.find(s => s.id === subId)?.label ?? subId
}
