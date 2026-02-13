export type FaqItem = {
  id: string
  question: string
  answer: string
  audience?: 'all' | 'admin'
}

export type FaqSection = {
  id: string
  title: string
  items: FaqItem[]
}

export const HELP_FAQ_SECTIONS: FaqSection[] = [
  {
    id: 'daily-workflow',
    title: 'Daily Workflow',
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
    ],
  },
  {
    id: 'beds-and-summary',
    title: 'Beds and Summary',
    items: [
      {
        id: 'summary-box',
        question: 'What should I watch in the summary info box?',
        answer:
          'Track Total bed counts, After SHS/students, Total PT, Total PCA, and Beds/PT for quick quality checks.',
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
    items: [
      {
        id: 'staff-pool-purpose',
        question: 'What is Staff Pool used for?',
        answer:
          'Staff Pool is your source list for drag-and-drop and contextual actions like assign slot and move slot.',
      },
      {
        id: 'step2-focus',
        question: 'What should I focus on in Step 2?',
        answer:
          'Resolve therapist and non-floating PCA assignments first so Step 3 floating PCA starts from correct inputs.',
      },
      {
        id: 'step3-focus',
        question: 'What are the most important Step 3 interactions?',
        answer:
          'Use drag-and-drop for fast placement and the contextual menu for precise slot edits.',
      },
      {
        id: 'context-menu',
        question: 'How do I open contextual actions?',
        answer:
          'Use the pencil action on staff cards (or context click where available) to access assign, move, split/merge, and discard actions.',
      },
      {
        id: 'drag-vs-menu',
        question: 'When should I drag-and-drop versus use the menu?',
        answer:
          'Use drag-and-drop for speed. Use menu actions when you need exact slot-level control.',
      },
    ],
  },
  {
    id: 'admin',
    title: 'Admin FAQ',
    items: [
      {
        id: 'snapshot-reminder',
        question: 'What does “saved setup snapshot” reminder mean?',
        answer:
          'The schedule is using a saved date snapshot that differs from current dashboard config. Admins can review and sync in Dashboard.',
        audience: 'admin',
      },
      {
        id: 'sync-publish-purpose',
        question: 'When should I use Sync / Publish?',
        answer:
          'Use Sync / Publish when you intentionally want to align date snapshots with Global config or publish snapshot changes to Global.',
        audience: 'admin',
      },
    ],
  },
]

