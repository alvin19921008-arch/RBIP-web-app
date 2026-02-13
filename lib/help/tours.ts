'use client'

export type HelpTourId = 'schedule-core' | 'dashboard-admin'

export type HelpTourStep = {
  selector: string
  title: string
  description: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

export const HELP_TOUR_PENDING_KEY = 'rbipHelp.pendingTour'

export const HELP_TOURS: Record<HelpTourId, { title: string; steps: HelpTourStep[] }> = {
  'schedule-core': {
    title: 'Schedule Core Tour',
    steps: [
      {
        selector: '[data-tour="schedule-copy"]',
        title: 'Start From Copy',
        description: 'For day-to-day work, start by copying from the last working day, then adjust for today.',
        side: 'bottom',
      },
      {
        selector: '[data-tour="staff-pool"]',
        title: 'Staff Pool',
        description: 'This is the source pool. Use drag and contextual actions to place or adjust staff.',
        side: 'right',
      },
      {
        selector: '[data-tour="step-indicator"]',
        title: 'Step-Wise Workflow',
        description: 'Work in order from Step 1 to Step 5. Some actions are locked until the correct step.',
      },
      {
        selector: '[data-tour="step-1"]',
        title: 'Step 1: Leave & FTE',
        description: 'Confirm leave and FTE first so all later calculations start from correct inputs.',
      },
      {
        selector: '[data-tour="step-2"]',
        title: 'Step 2: Therapist & Non-Floating PCA',
        description: 'Resolve therapist and non-floating assignments before running floating PCA logic.',
      },
      {
        selector: '[data-tour="step-3"]',
        title: 'Step 3: Floating PCA',
        description: 'This is the main balancing step across teams and slots.',
      },
      {
        selector: '[data-tour="step3-interactions"]',
        title: 'Step 3 Interactions',
        description: 'Use drag-and-drop for speed, and the pencil/context menu for precise slot edits.',
        side: 'left',
      },
      {
        selector: '[data-tour="bed-adjustments"]',
        title: 'Bed Adjustments',
        description: 'Adjust total beds for SHS and student placements when needed.',
      },
      {
        selector: '[data-tour="summary-box"]',
        title: 'Summary Info Box',
        description: 'Watch Total beds, After SHS/students, PT/PCA totals, and Beds/PT as your quick health check.',
      },
      {
        selector: '[data-tour="bed-relieving"]',
        title: 'Bed Relieving Block',
        description: 'Fill Takes/Releases in Step 4. Editing is intentionally restricted to that step.',
        side: 'left',
      },
      {
        selector: '[data-tour="step-5"]',
        title: 'Step 5: Review',
        description: 'Finish by reviewing results and edge cases before finalizing the schedule.',
      },
      {
        selector: '[data-tour="schedule-help"]',
        title: 'Replay Help Anytime',
        description: 'Use this Help button whenever you want to rerun the tour or open FAQ.',
        side: 'bottom',
      },
    ],
  },
  'dashboard-admin': {
    title: 'Dashboard Admin Tour',
    steps: [
      {
        selector: '[data-tour="dashboard-nav-special-programs"]',
        title: 'Special Programs',
        description: 'Configure program staffing requirements and impacts before schedule allocation.',
      },
      {
        selector: '[data-tour="dashboard-nav-pca-preferences"]',
        title: 'PCA Preferences',
        description: 'Team preferences here influence Step 3 outcomes on the Schedule page.',
      },
      {
        selector: '[data-tour="dashboard-nav-spt-allocations"]',
        title: 'SPT Allocations',
        description: 'Define SPT team and weekday allocation inputs used by scheduling logic.',
      },
      {
        selector: '[data-tour="dashboard-nav-sync-publish"]',
        title: 'Sync / Publish',
        description: 'Admin-only area for snapshot and global config synchronization.',
      },
    ],
  },
}

