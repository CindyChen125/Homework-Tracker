import { useEffect, useMemo, useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import { TopBar } from '../components/ui'
import { FEEDBACK_CATEGORIES, FEEDBACK_LIMITS, FEEDBACK_STATUSES, sortFeedback, type FeedbackCategory, type FeedbackReply, type FeedbackReport, type FeedbackStatus, type FeedbackVisibility, validateFeedback, validateFeedbackReply } from '../lib/feedback'
import { store } from '../lib/store'

const stamp = (value: string) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Feedback({ data }: { data: AppData }) {
  const [reports, setReports] = useState<FeedbackReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [query, setQuery] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? ''))
  const [category, setCategory] = useState<FeedbackCategory | ''>('')
  const [status, setStatus] = useState<FeedbackStatus | ''>('')
  const [visibility, setVisibility] = useState<FeedbackVisibility | ''>('')
  const selectedId = query.get('id')
  const selected = selectedId ? reports.find(report => report.id === selectedId) : null

  const load = async () => {
    try { setReports(await store.feedback.list()); setError(null) }
    catch (cause) { setError((cause as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    const change = () => setQuery(new URLSearchParams(location.hash.split('?')[1] ?? ''))
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])

  const filtered = useMemo(() => sortFeedback(reports.filter(report =>
    (!category || report.category === category) && (!status || report.status === status) && (!visibility || report.visibility === visibility))), [reports, category, status, visibility])

  return <>
    <TopBar user={data.user} />
    <header className="page-head feedback-head">
      <div className="page-head-text"><h1>Feedback Center</h1></div>
      {!selectedId && <button className="btn-primary feedback-new" onClick={() => setComposing(value => !value)} aria-expanded={composing}>
        <Icon name={composing ? 'close' : 'plus'} size={17} />{composing ? 'Cancel' : 'New report'}
      </button>}
    </header>
    <p className="lead">Report a problem, suggest an improvement, or discuss an idea with the class and administrators.</p>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert" role="status">{notice}</div>}

    {selectedId ? selected ? <FeedbackDetail report={selected} data={data} onChanged={load} setError={setError} setNotice={setNotice} />
      : loading ? <div className="empty">Loading report…</div>
        : <div className="empty">This report is unavailable or private. <a href="#/feedback">View feedback</a></div>
      : <>
        {composing && <FeedbackForm onCreated={async id => { setComposing(false); await load(); location.hash = `#/feedback?id=${id}` }} />}
        <section className="feedback-browser" aria-label="Feedback reports">
          <div className="feedback-filters">
            <label className="field"><span className="field-label">Category</span><select value={category} onChange={event => setCategory(event.target.value as FeedbackCategory | '')}>
              <option value="">All categories</option>{Object.entries(FEEDBACK_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label className="field"><span className="field-label">Status</span><select value={status} onChange={event => setStatus(event.target.value as FeedbackStatus | '')}>
              <option value="">All statuses</option>{Object.entries(FEEDBACK_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label className="field"><span className="field-label">Visibility</span><select value={visibility} onChange={event => setVisibility(event.target.value as FeedbackVisibility | '')}>
              <option value="">All visible reports</option><option value="public">Public</option><option value="private">Private</option>
            </select></label>
          </div>
          {loading ? <div className="empty">Loading feedback…</div> : filtered.length ? <div className="feedback-list">
            {filtered.map(report => <a key={report.id} className="feedback-row" href={`#/feedback?id=${report.id}`}>
              <div className="feedback-row-main">
                <div className="feedback-badges"><StatusBadge status={report.status} /><span className="feedback-category">{FEEDBACK_CATEGORIES[report.category]}</span>{report.visibility === 'private' && <span className="feedback-private">Private</span>}</div>
                <h2>{report.title}</h2>
                <p>{report.description}</p>
                <span className="feedback-meta">{report.author_name} · <time dateTime={report.created_at}>{stamp(report.created_at)}</time></span>
              </div>
              <Icon name="right" size={17} />
            </a>)}
          </div> : <div className="empty">{reports.length ? 'No reports match these filters.' : 'No feedback has been submitted yet.'}</div>}
        </section>
      </>}
  </>
}

function FeedbackForm({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const [category, setCategory] = useState<FeedbackCategory>('bug'), [title, setTitle] = useState(''), [description, setDescription] = useState(''), [visibility, setVisibility] = useState<FeedbackVisibility>('public')
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return
    const input = { category, title: title.trim(), description: description.trim(), visibility }
    try { validateFeedback(input); setBusy(true); setError(null); await onCreated(await store.feedback.create(input)) }
    catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  return <form className="card feedback-form" onSubmit={submit} aria-busy={busy}>
    <div><h2>New report</h2><p className="small muted">Public reports can be discussed by the class. Private reports are limited to you and administrators.</p></div>
    <div className="two-col">
      <label className="field"><span className="field-label">Category</span><select value={category} onChange={event => setCategory(event.target.value as FeedbackCategory)}>{Object.entries(FEEDBACK_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span className="field-label">Visibility</span><select value={visibility} onChange={event => setVisibility(event.target.value as FeedbackVisibility)}><option value="public">Public</option><option value="private">Private</option></select></label>
    </div>
    <label className="field"><span className="field-label">Title <span className="faint">· {title.trim().length}/{FEEDBACK_LIMITS.title}</span></span><input value={title} maxLength={FEEDBACK_LIMITS.title} onChange={event => setTitle(event.target.value)} placeholder="A short summary" required /></label>
    <label className="field"><span className="field-label">Description <span className="faint">· {description.trim().length}/{FEEDBACK_LIMITS.description}</span></span><textarea value={description} maxLength={FEEDBACK_LIMITS.description} rows={6} onChange={event => setDescription(event.target.value)} placeholder="What happened, or what would you like to change?" required /></label>
    {error && <div className="alert error" role="alert">{error}</div>}
    <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button>
  </form>
}

function FeedbackDetail({ report, data, onChanged, setError, setNotice }: { report: FeedbackReport; data: AppData; onChanged: () => Promise<void>; setError: (value: string | null) => void; setNotice: (value: string | null) => void }) {
  const [replies, setReplies] = useState<FeedbackReply[]>([]), [loading, setLoading] = useState(true), [body, setBody] = useState(''), [busy, setBusy] = useState(false)
  const loadReplies = async () => { try { setReplies(await store.feedback.replies(report.id)); setError(null) } catch (cause) { setError((cause as Error).message) } finally { setLoading(false) } }
  useEffect(() => { setLoading(true); void loadReplies() }, [report.id])
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return
    try { validateFeedbackReply(body); setBusy(true); setError(null); await store.feedback.reply(report.id, body.trim()); setBody(''); await loadReplies(); setNotice('Reply posted.') }
    catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const changeStatus = async (status: FeedbackStatus) => {
    if (busy || status === report.status) return
    try { setBusy(true); setError(null); await store.feedback.setStatus(report.id, status); await onChanged(); setNotice(`Status changed to ${FEEDBACK_STATUSES[status]}.`) }
    catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (busy || !window.confirm(`Delete “${report.title}” and all of its replies? This cannot be undone.`)) return
    try { setBusy(true); setError(null); await store.feedback.remove(report.id); location.hash = '#/feedback' }
    catch (cause) { setError((cause as Error).message); setBusy(false) }
  }
  return <article className="feedback-detail">
    <a className="link-btn feedback-back" href="#/feedback"><Icon name="left" size={15} />All feedback</a>
    <header className="feedback-detail-head">
      <div className="feedback-badges"><StatusBadge status={report.status} /><span className="feedback-category">{FEEDBACK_CATEGORIES[report.category]}</span><span className={report.visibility === 'private' ? 'feedback-private' : 'feedback-public'}>{report.visibility === 'private' ? 'Private' : 'Public'}</span></div>
      <h2>{report.title}</h2>
      <p className="feedback-meta">Submitted by {report.author_name} · <time dateTime={report.created_at}>{stamp(report.created_at)}</time></p>
      <p className="feedback-description">{report.description}</p>
      {data.admin && <div className="feedback-admin">
        <label className="field"><span className="field-label">Status</span><select value={report.status} disabled={busy} onChange={event => void changeStatus(event.target.value as FeedbackStatus)}>{Object.entries(FEEDBACK_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="btn danger" disabled={busy} onClick={() => void remove()}><Icon name="trash" size={15} />Delete report</button>
      </div>}
    </header>
    <section className="feedback-thread" aria-labelledby="feedback-replies-title">
      <h2 id="feedback-replies-title">Replies <span className="count">{replies.length}</span></h2>
      {loading ? <div className="empty">Loading replies…</div> : replies.length ? <div className="feedback-replies">{replies.map(reply => <article key={reply.id} className={`feedback-reply${reply.author_role === 'admin' ? ' admin' : ''}`}>
        <div className="feedback-reply-head"><strong>{reply.author_name}</strong>{reply.author_role === 'admin' && <span>Admin</span>}<time dateTime={reply.created_at}>{stamp(reply.created_at)}</time></div>
        <p>{reply.body}</p>
      </article>)}</div> : <div className="empty">No replies yet. Start the discussion below.</div>}
      <form className="feedback-reply-form" onSubmit={send} aria-busy={busy}>
        <label className="field"><span className="field-label">Add a reply <span className="faint">· {body.trim().length}/{FEEDBACK_LIMITS.reply}</span></span><textarea value={body} maxLength={FEEDBACK_LIMITS.reply} rows={4} onChange={event => setBody(event.target.value)} placeholder="Write a helpful reply" required /></label>
        <button className="btn-primary" disabled={busy}>{busy ? 'Posting…' : 'Post reply'}</button>
      </form>
    </section>
  </article>
}

function StatusBadge({ status }: { status: FeedbackStatus }) {
  return <span className={`feedback-status status-${status}`}>{FEEDBACK_STATUSES[status]}</span>
}
