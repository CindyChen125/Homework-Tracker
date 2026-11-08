import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllPages } from './pagination'
import { sortFeedback, validateFeedback, validateFeedbackReply, type FeedbackReply, type FeedbackReport, type FeedbackStatus, type NewFeedback } from './feedback'

export interface FeedbackStore {
  list(): Promise<FeedbackReport[]>
  create(input: NewFeedback): Promise<string>
  replies(reportId: string): Promise<FeedbackReply[]>
  reply(reportId: string, body: string): Promise<void>
  setStatus(reportId: string, status: FeedbackStatus): Promise<void>
  remove(reportId: string): Promise<void>
}

export class FeedbackSetupError extends Error {
  constructor() { super('Feedback Center needs its database migration. An administrator must review and apply it first.') }
}

function check<T extends { error: { code?: string; message: string } | null }>(result: T): T {
  if (result.error) {
    if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(result.error.code ?? '')) throw new FeedbackSetupError()
    throw new Error(result.error.message)
  }
  return result
}

export function supabaseFeedbackStore(sb: SupabaseClient): FeedbackStore {
  return {
    async list() {
      const rows = await fetchAllPages<FeedbackReport>(async (from, to) =>
        check(await sb.from('feedback_reports').select('*').order('created_at', { ascending: false }).order('id').range(from, to)).data ?? [])
      return sortFeedback(rows)
    },
    async create(input) {
      validateFeedback(input)
      const row = { ...input, title: input.title.trim(), description: input.description.trim() }
      return check(await sb.from('feedback_reports').insert(row).select('id').single()).data!.id as string
    },
    async replies(reportId) {
      return fetchAllPages<FeedbackReply>(async (from, to) =>
        check(await sb.from('feedback_replies').select('*').eq('report_id', reportId).order('created_at').order('id').range(from, to)).data ?? [])
    },
    async reply(reportId, body) {
      validateFeedbackReply(body)
      check(await sb.from('feedback_replies').insert({ report_id: reportId, body: body.trim() }).select('id').single())
    },
    async setStatus(reportId, status) {
      if (!(status in { open: true, in_progress: true, resolved: true })) throw new Error('Choose a valid status.')
      check(await sb.from('feedback_reports').update({ status }).eq('id', reportId).select('id').single())
    },
    async remove(reportId) {
      check(await sb.from('feedback_reports').delete().eq('id', reportId).select('id').single())
    },
  }
}

type DemoAccount = { id: string; role: string; name?: string | null; email?: string }
export function demoFeedbackStore(account: () => Promise<DemoAccount | null>, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): FeedbackStore {
  const REPORTS = 'hw-demo-feedback', REPLIES = 'hw-demo-feedback-replies'
  const read = <T>(key: string): T[] => JSON.parse(storage.getItem(key) ?? '[]') as T[]
  const write = (key: string, rows: unknown[]) => {
    try { storage.setItem(key, JSON.stringify(rows)) }
    catch { throw new Error('This browser has no room left to save feedback.') }
  }
  const requireUser = async () => { const user = await account(); if (!user) throw new Error('Sign in first.'); return user }
  const canSee = (report: FeedbackReport, user: DemoAccount) => report.visibility === 'public' || report.author_id === user.id || user.role === 'admin'
  return {
    async list() { const user = await requireUser(); return sortFeedback(read<FeedbackReport>(REPORTS).filter(report => canSee(report, user))) },
    async create(input) {
      const user = await requireUser(); validateFeedback(input); const now = new Date().toISOString(), id = crypto.randomUUID()
      write(REPORTS, [{ ...input, id, author_id: user.id, author_name: user.name || 'Classmate', title: input.title.trim(), description: input.description.trim(), status: 'open', created_at: now, updated_at: now }, ...read<FeedbackReport>(REPORTS)])
      return id
    },
    async replies(reportId) {
      const user = await requireUser(), report = read<FeedbackReport>(REPORTS).find(row => row.id === reportId)
      if (!report || !canSee(report, user)) throw new Error('This report is not available.')
      return read<FeedbackReply>(REPLIES).filter(reply => reply.report_id === reportId).sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    },
    async reply(reportId, body) {
      const user = await requireUser(); validateFeedbackReply(body)
      const report = read<FeedbackReport>(REPORTS).find(row => row.id === reportId)
      if (!report || !canSee(report, user)) throw new Error('You cannot reply to this report.')
      write(REPLIES, [...read<FeedbackReply>(REPLIES), { id: crypto.randomUUID(), report_id: reportId, author_id: user.id, author_name: user.name || 'Classmate', author_role: user.role as FeedbackReply['author_role'], body: body.trim(), created_at: new Date().toISOString() }])
    },
    async setStatus(reportId, status) {
      const user = await requireUser(); if (user.role !== 'admin') throw new Error('Only administrators can change feedback status.')
      const rows = read<FeedbackReport>(REPORTS); if (!rows.some(row => row.id === reportId)) throw new Error('This report no longer exists.')
      write(REPORTS, rows.map(row => row.id === reportId ? { ...row, status, updated_at: new Date().toISOString() } : row))
    },
    async remove(reportId) {
      const user = await requireUser(); if (user.role !== 'admin') throw new Error('Only administrators can delete feedback.')
      write(REPORTS, read<FeedbackReport>(REPORTS).filter(row => row.id !== reportId))
      write(REPLIES, read<FeedbackReply>(REPLIES).filter(reply => reply.report_id !== reportId))
    },
  }
}
