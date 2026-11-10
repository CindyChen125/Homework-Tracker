import { useEffect, useMemo, useState } from 'react'
import type { AppData } from '../App'
import type { SlotChange } from '../lib/schedule'
import Icon from '../components/Icon'
import { SectionHeading, TopBar } from '../components/ui'
import { addDays, fmtLong, fmtTag, parseISO, todayISO } from '../lib/dates'
import { subjectColor } from '../lib/homework'
import { holidayOn, makeupOn } from '../lib/holidays'
import { CLASS_INFO, DAY_NAMES, daySlots, PERIODS, swapNote, swapPartner, weekdayIndex } from '../lib/schedule'
import { store, type Timetable } from '../lib/store'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Monday of the week containing `iso` (weekends look ahead to the coming Monday). */
function mondayOf(iso: string) {
  const d = parseISO(iso)
  const dow = d.getDay()
  return addDays(iso, dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow)
}

export default function Schedule({ data }: { data: AppData }) {
  const today = todayISO()
  const [view, setView] = useState<'day' | 'week'>('day')
  const [weekStart, setWeekStart] = useState(() => mondayOf(today))
  const [selected, setSelected] = useState(() => (weekdayIndex(today) === null ? mondayOf(today) : today))
  const [editing, setEditing] = useState<{ date: string; period: number } | null>(null)

  const days = [0, 1, 2, 3, 4].map((n) => addDays(weekStart, n))
  const thisWeek = weekStart === mondayOf(today)
  const slotsFor = (date: string) => daySlots(date, data.timetable, data.changes)
  const weekChanges = data.changes.filter((c) => c.date >= weekStart && c.date <= addDays(weekStart, 4))

  const pick = (iso: string) => {
    setSelected(iso)
    setView('day')
  }

  return (
    <>
      <TopBar user={data.user} />

      <header className="page-head">
        <div className="page-head-text">
          <div className="eyebrow">Room {CLASS_INFO.room} · {CLASS_INFO.teacher} · {CLASS_INFO.term}</div>
          <h1>Classes</h1>
        </div>
        <div className="head-actions">
          <div className="switch">
            <button className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}>Day</button>
            <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Week</button>
          </div>
        </div>
      </header>

      <div className="day-pills" data-tour="slots">
        {days.map((d) => (
          <button key={d} className={`day-pill ${view === 'day' && d === selected ? 'on' : ''}`} onClick={() => pick(d)}>
            <span className="day-pill-name">{DAY_NAMES[weekdayIndex(d)!].slice(0, 3)}</span>
            <span className="day-pill-date">{parseISO(d).getDate()}</span>
            <span className="day-pill-month">{MONTHS_SHORT[parseISO(d).getMonth()]}</span>
          </button>
        ))}
      </div>

      <div className="section-heading" style={{ marginTop: 18 }}>
        <div className="section-heading-left">
          <h2>{view === 'day' ? fmtLong(selected) : thisWeek ? 'This week' : `Week of ${fmtTag(weekStart)}`}</h2>
        </div>
        <div className="head-actions">
          {!thisWeek && (
            <button className="btn-quiet" onClick={() => { setWeekStart(mondayOf(today)); setSelected(today) }}>This week</button>
          )}
          <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week"><Icon name="left" /></button>
          <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week"><Icon name="right" /></button>
        </div>
      </div>

      {data.editor && (
        <p className="hint-line">
          <Icon name="edit" size={14} stroke={1.8} />
          Tap a class to swap it with another, or cancel it.
        </p>
      )}

      {view === 'day' ? (
        <DayList date={selected} data={data} onEdit={(period) => setEditing({ date: selected, period })} />
      ) : (
        <WeekGrid days={days} today={today} slotsFor={slotsFor} canEdit={data.editor} onEdit={(date, period) => setEditing({ date, period })} />
      )}

      {weekChanges.length > 0 && (
        <section className="stack changes-list">
          <SectionHeading count={weekChanges.length}>Changes this week</SectionHeading>
          {days.filter((d) => weekChanges.some((c) => c.date === d)).map((d) => (
            <div key={d} className="card">
              <div className="card-body">
                <div className="due">{fmtLong(d)}</div>
                {slotsFor(d).filter((s) => s.change).map((s) => (
                  <div key={s.period.n} className="change-line">
                    <span className="faint">Period {s.period.n}</span>
                    <span>
                      {s.original ?? 'free'} → <strong>{s.subject ?? 'cancelled'}</strong>
                      {s.change?.swapped_with ? ` (swapped with ${swapWords(s.change)})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {editing && <SlotEditor date={editing.date} period={editing.period} data={data} onClose={() => setEditing(null)} />}
    </>
  )
}

function DayList({ date, data, onEdit }: { date: string; data: AppData; onEdit: (period: number) => void }) {
  const slots = daySlots(date, data.timetable, data.changes)
  const holiday = holidayOn(date)
  const makeup = makeupOn(date)
  if (holiday) return <div className="empty" style={{ marginTop: 16 }}>{holiday.name} holiday — no school on this day.</div>
  if (slots.length === 0)
    return (
      <div className="empty" style={{ marginTop: 16 }}>
        {makeup
          ? `Make-up school day for the ${makeup.name} holiday — the school decides which day's lessons run.`
          : 'No classes on this day.'}
      </div>
    )

  return (
    <div className="slots">
      {makeup && (
        <div className="empty">
          Make-up school day for the {makeup.name} holiday. The school decides which day's lessons run — check with your teacher.
        </div>
      )}
      {slots.map((s, index) => {
        const color = s.subject ? subjectColor(s.subject) : 'var(--line)'
        const body = (
          <>
            <span className="slot-time">
              <span className="slot-start">{s.period.start}</span>
              <span className="slot-end">{s.period.end}</span>
            </span>
            <span className="slot-bar" style={{ background: color }} />
            <span className="slot-main">
              <span className="slot-subject">{s.subject ?? 'Cancelled'}</span>
              {s.change && (
                <span className="slot-badge">
                  <Icon name="swap" size={12} stroke={2} />
                  {s.change.swapped_with ? `Swapped with ${swapWords(s.change)}` : `Was ${s.original ?? 'free'}`}
                </span>
              )}
            </span>
            <span className="slot-period">Period {s.period.n}</span>
          </>
        )
        const cls = `slot ${s.change ? 'changed' : ''} ${s.subject === null ? 'cancelled' : ''}`
        return data.editor ? (
          <button key={s.period.n} className={cls} onClick={() => onEdit(s.period.n)} data-tour={index === 0 ? 'lessons' : undefined}>{body}</button>
        ) : (
          <div key={s.period.n} className={cls}>{body}</div>
        )
      })}
    </div>
  )
}

/** 'period 3' inside the day, 'period 3 on Thursday' when it crossed days. */
function swapWords(c: SlotChange) {
  const partner = swapPartner(c)
  return `period ${c.swapped_with}${partner ? ` on ${DAY_NAMES[weekdayIndex(partner)!]}` : ''}`
}

/** 'P3' for a swap inside the day, 'Thu P3' when it crossed days. */
function swapLabel(c: SlotChange) {
  const partner = swapPartner(c)
  const where = partner ? `${DAY_NAMES[weekdayIndex(partner)!].slice(0, 3)} ` : ''
  return `${where}P${c.swapped_with}`
}

function WeekGrid({
  days, today, slotsFor, canEdit, onEdit,
}: {
  days: string[]
  today: string
  slotsFor: (iso: string) => ReturnType<typeof daySlots>
  canEdit: boolean
  onEdit: (date: string, period: number) => void
}) {
  // The 9th period only exists on Wednesday, so a row nobody uses is left out —
  // unless the whole week is a holiday, when the grid would otherwise be empty.
  const used = PERIODS.filter((p) => days.some((d) => slotsFor(d).some((s) => s.period.n === p.n)))
  const rows = used.length > 0 ? used : PERIODS.filter((p) => !p.wedOnly)
  return (
    <div className="week-scroll">
      <div className="week">
        <div className="week-head" />
        {days.map((d) => (
          <div key={d} className={`week-head ${d === today ? 'is-today' : ''}`}>
            <span>{DAY_NAMES[weekdayIndex(d)!].slice(0, 3)}</span>
            <span className="faint">{parseISO(d).getDate()} {MONTHS_SHORT[parseISO(d).getMonth()]}</span>
          </div>
        ))}

        {rows.map((p, rowIndex) => {
          const cells = days.map((d) => slotsFor(d).find((s) => s.period.n === p.n))
          return (
            <div key={p.n} style={{ display: 'contents' }}>
              <div className="week-period">
                <span className="week-period-n">{p.n}</span>
                <span className="week-period-time">{p.start}</span>
              </div>
              {days.map((d, i) => {
                const slot = cells[i]
                const holiday = holidayOn(d)
                // A day off says so once, where its first lesson would have been.
                if (holiday) {
                  return (
                    <div key={d} className={`week-cell off-cell ${rowIndex === 0 ? '' : 'empty-cell'}`}>
                      {rowIndex === 0 && <span className="week-cell-name">No school</span>}
                      {rowIndex === 0 && <span className="week-cell-note">{holiday.name}</span>}
                    </div>
                  )
                }
                if (!slot) return <div key={d} className="week-cell empty-cell" />
                const cls = `week-cell ${slot.change ? 'changed' : ''}`
                const body = (
                  <>
                    <span className="week-cell-name" style={{ color: slot.subject ? subjectColor(slot.subject) : 'var(--faint)' }}>
                      {slot.subject ?? 'Cancelled'}
                    </span>
                    {slot.change && (
                      <span className="week-cell-note">
                        {slot.change.swapped_with
                          ? `Swap · ${swapLabel(slot.change)}`
                          : `Was ${slot.original ?? 'free'}`}
                      </span>
                    )}
                  </>
                )
                return canEdit ? (
                  <button key={d} className={cls} onClick={() => onEdit(d, p.n)}>{body}</button>
                ) : (
                  <div key={d} className={cls}>{body}</div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type Mode = 'swap' | 'cancel'

function SlotEditor({ date, period, data, onClose }: { date: string; period: number; data: AppData; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('swap')
  const [withDate, setWithDate] = useState(date)
  const [withPeriod, setWithPeriod] = useState<number | null>(null)
  const [forever, setForever] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const wd = weekdayIndex(date)!
  const slots = daySlots(date, data.timetable, data.changes)
  const slot = slots.find((s) => s.period.n === period)
  // A swap can reach any lesson of the same week, on this day or another.
  const week = useMemo(() => {
    const monday = addDays(date, -((parseISO(date).getDay() + 6) % 7))
    return [0, 1, 2, 3, 4].map((i) => addDays(monday, i)).filter((d) => daySlots(d, data.timetable, data.changes).length > 0)
  }, [date, data.timetable, data.changes])
  const withSlots = daySlots(withDate, data.timetable, data.changes)
  const others = withSlots.filter((s) => !(withDate === date && s.period.n === period))
  const sameDay = withDate === date

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const apply = async () => {
    setBusy(true)
    setErr(null)
    try {
      const grid: Timetable = data.timetable.map((r) => [...r])
      if (mode === 'swap') {
        if (!withPeriod) throw new Error('Pick the class to swap with.')
        const other = withSlots.find((s) => s.period.n === withPeriod)!
        const otherWd = weekdayIndex(withDate)!
        if (forever) {
          grid[wd][period - 1] = other.subject
          grid[otherWd][withPeriod - 1] = slot?.subject ?? null
          await store.saveTimetable(grid)
        } else if (sameDay) {
          await store.clearChanges(date, [period, withPeriod])
          await store.addChanges([
            { date, period, subject: other.subject, swapped_with: withPeriod, note: null },
            { date, period: withPeriod, subject: slot?.subject ?? null, swapped_with: period, note: null },
          ])
        } else {
          // Two days, one swap: each row points at the other day's period.
          await store.clearChanges(date, [period])
          await store.clearChanges(withDate, [withPeriod])
          await store.addChanges([
            { date, period, subject: other.subject, swapped_with: withPeriod, note: swapNote(withDate) },
            { date: withDate, period: withPeriod, subject: slot?.subject ?? null, swapped_with: period, note: swapNote(date) },
          ])
        }
      } else {
        if (forever) {
          grid[wd][period - 1] = null
          await store.saveTimetable(grid)
        } else {
          await store.clearChanges(date, [period])
          await store.addChanges([{ date, period, subject: null, swapped_with: null, note: null }])
        }
      }
      await data.reloadSchedule()
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    setBusy(true)
    try {
      const pair = slot?.change?.swapped_with
      const partnerDate = swapPartner(slot?.change)
      if (pair && partnerDate) {
        await store.clearChanges(date, [period])
        await store.clearChanges(partnerDate, [pair])
      } else {
        await store.clearChanges(date, pair ? [period, pair] : [period])
      }
      await data.reloadSchedule()
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Change class" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="stack gap-sm">
            <span className="sheet-sub">{fmtLong(date)} · Period {period} · {PERIODS[period - 1].start}–{PERIODS[period - 1].end}</span>
            <strong className="sheet-title">{slot?.subject ?? 'No class'}</strong>
          </div>
          <button className="icon-btn quiet" onClick={onClose} aria-label="Close"><Icon name="close" size={20} stroke={2} /></button>
        </div>

        <div className="seg seg-2" role="radiogroup" aria-label="What to do">
          {(['swap', 'cancel'] as Mode[]).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m === 'swap' ? 'Swap' : 'Cancel'}
            </button>
          ))}
        </div>

        {mode === 'swap' && (
          <>
            <div className="field">
              <span className="field-label">Day to swap with</span>
              <div className="chips">
                {week.map((d) => (
                  <button
                    key={d}
                    className={`chip ${withDate === d ? 'on' : ''}`}
                    aria-pressed={withDate === d}
                    onClick={() => {
                      setWithDate(d)
                      setWithPeriod(null)
                    }}
                  >
                    {DAY_NAMES[weekdayIndex(d)!].slice(0, 3)} {parseISO(d).getDate()}
                    {d === date ? ' · this day' : ''}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field-label">Class to swap with</span>
              <div className="chips">
                {others.map((s) => (
                  <button
                    key={s.period.n}
                    className={`chip ${withPeriod === s.period.n ? 'on' : ''}`}
                    aria-pressed={withPeriod === s.period.n}
                    onClick={() => setWithPeriod(s.period.n)}
                  >
                    Period {s.period.n} · {s.subject ?? 'free'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {mode === 'cancel' && <p className="lead">No class this period — the students get a free period.</p>}

        <div className="field">
          <span className="field-label">Apply to</span>
          <div className="seg seg-2">
            <button className={!forever ? 'on' : ''} onClick={() => setForever(false)}>Just this day</button>
            <button className={forever ? 'on' : ''} onClick={() => setForever(true)}>Every week</button>
          </div>
          <span className="small muted">
            {forever
              ? 'Changes the normal timetable from now on.'
              : mode === 'swap' && !sameDay
                ? `Only ${fmtTag(date)} and ${fmtTag(withDate)}. Next week stays normal.`
                : `Only ${fmtTag(date)}. Next week stays normal.`}
          </span>
        </div>

        {err && <div className="alert error">{err}</div>}

        <div className="form-actions">
          {slot?.change && <button className="btn-secondary" onClick={reset} disabled={busy}>Reset</button>}
          <button className="btn-primary" onClick={apply} disabled={busy}>
            {busy ? 'Saving…' : 'Apply'}
            {!busy && <Icon name="check" size={18} stroke={2.2} />}
          </button>
        </div>
      </div>
    </div>
  )
}
