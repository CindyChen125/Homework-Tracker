import { useMemo } from 'react'
import { fmtLong, toISO, todayISO } from '../lib/dates'
import { holidayOn, isSchoolDay, makeupOn } from '../lib/holidays'
import Icon from './Icon'
import type { Item } from '../lib/store'

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
interface Props {
  month: Date
  items: Item[]
  selected?: string
  onSelect?: (iso: string) => void
}

/** Monday-first month grid: one green deadline dot plus one star per test. */
export default function MonthGrid({ month, items, selected, onSelect }: Props) {
  const today = todayISO()

  const byDue = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of items) m.set(i.due_date, [...(m.get(i.due_date) ?? []), i])
    return m
  }, [items])

  const cells = useMemo(() => {
    const start = new Date(month)
    start.setDate(1 - ((month.getDay() + 6) % 7))
    const out: { iso: string; day: number; inMonth: boolean }[] = []
    for (let d = new Date(start); out.length < 42; d.setDate(d.getDate() + 1)) {
      out.push({ iso: toISO(d), day: d.getDate(), inMonth: d.getMonth() === month.getMonth() })
    }
    // Drop a trailing week that is entirely next month.
    return out.slice(35).every((c) => !c.inMonth) ? out.slice(0, 35) : out
  }, [month])

  return (
    <div className="month-grid">
      {WEEK.map((w, i) => (
        <div key={i} className="month-head">{w}</div>
      ))}
      {cells.map(({ iso, day, inMonth }) => {
        const due = byDue.get(iso) ?? []
        const tests = due.filter((item) => item.type === 'test')
        const hasDeadline = due.some((item) => item.type !== 'test')
        const holiday = holidayOn(iso)
        const makeup = makeupOn(iso)
        const cls = [
          'month-cell',
          inMonth ? '' : 'out',
          iso === selected ? 'selected' : '',
          onSelect ? '' : 'static',
          isSchoolDay(iso) ? 'school' : 'off',
        ]
        const body = (
          <>
            <span className={`month-num ${iso === today ? 'today' : ''}`}>{day}</span>
            <span className="marks" aria-hidden="true">
              {hasDeadline && <span className="mark-deadline" />}
              {tests.map((test) => (
                <span key={test.id} className="mark-star"><Icon name="star" size={9} stroke={0} /></span>
              ))}
            </span>
          </>
        )
        const note = holiday ? `, ${holiday.name} holiday` : makeup ? ', make-up school day' : ''
        const testLabel = tests.length === 0 ? 'no tests' : `${tests.length} test${tests.length === 1 ? '' : 's'}`
        const deadlineLabel = hasDeadline ? 'homework due' : 'no homework due'
        const label = `${fmtLong(iso)}: ${deadlineLabel}, ${testLabel}${note}`
        return onSelect ? (
          <button key={iso} className={cls.join(' ')} onClick={() => onSelect(iso)} aria-label={label} aria-pressed={iso === selected}>
            {body}
          </button>
        ) : (
          <div key={iso} className={cls.join(' ')} aria-label={label}>{body}</div>
        )
      })}
    </div>
  )
}

export function Legend() {
  return (
    <div className="legend">
      <span>
        <span className="mark-deadline" />
        Homework due
      </span>
      <span>
        <span className="mark-star"><Icon name="star" size={11} stroke={0} /></span>
        Test
      </span>
      <span>
        <span className="legend-swatch school-swatch" />
        School day
      </span>
      <span>
        <span className="legend-swatch off-swatch" />
        Weekend or holiday
      </span>
      <p className="legend-note">
        A green dot means at least one non-test assignment is due. Every star represents one test. Green days are school days,
        sand days are weekends and national holidays; a make-up weekend counts as a school day.
      </p>
    </div>
  )
}
