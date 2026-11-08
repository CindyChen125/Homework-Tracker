export type FeedbackCategory = 'bug' | 'feature' | 'other'
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved'
export type FeedbackVisibility = 'public' | 'private'

export interface FeedbackReport {
  id: string
  author_id: string
  author_name: string
  category: FeedbackCategory
  title: string
  description: string
  visibility: FeedbackVisibility
  status: FeedbackStatus
  created_at: string
  updated_at: string
}

export interface FeedbackReply {
  id: string
  report_id: string
  author_id: string
  author_name: string
  author_role: 'reader' | 'editor' | 'admin'
  body: string
  created_at: string
}

export type NewFeedback = Pick<FeedbackReport, 'category' | 'title' | 'description' | 'visibility'>

export const FEEDBACK_CATEGORIES: Record<FeedbackCategory, string> = {
  bug: 'Bug Report',
  feature: 'Feature Suggestion',
  other: 'Other Feedback',
}

export const FEEDBACK_STATUSES: Record<FeedbackStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
}

export const FEEDBACK_LIMITS = { title: 120, description: 4000, reply: 3000 } as const

export function validateFeedback(input: NewFeedback) {
  const title = input.title.trim(), description = input.description.trim()
  if (!(input.category in FEEDBACK_CATEGORIES)) throw new Error('Choose a feedback category.')
  if (!['public', 'private'].includes(input.visibility)) throw new Error('Choose who may see this report.')
  if (title.length < 3 || title.length > FEEDBACK_LIMITS.title) throw new Error(`Use a title between 3 and ${FEEDBACK_LIMITS.title} characters.`)
  if (description.length < 10 || description.length > FEEDBACK_LIMITS.description) throw new Error(`Use a description between 10 and ${FEEDBACK_LIMITS.description} characters.`)
}

export function validateFeedbackReply(body: string) {
  const length = body.trim().length
  if (!length) throw new Error('Write a reply first.')
  if (length > FEEDBACK_LIMITS.reply) throw new Error(`Keep replies under ${FEEDBACK_LIMITS.reply} characters.`)
}

export function sortFeedback(reports: FeedbackReport[]) {
  const rank: Record<FeedbackStatus, number> = { open: 0, in_progress: 1, resolved: 2 }
  return [...reports].sort((a, b) => rank[a.status] - rank[b.status] || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
}
