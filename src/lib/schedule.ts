import { holidayOn } from './holidays'
// The class timetable: a fixed weekly grid, plus one-off changes attached to single dates.
// Subjects come from the codes on the printed timetable (BIO → Biology, E/ENG → English, …).

import { parseISO } from './dates'

export interface Period {
  n: number
  start: string
  end: string
  /** Wednesday is the only day with a 9th period. */
  wedOnly?: boolean
}

/** Bell times, SSBS 小学/初中. Each period lasts 40 minutes. */
export const PERIODS: Period[] = [
  { n: 1, start: '8:20', end: '9:00' },
  { n: 2, start: '9:15', end: '9:55' },
  { n: 3, start: '10:25', end: '11:05' },
  { n: 4, start: '11:20', end: '12:00' },
  { n: 5, start: '12:45', end: '13:25' },
  { n: 6, start: '13:40', end: '14:20' },
  { n: 7, start: '14:35', end: '15:15' },
  { n: 8, start: '15:30', end: '16:10' },
  { n: 9, start: '16:20', end: '17:00', wedOnly: true },
]

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

/** G8 (5), room 307 — one entry per period 1–9, null where there is no class. */
export const DEFAULT_TIMETABLE: (string | null)[][] = [
  // Monday
  ['Biology', 'Chinese', 'PE', 'Math', 'Civics', 'English', 'English', 'Optional', null],
  // Tuesday
  ['PE', 'Biology', 'English', 'English', 'Math', 'Math', 'Chinese', 'PE', null],
  // Wednesday
  ['Chinese', 'Chinese', 'Math', 'PE', 'English', 'English', 'Physics', 'Chemistry', 'Club'],
  // Thursday
  ['Chemistry', 'English', 'History', 'PE', 'IT', 'Physics', 'Chinese', 'Math', null],
  // Friday
  ['Civics', 'Physics', 'English', 'English', 'Arts', 'Chinese', 'Math', 'PG', null],
]

export const CLASS_INFO = { grade: 'G8 (5)', room: '307', teacher: 'Ms. Monica', term: '2026 · Term 1' }

/** A change to one period on one date. `subject: null` means the class is cancelled. */
/** A swap across days keeps the partner's date in `note`: the table has no column for it. */
export const swapPartner = (c: SlotChange | undefined) =>
  c?.note?.startsWith('with:') ? c.note.slice(5) : null

export const swapNote = (partnerDate: string | null) => (partnerDate ? `with:${partnerDate}` : null)

export interface SlotChange {
  id: string
  date: string
  period: number
  subject: string | null
  /** The other period this one was swapped with, for the "swapped with period 6" label. */
  swapped_with: number | null
  note: string | null
}

export type Weekday = 0 | 1 | 2 | 3 | 4
/** Monday = 0 … Friday = 4; null at weekends. */
export const weekdayIndex = (iso: string): Weekday | null => {
  const d = parseISO(iso).getDay()
  return d >= 1 && d <= 5 ? ((d - 1) as Weekday) : null
}

export interface Slot {
  period: Period
  subject: string | null
  /** What the timetable says, when a change overrides it. */
  original?: string | null
  change?: SlotChange
}

/** The periods actually taught on a date, with any changes applied. */
export function daySlots(iso: string, timetable: (string | null)[][], changes: SlotChange[]): Slot[] {
  const wd = weekdayIndex(iso)
  // No lessons at the weekend, and none on a public holiday.
  if (wd === null || holidayOn(iso)) return []
  const row = timetable[wd] ?? []
  const onDate = changes.filter((c) => c.date === iso)
  return PERIODS.filter((p) => !p.wedOnly || wd === 2)
    .map((period) => {
      const original = row[period.n - 1] ?? null
      const change = onDate.find((c) => c.period === period.n)
      return change ? { period, subject: change.subject, original, change } : { period, subject: original }
    })
    .filter((s) => s.subject !== null || s.change)
}

/** One line per change, for the group-chat message: "Period 4 PE → Math". */
export function changeLines(slots: Slot[]): string[] {
  return slots
    .filter((s) => s.change)
    .map((s) => {
      const from = s.original ?? 'free'
      if (s.subject === null) return `Period ${s.period.n}: ${from} cancelled`
      if (s.change?.swapped_with) return `Period ${s.period.n}: ${s.subject} (swapped with period ${s.change.swapped_with})`
      return `Period ${s.period.n}: ${from} → ${s.subject}`
    })
}
