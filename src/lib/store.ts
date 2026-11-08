import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { addDays, nextSchoolDay, todayISO } from './dates'
import { DEFAULT_TIMETABLE, type SlotChange } from './schedule'
import { fetchAllPages } from './pagination'
import { demoNewsStore, supabaseNewsStore } from './news-store'
import { demoStudentNotesStore, supabaseStudentNotesStore } from './student-notes-store'

export type ItemType = 'daily' | 'project' | 'test' | 'other'

export interface Item {
  id: string
  title: string
  subject: string
  type: ItemType
  assigned_date: string
  due_date: string
  notes: string | null
  link: string | null
}

export type NewItem = Omit<Item, 'id'>

export interface Material {
  id: string
  title: string
  subject: string
  notes: string | null
  file_name: string
  file_size: number
  file_type: string
  /** Where the file lives: a Storage path, or a data URL in demo mode. */
  file_path: string
  item_id: string | null
  created_at: string
}

export type NewMaterial = Omit<Material, 'id' | 'created_at' | 'file_path' | 'file_name' | 'file_size' | 'file_type'>

export type Timetable = (string | null)[][]

/** reader: can read. editor: can post. admin: can also hand out those permissions. */
export type Role = 'reader' | 'editor' | 'admin'

export interface Account {
  id: string
  email: string
  name: string | null
  role: Role
  news_manager?: boolean
}

export const canEdit = (a: Account | null) => a?.role === 'editor' || a?.role === 'admin'
export const isAdmin = (a: Account | null) => a?.role === 'admin'

export interface Store {
  mode: 'supabase' | 'demo'
  news: import('./news-store').NewsStore
  studentNotes: import('./student-notes-store').StudentNotesStore
  list(): Promise<Item[]>
  add(item: NewItem): Promise<void>
  update(id: string, item: NewItem): Promise<void>
  remove(id: string): Promise<void>
  /** The weekly grid, as last saved (falls back to the printed timetable). */
  timetable(): Promise<Timetable>
  saveTimetable(grid: Timetable): Promise<void>
  /** One-off changes, from `from` onwards. */
  changes(from: string): Promise<SlotChange[]>
  addChanges(rows: Omit<SlotChange, 'id'>[]): Promise<void>
  clearChanges(date: string, periods: number[]): Promise<void>
  materials(): Promise<Material[]>
  addMaterial(meta: NewMaterial, file: File): Promise<void>
  removeMaterial(m: Material): Promise<void>
  /** A URL the browser can open for this material. */
  fileUrl(m: Material): Promise<string>
  /** The signed-in account, or null. Unconfigured demo mode never authenticates. */
  currentUser(): Promise<Account | null>
  /** Session events, including other tabs and token refresh. Do not query inside the listener. */
  subscribeAuth(listener: (signedIn: boolean) => void): () => void
  signIn(email: string, password: string): Promise<void>
  /** Creates a reader account. An admin can raise it to editor afterwards. */
  signUp(email: string, password: string, name: string): Promise<void>
  signOut(): Promise<void>
  /** Everyone with an account, for the admin's People page. */
  people(): Promise<Account[]>
  setRole(id: string, role: Role): Promise<void>
  setNewsManager(id: string, allowed: boolean): Promise<void>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
// Supabase's own snippets call it the publishable key now; older ones say anon key.
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

const BUCKET = 'materials'

function supabaseStore(sb: SupabaseClient): Store {
  const check = <T extends { error: { message: string } | null }>(res: T) => {
    if (res.error) throw new Error(res.error.message)
    return res
  }
  return {
    mode: 'supabase',
    news: supabaseNewsStore(sb),
    studentNotes: supabaseStudentNotesStore(sb),
    async list() {
      return fetchAllPages<Item>(async (from, to) => {
        const { data } = check(await sb.from('items').select('*').order('due_date').order('id').range(from, to))
        return (data ?? []) as Item[]
      })
    },
    async add(item) {
      check(await sb.from('items').insert(item))
    },
    async update(id, item) {
      check(await sb.from('items').update(item).eq('id', id))
    },
    async remove(id) {
      check(await sb.from('items').delete().eq('id', id))
    },
    async timetable() {
      const { data } = check(await sb.from('timetable').select('grid').eq('id', 1).maybeSingle())
      return (data?.grid as Timetable) ?? DEFAULT_TIMETABLE
    },
    async saveTimetable(grid) {
      check(await sb.from('timetable').upsert({ id: 1, grid }))
    },
    async changes(from) {
      const { data } = check(await sb.from('schedule_changes').select('*').gte('date', from).order('date'))
      return (data ?? []) as SlotChange[]
    },
    async addChanges(rows) {
      check(await sb.from('schedule_changes').insert(rows))
    },
    async clearChanges(date, periods) {
      check(await sb.from('schedule_changes').delete().eq('date', date).in('period', periods))
    },
    async materials() {
      const { data } = check(await sb.from('materials').select('*').order('created_at', { ascending: false }))
      return (data ?? []) as Material[]
    },
    async addMaterial(meta, file) {
      const path = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
      if (up.error) throw new Error(up.error.message)
      check(
        await sb.from('materials').insert({
          ...meta,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
        }),
      )
    },
    async removeMaterial(m) {
      check(await sb.from('materials').delete().eq('id', m.id))
      await sb.storage.from(BUCKET).remove([m.file_path])
    },
    async fileUrl(m) {
      return check(await sb.storage.from(BUCKET).createSignedUrl(m.file_path, 60)).data!.signedUrl
    },
    async currentUser() {
      const { data, error: sessionError } = await sb.auth.getSession()
      const user = data.session?.user
      if (sessionError || !user) return null
      const reader: Account = {
        id: user.id,
        email: user.email ?? '',
        name: null,
        role: 'reader',
        news_manager: false,
      }
      // Editing requires a successful profile lookup, never a legacy/error fallback.
      try {
        const { data: row, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle()
        if (error || !row) return reader
        return {
          ...reader,
          name: (row.name as string | null) ?? null,
          role: row.role === 'editor' || row.role === 'admin' ? row.role : 'reader',
          news_manager: row.news_manager === true,
        }
      } catch {
        // Rejected/network requests must fail closed too.
        return reader
      }
    },
    async signIn(email, password) {
      check(await sb.auth.signInWithPassword({ email, password }))
    },
    async signUp(email, password, name) {
      // Canonical GitHub Pages application root, not the account's root website.
      // No hash route here: Supabase uses the fragment to return session tokens.
      const res = check(await sb.auth.signUp({ email, password, options: {
        data: { name },
        emailRedirectTo: 'https://jacky-chy-chen.github.io/Homework-Tracker/',
      } }))
      if (!res.data.session) {
        throw new Error('Your account was created, but Classboard could not sign you in. Try signing in, and ask an administrator to confirm that email confirmation is disabled.')
      }
    },
    subscribeAuth(listener) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => listener(!!session))
      return () => data.subscription.unsubscribe()
    },
    async signOut() {
      check(await sb.auth.signOut({ scope: 'local' }))
    },
    async people() {
      const { data } = check(await sb.from('profiles').select('*').order('email'))
      return (data ?? []) as Account[]
    },
    async setRole(id, role) {
      check(await sb.from('profiles').update({ role }).eq('id', id))
    },
    async setNewsManager(id, allowed) {
      check(await sb.from('profiles').update({ news_manager: allowed }).eq('id', id).select('id').single())
    },
  }
}

const DEMO_ITEMS = 'hw-demo-items'
const DEMO_GRID = 'hw-demo-timetable'
const DEMO_CHANGES = 'hw-demo-changes'
const DEMO_MATERIALS = 'hw-demo-materials'
/** Demo files live in localStorage as data URLs, so keep them small. */
const DEMO_FILE_LIMIT = 1_000_000

function demoSeed(): Item[] {
  const t = todayISO()
  const mk = (i: number, p: Omit<Item, 'id' | 'notes' | 'link'> & Partial<Item>): Item => ({
    id: `demo-${i}`,
    notes: null,
    link: null,
    ...p,
  })
  return [
    mk(1, { title: 'Worksheet 3.2, #1–20', subject: 'Math', type: 'daily', assigned_date: t, due_date: nextSchoolDay(t) }),
    mk(2, { title: 'Read chapter 5 and annotate', subject: 'English', type: 'daily', assigned_date: t, due_date: nextSchoolDay(t) }),
    mk(3, { title: 'Unit 2 test', subject: 'Chemistry', type: 'test', assigned_date: addDays(t, -5), due_date: addDays(t, 4), notes: 'Covers atomic structure + periodic trends' }),
    mk(4, { title: 'Group research project', subject: 'History', type: 'project', assigned_date: addDays(t, -10), due_date: addDays(t, 9), notes: 'Slides + 5 min presentation. Groups of 4.' }),
    mk(5, { title: 'Vocab list 4', subject: 'English', type: 'daily', assigned_date: addDays(t, -1), due_date: t }),
    mk(6, { title: 'Lab write-up', subject: 'Physics', type: 'daily', assigned_date: t, due_date: addDays(t, 5), notes: 'Full results table and conclusion' }),
  ]
}

function demoStore(): Store {
  const read = <T>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as T
    } catch {}
    return fallback
  }
  const write = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      throw new Error('This browser has no room left to save. Delete something and try again.')
    }
  }
  const loadItems = (): Item[] => {
    const saved = read<Item[] | null>(DEMO_ITEMS, null)
    if (saved) return saved
    const seed = demoSeed()
    write(DEMO_ITEMS, seed)
    return seed
  }
  const id = () => `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  return {
    mode: 'demo',
    news: demoNewsStore(async () => ({ role: 'admin' })),
    studentNotes: demoStudentNotesStore(async () => ({ id: 'demo', name: 'Demo', role: 'admin' })),
    async list() {
      return loadItems().sort((a, b) => a.due_date.localeCompare(b.due_date))
    },
    async add(item) {
      write(DEMO_ITEMS, [...loadItems(), { ...item, id: id() }])
    },
    async update(itemId, item) {
      write(DEMO_ITEMS, loadItems().map((i) => (i.id === itemId ? { ...item, id: itemId } : i)))
    },
    async remove(itemId) {
      write(DEMO_ITEMS, loadItems().filter((i) => i.id !== itemId))
    },
    async timetable() {
      return read<Timetable>(DEMO_GRID, DEFAULT_TIMETABLE)
    },
    async saveTimetable(grid) {
      write(DEMO_GRID, grid)
    },
    async changes(from) {
      return read<SlotChange[]>(DEMO_CHANGES, []).filter((c) => c.date >= from)
    },
    async addChanges(rows) {
      write(DEMO_CHANGES, [...read<SlotChange[]>(DEMO_CHANGES, []), ...rows.map((r) => ({ ...r, id: id() }))])
    },
    async clearChanges(date, periods) {
      write(DEMO_CHANGES, read<SlotChange[]>(DEMO_CHANGES, []).filter((c) => !(c.date === date && periods.includes(c.period))))
    },
    async materials() {
      return read<Material[]>(DEMO_MATERIALS, [])
    },
    async addMaterial(meta, file) {
      if (file.size > DEMO_FILE_LIMIT) {
        throw new Error('Demo mode can only hold files under 1 MB. Connect Supabase for real uploads.')
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new Error('Could not read that file.'))
        r.readAsDataURL(file)
      })
      const row: Material = {
        ...meta,
        id: id(),
        file_path: dataUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        created_at: new Date().toISOString(),
      }
      write(DEMO_MATERIALS, [row, ...read<Material[]>(DEMO_MATERIALS, [])])
    },
    async removeMaterial(m) {
      write(DEMO_MATERIALS, read<Material[]>(DEMO_MATERIALS, []).filter((x) => x.id !== m.id))
    },
    async fileUrl(m) {
      return m.file_path
    },
    async currentUser() {
      return null
    },
    subscribeAuth() { return () => {} },
    async signIn() { throw new Error('Connect Supabase to enable sign in. Local demo mode does not authenticate users.') },
    async signUp() {
      throw new Error('Connect Supabase to enable registration.')
    },
    async signOut() {},
    async people() {
      return [
        { id: 'demo', email: 'demo@classboard', name: 'Demo', role: 'admin' as Role },
        { id: 'demo-2', email: 'student@classboard', name: 'A student', role: 'reader' as Role, news_manager: read<Record<string, boolean>>('hw-demo-news-permissions', {})['demo-2'] ?? false },
      ]
    },
    async setRole() {},
    async setNewsManager(personId, allowed) {
      write('hw-demo-news-permissions', { ...read<Record<string, boolean>>('hw-demo-news-permissions', {}), [personId]: allowed })
    },
  }
}

export const store: Store = url && key ? supabaseStore(createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})) : demoStore()
