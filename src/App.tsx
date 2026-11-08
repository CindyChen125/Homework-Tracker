import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { canEdit, isAdmin, store, type Account, type Item, type Material, type Timetable } from './lib/store'
import { DEFAULT_TIMETABLE, type SlotChange } from './lib/schedule'
import { addDays, todayISO } from './lib/dates'
import type { IconName } from './components/Icon'
import Sidebar from './components/Sidebar'
import Today from './pages/Today'
import Schedule from './pages/Schedule'
import Materials from './pages/Materials'
import Post from './pages/Post'
import People from './pages/People'
import SchoolCalendar from './pages/SchoolCalendar'
import News from './pages/News'
import Feedback from './pages/Feedback'
import { schoolToday, type BirthdayGreeting, type NewsItem } from './lib/news'
import { NewsSetupError } from './lib/news-store'
import Tour, { tourSeen } from './components/Tour'
import Auth from './pages/Auth'
import { createAuthSession } from './lib/auth-session'
import { canAccessRoute } from './lib/access'

// Hash routing: works on any static host and inside WeChat's browser.
type Route = 'today' | 'schedule' | 'materials' | 'post' | 'people' | 'school-calendar' | 'news' | 'feedback'
const ROUTES: Route[] = ['today', 'schedule', 'materials', 'post', 'people', 'school-calendar', 'news', 'feedback']
const readRoute = (): Route => {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0] as Route
  return ROUTES.includes(r) ? r : 'today'
}

export interface AppData {
  items: Item[]
  materials: Material[]
  timetable: Timetable
  changes: SlotChange[]
  loading: boolean
  error: string | null
  /** The signed-in account, or null. `editor` says whether it may write. */
  user: Account | null
  editor: boolean
  admin: boolean
  reload: () => Promise<void>
  reloadSchedule: () => Promise<void>
  reloadMaterials: () => Promise<void>
  signOut: () => Promise<void>
  news: NewsItem[]
  greetings: BirthdayGreeting[]
  newsDay: string
  newsStatus: 'loading' | 'ready' | 'setup' | 'error'
  newsError: string | null
  reloadNews: () => Promise<void>
}

const NAV: { route: Route; href: string; label: string; icon: IconName; editorOnly?: boolean; adminOnly?: boolean }[] = [
  { route: 'today', href: '#/', label: 'Today', icon: 'today' },
  { route: 'schedule', href: '#/schedule', label: 'Classes', icon: 'grid' },
  { route: 'school-calendar', href: '#/school-calendar', label: 'School', icon: 'calendar' },
  { route: 'materials', href: '#/materials', label: 'Files', icon: 'folder' },
  { route: 'news', href: '#/news', label: 'News', icon: 'chat' },
  { route: 'feedback', href: '#/feedback', label: 'Feedback', icon: 'feedback' },
  { route: 'post', href: '#/post', label: 'Add', icon: 'plus', editorOnly: true },
  { route: 'people', href: '#/people', label: 'People', icon: 'user', adminOnly: true },
]

const TITLES: Record<Route, string> = {
  today: 'Classboard',
  schedule: 'Classes · Classboard',
  materials: 'Files · Classboard',
  post: 'Add homework · Classboard',
  people: 'People · Classboard',
  'school-calendar': 'School Calendar · Classboard',
  news: 'Class News · Classboard',
  feedback: 'Feedback Center · Classboard',
}

export default function App() {
  const session = useMemo(() => createAuthSession(store, () => { location.hash = '#/' }), [])
  const auth = useSyncExternalStore(session.subscribe, session.getSnapshot)
  useEffect(() => session.start(), [session])
  useEffect(() => {
    if (auth.status !== 'signed-in') document.title = 'Sign in · Classboard'
  }, [auth.status])
  if (auth.status === 'checking') return (
    <main className="auth-page" aria-busy="true">
      <div className="signin"><div className="signin-body"><p role="status" aria-live="polite">Checking your session…</p></div></div>
    </main>
  )
  if (!auth.user) return <Auth error={auth.error} onAuthenticated={session.refresh} onSignOut={session.signOut} />
  return <Classroom key={`${auth.user.id}-${auth.user.role}-${!!auth.user.news_manager}`} user={auth.user} signOut={session.signOut} />
}

/** Mounted only after authentication; unmounting clears all fetched class data. */
function Classroom({ user, signOut }: { user: Account; signOut: () => Promise<void> }) {
  const [requestedRoute, setRoute] = useState<Route>(readRoute)
  const route = canAccessRoute(user, requestedRoute) ? requestedRoute : 'today'
  const [items, setItems] = useState<Item[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [timetable, setTimetable] = useState<Timetable>(DEFAULT_TIMETABLE)
  const [changes, setChanges] = useState<SlotChange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [greetings, setGreetings] = useState<BirthdayGreeting[]>([])
  const [newsDay, setNewsDay] = useState(schoolToday)
  const [newsStatus, setNewsStatus] = useState<AppData['newsStatus']>('loading')
  const [newsError, setNewsError] = useState<string | null>(null)
  const newsRequest = useRef(0)
  // The guide opens itself the first time someone lands here, and lives behind
  // the Guide button after that.
  const [tour, setTour] = useState(() => !tourSeen())

  const fail = (e: unknown) => setError((e as Error).message)

  const reload = useCallback(async () => {
    try {
      setItems(await store.list())
      setError(null)
    } catch (e) {
      fail(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadSchedule = useCallback(async () => {
    try {
      // Keep a month of history so past weeks still show what actually happened.
      const [grid, rows] = await Promise.all([store.timetable(), store.changes(addDays(todayISO(), -31))])
      setTimetable(grid)
      setChanges(rows)
    } catch (e) {
      fail(e)
    }
  }, [])

  const reloadMaterials = useCallback(async () => {
    try {
      setMaterials(await store.materials())
    } catch (e) {
      fail(e)
    }
  }, [])

  const reloadNews = useCallback(async () => {
    const request = ++newsRequest.current
    try {
      const [posts, birthdayGreetings] = await Promise.all([store.news.list(), store.news.greetings()])
      if (request !== newsRequest.current) return
      setNews(posts)
      setGreetings(birthdayGreetings)
      setNewsStatus('ready')
      setNewsError(null)
    } catch (e) {
      if (request !== newsRequest.current) return
      setNews([])
      setGreetings([])
      setNewsStatus(e instanceof NewsSetupError ? 'setup' : 'error')
      setNewsError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    // No roster is loaded here. Refresh after sign-in, permission changes or school midnight.
    setNews([])
    setGreetings([])
    setNewsStatus('loading')
    reloadNews()
    return () => { newsRequest.current++ }
  }, [reloadNews, user?.id, user?.role, user?.news_manager, newsDay])

  useEffect(() => {
    const clock = () => setNewsDay(schoolToday())
    const refresh = () => { clock(); reloadNews() }
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    const interval = window.setInterval(clock, 30000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [reloadNews])

  useEffect(() => {
    // The calendar used to be its own page; old links keep working.
    const legacy = () => {
      const m = location.hash.match(/^#\/calendar(\?.*)?$/)
      if (m) location.replace(`#/${m[1] ?? ''}`)
    }
    legacy()
    const onHash = () => {
      legacy()
      setRoute(readRoute())
    }
    const openGuide = () => setTour(true)
    window.addEventListener('classboard:guide', openGuide)
    window.addEventListener('hashchange', onHash)
    reload()
    reloadSchedule()
    reloadMaterials()
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('classboard:guide', openGuide)
    }
  }, [reload, reloadSchedule, reloadMaterials])

  useEffect(() => {
    if (requestedRoute !== route) location.replace('#/')
    document.title = TITLES[route]
    window.scrollTo(0, 0)
  }, [route, requestedRoute])

  const data: AppData = {
    items, materials, timetable, changes, loading, error, user,
    editor: canEdit(user), admin: isAdmin(user),
    reload, reloadSchedule, reloadMaterials, signOut,
    news, greetings, newsDay, newsStatus, newsError, reloadNews,
  }
  const editor = canEdit(user)
  const nav = NAV.filter((n) => (!n.editorOnly || editor) && (!n.adminOnly || isAdmin(user)))

  return (
    <Sidebar user={user} items={nav} route={route} onGuide={() => setTour(true)} guideOpen={tour} signOut={signOut}>
      <main className={`page page-${route}`}>
        {error && <div className="alert error">Something went wrong: {error}</div>}
        {route === 'today' && <Today data={data} />}
        {route === 'schedule' && <Schedule data={data} />}
        {route === 'materials' && <Materials data={data} />}
        {route === 'post' && <Post data={data} />}
        {route === 'people' && <People data={data} />}
        {route === 'school-calendar' && <SchoolCalendar data={data} />}
        {route === 'news' && <News data={data} />}
        {route === 'feedback' && <Feedback data={data} />}
      </main>
      {tour && <Tour editor={editor} admin={isAdmin(user)} onClose={() => setTour(false)} />}
    </Sidebar>
  )
}
