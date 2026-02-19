import type { HelpMediaKey } from '@/lib/help/helpMedia'

export type FaqItem = {
  id: string
  question: string
  answer: string
  answerKind?: 'dashboard-sync-publish' | 'staff-card-color-guide' | 'snapshot-reminder'
  answerMediaKey?: HelpMediaKey
  audience?: 'all' | 'admin'
}

export type FaqSection = {
  id: string
  title: string
  context?: 'all' | 'schedule' | 'dashboard'
  items: FaqItem[]
}

export const HELP_FAQ_SECTIONS: FaqSection[] = [
  {
    id: 'daily-workflow',
    title: 'Daily Workflow',
    context: 'schedule',
    items: [
      {
        id: 'start-today',
        question: 'How do I start “today” quickly?',
        answer:
          'Use Copy and choose “Copy from last working day”. Then adjust Step 1 to Step 5 for today.',
      },
      {
        id: 'copy-scope',
        question: 'What does copy include and what should I still check?',
        answer:
          'Copy is a baseline starter. Always re-check leave/FTE in Step 1 and rerun downstream steps as needed.',
      },
      {
        id: 'step-order',
        question: 'What is the intended order of work?',
        answer:
          'Follow Step 1 to Step 5 in sequence. Many actions are intentionally step-gated.',
      },
      {
        id: 'disabled-actions',
        question: 'Why are some actions disabled?',
        answer:
          'Most actions are step-locked. Switch to the correct step (for example Step 1 for leave edits, Step 3 for floating PCA actions).',
      },
      {
        id: 'step1-batch-leave',
        question: 'How do I batch-edit leave and availability in Step 1?',
        answer:
          'Open Step 1 → Leave setup dialog.\n\n- Step 1.1: Add staff into the draft list.\n- Step 1.2: Edit therapist leave + FTE on-duty (bulk actions supported).\n- Step 1.3: Edit PCA A/V slots (each slot = 0.25 FTE) and optionally record partial presence.\n- Step 1.4: Preview, then Save & Apply.',
      },
    ],
  },
  {
    id: 'beds-and-summary',
    title: 'Beds and Summary',
    context: 'schedule',
    items: [
      {
        id: 'summary-box',
        question: 'What should I watch in the summary info box?',
        answer:
          'Track Total bed counts, After SHS/students, Total PT, Total PCA, and Beds/PT for quick quality checks.',
        answerMediaKey: 'summaryInfoGif',
      },
      {
        id: 'bed-adjustments',
        question: 'How do I adjust total beds for SHS and student placements?',
        answer:
          'Use the pencil next to Total beds in the team calculation block, then fill SHS and Students under Adjustments.',
      },
      {
        id: 'after-deductions',
        question: 'Why is “After SHS/students” different from Total bed counts?',
        answer:
          'After SHS/students is the effective total after deductions, while Total bed counts is the base value.',
      },
      {
        id: 'bed-relieving-editing',
        question: 'Why can’t I edit bed relieving right now?',
        answer:
          'Bed relieving editing is available only in Step 4. Switch to Step 4 to edit Takes/Releases.',
      },
    ],
  },
  {
    id: 'step2-3',
    title: 'Step 2 and Step 3',
    context: 'schedule',
    items: [
      {
        id: 'staff-pool-purpose',
        question: 'What is Staff Pool used for?',
        answer:
          'Staff Pool is your source list for drag-and-drop and contextual actions like assign slot and move slot.',
        answerMediaKey: 'staffPoolGif',
      },
      {
        id: 'step2-focus',
        question: 'What should I focus on in Step 2?',
        answer:
          'Resolve therapist and non-floating PCA assignments first so Step 3 floating PCA starts from correct inputs.',
      },
      {
        id: 'staff-card-color-legend',
        question: 'What do the staff card border and fill colors mean?',
        answer: 'See the guide below.',
        answerKind: 'staff-card-color-guide',
      },
      {
        id: 'context-menu',
        question: 'How do I open contextual actions?',
        answer:
          'Use the pencil action on staff cards (or context click where available) to access assign, move, split/merge, and discard actions.',
        answerMediaKey: 'contextualMenuGif',
      },
      {
        id: 'drag-vs-menu',
        question: 'When should I drag-and-drop versus use the menu?',
        answer:
          'Use drag-and-drop for fast replacement. Use menu actions when you need exact slot-level control.',
      },
    ],
  },
  {
    id: 'schedule-admin',
    title: 'Schedule (Admin)',
    context: 'schedule',
    items: [
      {
        id: 'snapshot-reminder',
        question: 'What does "saved setup snapshot" reminder mean?',
        answer: 'See details below.',
        answerKind: 'snapshot-reminder',
        audience: 'admin',
      },
    ],
  },
  {
    id: 'dashboard-admin',
    title: 'Dashboard (Admin)',
    context: 'dashboard',
    items: [
      {
        id: 'sync-publish-purpose',
        question: 'When should I use Sync / Publish?',
        answer: 'See details below.',
        answerKind: 'dashboard-sync-publish',
        audience: 'admin',
      },
    ],
  },
]

