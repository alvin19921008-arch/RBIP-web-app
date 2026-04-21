/** GET /api/feedback?mode=review&status=new&badge=1 — head count only; JSON omits full `reports` list */
export const FEEDBACK_REVIEW_BADGE_URL =
  '/api/feedback?mode=review&status=new&badge=1' as const

export interface FeedbackReviewBadgeResponse {
  newReportCount: number
}
