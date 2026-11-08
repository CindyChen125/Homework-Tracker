import { useEffect, useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import { SectionHeading, TopBar } from '../components/ui'
import { store, type Account, type Role } from '../lib/store'

const ROLES: { value: Role; label: string; what: string }[] = [
  { value: 'reader', label: 'Reader', what: 'Can read the site. Cannot change homework, the timetable or materials.' },
  { value: 'editor', label: 'Editor', what: 'Can post homework, change the timetable and upload files.' },
  { value: 'admin', label: 'Admin', what: 'Everything an editor can do, and can set these permissions.' },
]

/** The admin's page: who has an account, and what each of them may do. */
export default function People({ data }: { data: AppData }) {
  if (!data.admin || !data.user) return null
  return <PeopleManager data={data} />
}

function PeopleManager({ data }: { data: AppData }) {
  const [people, setPeople] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    try {
      setPeople(await store.people())
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const change = async (person: Account, role: Role) => {
    if (person.role === role) return
    setBusy(person.id)
    setErr(null); setNotice(null)
    try {
      await store.setRole(person.id, role)
      setPeople((list) => list.map((p) => (p.id === person.id ? { ...p, role } : p)))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const changeNewsPermission = async (person: Account, allowed: boolean) => {
    setBusy(person.id); setErr(null); setNotice(null)
    try {
      await store.setNewsManager(person.id, allowed)
      setPeople(list => list.map(p => p.id === person.id ? { ...p, news_manager: allowed } : p))
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(null) }
  }

  const remove = async (person: Account) => {
    if (busy || person.id === data.user?.id) return
    const label = person.name ? `${person.name} (${person.email})` : person.email
    const confirmed = window.confirm(
      `Delete ${label}?\n\nThis is permanent. The account will be removed from Supabase Auth and the user will no longer be able to sign in. Their personal Student Notes and note files will also be removed. Shared class homework and materials will stay.`,
    )
    if (!confirmed) return
    setBusy(person.id); setErr(null); setNotice(null)
    try {
      const result = await store.deleteUser(person.id)
      setPeople((list) => list.filter((account) => account.id !== person.id))
      await load()
      setNotice(`${label} was deleted.${result.warning ? ` ${result.warning}` : ''}`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const editors = people.filter((p) => p.role !== 'reader')
  const adminCount = people.filter((p) => p.role === 'admin').length

  return (
    <>
      <TopBar user={data.user} />

      <header className="page-head" data-tour="people">
        <div className="page-head-text">
          <div className="eyebrow">{people.length} with an account · {editors.length} can post</div>
          <h1>People</h1>
        </div>
      </header>

      <p className="lead" style={{ maxWidth: 620 }}>
        Anyone can sign up with their email, and a new account can only read. Make someone an editor and they can post
        homework, change the timetable and upload files. They see the change the next time they open the site.
      </p>

      {err && <div className="alert error" role="alert">{err}</div>}
      {notice && <div className="alert" role="status">{notice}</div>}

      <section className="stack" style={{ marginTop: 20 }}>
        <SectionHeading count={people.length}>Accounts</SectionHeading>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : people.length === 0 ? (
          <div className="empty">Nobody has signed up yet.</div>
        ) : (
          people.map((p) => (
            <div key={p.id} className="card person-card">
              <div className="person-who">
                <strong>{p.name || p.email}</strong>
                {p.name && <span className="small faint">{p.email}</span>}
                {p.id === data.user?.id && <span className="small muted">This is you</span>}
              </div>
              <div className="seg seg-3 person-roles" role="radiogroup" aria-label={`What ${p.email} may do`}>
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    role="radio"
                    aria-checked={p.role === r.value}
                    className={p.role === r.value ? 'on' : ''}
                    disabled={busy === p.id || p.id === data.user?.id}
                    title={p.id === data.user?.id ? 'You cannot change your own permissions' : r.what}
                    onClick={() => change(p, r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <label className="news-check person-news-permission">
                <input type="checkbox" checked={p.role === 'admin' || p.news_manager === true}
                  disabled={busy !== null || p.role === 'admin' || data.newsStatus !== 'ready'}
                  onChange={e => changeNewsPermission(p, e.target.checked)} />
                <span>News manager<span className="small muted">{p.role === 'admin' ? 'Included for admins' : 'Class News and private birthday settings only; does not grant homework editing'}</span></span>
              </label>
              <button
                className="btn danger person-delete"
                disabled={busy !== null || p.id === data.user?.id || (p.role === 'admin' && adminCount <= 1)}
                title={p.id === data.user?.id
                  ? 'You cannot delete your own account'
                  : p.role === 'admin' && adminCount <= 1
                    ? 'The last administrator cannot be deleted'
                    : `Permanently delete ${p.name || p.email}`}
                onClick={() => remove(p)}
              >
                {busy === p.id ? 'Deleting…' : 'Delete user'}
              </button>
            </div>
          ))
        )}
      </section>

      <section className="stack" style={{ marginTop: 28 }}>
        <SectionHeading>What each one means</SectionHeading>
        <div className="card stack gap-sm">
          {ROLES.map((r) => (
            <p key={r.value} className="small">
              <strong>{r.label}</strong> — {r.what}
            </p>
          ))}
          <p className="small muted">
            News management is separate from homework editing. Assign it only to an identified, authorized account. No teacher account has been created or selected.
          </p>
          {data.newsStatus === 'setup' && <p className="small muted">News permissions can be assigned after the Phase 4 migration has been reviewed and applied.</p>}
          <p className="small muted">
            <Icon name="user" size={13} stroke={1.8} /> You cannot change your own permissions, so an admin can never lock
            themselves out.
          </p>
        </div>
      </section>
    </>
  )
}
