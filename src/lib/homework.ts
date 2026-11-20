import { addDays, fmtShort, nextSchoolDay, relative } from './dates'
import type { Item, ItemType } from './store'

/** How far ahead projects/tests show up as reminders. */
export const REMINDER_DAYS = 14

export const TYPE_LABEL: Record<ItemType, string> = {
  daily: 'Homework',
  project: 'Project',
  test: 'Test',
  other: 'Other',
}

const TYPE_EMOJI: Record<ItemType, string> = {
  daily: '📝',
  project: '📂',
  test: '🧪',
  other: '📌',
}

/** Homework posted on this day. */
export const assignedOn = (items: Item[], day: string) =>
  items.filter((i) => i.assigned_date === day)

/** Today looks ahead to the next school day; other dates show their own hand-ins. */
export function homeworkForDay(items: Item[], selected: string, today: string) {
  const dueDate = selected === today ? nextSchoolDay(today) : selected
  return { dueDate, items: items.filter((i) => i.due_date === dueDate) }
}

/** All later deadlines, grouped by date. Independent of the chat's reminder window. */
export function deadlinesAfter(items: Item[], cutoff: string): [string, Item[]][] {
  const groups = new Map<string, Item[]>()
  for (const item of items) {
    if (item.due_date <= cutoff) continue
    const group = groups.get(item.due_date) ?? []
    group.push(item)
    groups.set(item.due_date, group)
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

/** Long-term things (not daily homework) due after this day, within the reminder window. */
export const upcomingFrom = (items: Item[], day: string) => {
  const limit = addDays(day, REMINDER_DAYS)
  return items
    .filter((i) => i.type !== 'daily' && i.assigned_date !== day && i.due_date > day && i.due_date <= limit)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
}

/** Homework due the very next school day is noise on a calendar — only longer-range work shows there. */
export const onCalendar = (i: Item) => i.type !== 'daily' || i.due_date > nextSchoolDay(i.assigned_date)

export const groupBySubject = (items: Item[]) => {
  const groups = new Map<string, Item[]>()
  for (const i of items) groups.set(i.subject, [...(groups.get(i.subject) ?? []), i])
  return [...groups.entries()]
}

/** The text pasted into the homeroom WeChat group. `swaps` are tomorrow's timetable changes. */
export function buildMessage(items: Item[], day: string, swaps: string[] = [], swapDay = '') {
  const today = assignedOn(items, day)
  const upcoming = upcomingFrom(items, day)
  const lines: string[] = [`📚 Homework ${fmtShort(day)}`, '']

  if (today.length === 0) lines.push('No new homework today 🎉')
  for (const [subject, list] of groupBySubject(today)) {
    for (const i of list) {
      const tag = i.type === 'daily' ? '' : ` ${TYPE_EMOJI[i.type]}${TYPE_LABEL[i.type]}`
      lines.push(`【${subjectOptionLabel(subject)}】${i.title}${tag} — due ${fmtShort(i.due_date)}`)
      if (i.notes) lines.push(`   ${i.notes}`)
    }
  }

  if (swaps.length) {
    lines.push('', `🔄 Timetable ${swapDay}:`)
    for (const l of swaps) lines.push(`• ${l}`)
  }

  if (upcoming.length) {
    lines.push('', '⏰ Coming up:')
    for (const i of upcoming) {
      lines.push(`${TYPE_EMOJI[i.type]} ${subjectOptionLabel(i.subject)} ${TYPE_LABEL[i.type].toLowerCase()}: ${i.title} — ${fmtShort(i.due_date)}, ${relative(day, i.due_date)}`)
    }
  }
  return lines.join('\n')
}

// Bright enough to read on the dark background.
/** Sunday-night preview: everything due in the week starting `from`. */
export function buildWeekMessage(items: Item[], from: string) {
  const to = addDays(from, 6)
  const due = items
    .filter((i) => i.due_date >= from && i.due_date <= to && (i.type !== 'daily' || i.due_date > nextSchoolDay(i.assigned_date)))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const lines = [`🗓 Week of ${fmtShort(from)}`, '']
  if (due.length === 0) {
    lines.push('Nothing big due this week.')
  } else {
    for (const i of due) {
      lines.push(`${TYPE_EMOJI[i.type]} ${fmtShort(i.due_date)} 【${subjectOptionLabel(i.subject)}】${i.title}${i.type === 'daily' ? '' : ` (${TYPE_LABEL[i.type].toLowerCase()})`}`)
      if (i.notes) lines.push(`   ${i.notes}`)
    }
  }
  return lines.join('\n')
}

const FIXED: Record<string, string> = {
  math: '#4FD1C5',
  english: '#F6C85F',
  // The split English and maths sets, so every EE(…) card looks like every other.
  ee: '#F6C85F',
  ec: '#E8A33D',
  chemistry: '#FF8FB1',
  history: '#7AA2F7',
  biology: '#9ECE6A',
  physics: '#B69CFF',
  chinese: '#FF9E64',
  civics: '#E0AF68',
  geography: '#73DACA',
  pe: '#5BC8E8',
  art: '#F7768E',
  arts: '#F7768E',
  it: '#7DCFFF',
  optional: '#A0A8B4',
  club: '#BB9AF7',
  other: '#A0A8B4',
}
const PALETTE = ['#4FD1C5', '#F6C85F', '#FF8FB1', '#7AA2F7', '#9ECE6A', '#B69CFF', '#FF9E64', '#73DACA', '#E0AF68', '#BB9AF7']

export const OTHER_SUBJECT = 'Other'

/** 'Math(S+1)' and 'Math' are the same subject as far as colour goes. */
export const subjectBase = (subject: string) => subject.trim().split('(')[0].trim()

/** The split sets: one dropdown each on the Add page, in the order they are taught. */
export const SUBJECT_SETS: { label: string; options: string[] }[] = [
  { label: 'EE', options: ['EE(H)', 'EE(S+1)', 'EE(S+2)', 'EE(S)'] },
  { label: 'EC', options: ['EC(H)', 'EC(S+1)', 'EC(S+2)', 'EC(S)'] },
  { label: 'Math', options: ['Math(S+1)', 'Math(S+2)', 'Math(S+3)', 'Math(S)'] },
]

/** Display metadata only: keys remain the original subject values saved with homework. */
export const SUBJECT_CLASSES: Readonly<Record<string, { readonly className: string; readonly teacher: string }>> = {
  'EC(H)': { className: 'ECH', teacher: 'Mr. Song' },
  'EC(S+1)': { className: 'ECS+1', teacher: 'Ms. Tong' },
  'EC(S+2)': { className: 'ECS+2', teacher: 'Ms. Kim' },
  'EC(S)': { className: 'ECS', teacher: 'Ms. Monica' },
  'EE(H)': { className: 'EEH', teacher: 'Ms. Sydnie' },
  'EE(S+1)': { className: 'EES+1', teacher: 'Ms. Grace' },
  'EE(S+2)': { className: 'EES+2', teacher: 'Mr. Meehan' },
  'EE(S)': { className: 'EES', teacher: 'Mr. Joe' },
  'Math(S+1)': { className: 'Math S+1', teacher: '张老师' },
  'Math(S+2)': { className: 'Math S+2', teacher: '陈老师' },
  'Math(S+3)': { className: 'Math S+3', teacher: '韩老师' },
  'Math(S)': { className: 'Math S', teacher: '陈老师' },
}

/** Custom subjects retain their own name, including names matching object properties. */
export function subjectOptionLabel(subject: string) {
  if (!Object.prototype.hasOwnProperty.call(SUBJECT_CLASSES, subject)) return subject
  const entry = SUBJECT_CLASSES[subject]
  // Only display text changes: levels remain in keys and saved homework values.
  const className = entry.className.replace(/^(EC|EE)(?=[HS])/, '$1 ').replace(/\+\d+$/, '+')
  return `${className} · ${entry.teacher}`
}

export function subjectColor(subject: string) {
  const fixed = FIXED[subjectBase(subject).toLowerCase()]
  if (fixed) return fixed
  let h = 0
  for (const c of subject.trim().toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
