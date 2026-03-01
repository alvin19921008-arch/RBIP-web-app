import type { FeedbackType, FeedbackSeverity, FeedbackStatus } from './categories'

export interface FeedbackAutoContext {
  url: string
  userRole: string
  browser: string
  os: string
  timestamp: string
  workflowStep?: number | null
  scheduleDate?: string | null
  viewportSize: string
}

export interface FeedbackReport {
  id: string
  ticket_number: number
  submitter_id: string
  submitter_name: string | null
  type: FeedbackType
  severity: FeedbackSeverity | null
  category: string
  sub_category: string | null
  title: string
  description: string
  steps_to_reproduce: string | null
  screenshot_url: string | null
  auto_context: FeedbackAutoContext | null
  upvote_count: number
  status: FeedbackStatus
  is_priority: boolean
  dev_notes: string | null
  dev_reply: string | null
  reply_read: boolean
  created_at: string
  updated_at: string
}

export interface FeedbackUpvote {
  id: string
  report_id: string
  user_id: string
  created_at: string
}

export interface SubmitFeedbackPayload {
  type: FeedbackType
  severity?: FeedbackSeverity | null
  category: string
  sub_category?: string | null
  title: string
  description: string
  steps_to_reproduce?: string | null
  screenshot_url?: string | null
  auto_context?: FeedbackAutoContext | null
  submitter_name?: string | null
}

export interface UpdateFeedbackPayload {
  id: string
  status?: FeedbackStatus
  is_priority?: boolean
  dev_notes?: string | null
  dev_reply?: string | null
}
