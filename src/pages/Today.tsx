import { useEffect, useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import MonthGrid, { Legend } from '../components/MonthGrid'
import ClassNews from '../components/ClassNews'
import { ItemCard, MessageCard, SectionHeading, TopBar } from '../components/ui'
import { addDays, fmtDue, fmtEyebrow, fmtHead, fmtTag, nextSchoolDay, parseISO, relative, todayISO } from '../lib/dates'
import { buildMessage, buildWeekMessage, deadlinesAfter, groupBySubject, homeworkForDay, onCalendar, REMINDER_DAYS, upcomingFrom } from '../lib/homework'
import { holidayOn, makeupOn } from '../lib/holidays'
import { changeLines, daySlots } from '../lib/schedule'

/** A link can open a particular date: #/?d=2026-10-08 */
function dayFromHash() {
  const q = location.hash.split('?')[1] ?? ''
  const d = new URLSearchParams(q).get('d')
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

export default function Today({ data }: { data: AppData }) {
  const today = todayISO()
  const [day, setDay] = useState(() => dayFromHash() ?? today)
  const [month, setMonth] = useState(() => {
    const d = parseISO(dayFromHash() ?? today)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const isToday = day === today

  // Following a #/?d=… link while the page is already open should still move the day.
  useEffect(() => {
    const onHash = () => {
      const asked = dayFromHash() ?? today
      setDay(asked)
      const d = parseISO(asked)
      setMonth((m) => (d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth() ? m : new Date(d.getFullYear(), d.getMonth(), 1)))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [today])

  /** Picking a day pulls the grid to that month; the month arrows then browse freely. */
  const selectDay = (iso: string) => {
    setDay(iso)
    const d = parseISO(iso)
    if (d.getFullYear() !== month.getFullYear() || d.getMonth() !== month.getMonth()) {
      setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    }
    // Keep the address shareable without filling up the back button.
    location.replace(iso === today ? '#/' : `#/?d=${iso}`)
  }

  const upcoming = upcomingFrom(data.items, today)
  // On today the list looks ahead: what has to be handed in the next school day,
  // which is what the class needs tonight. On any other day it is that day's own
  // work, whether still to come or already gone. Subjects stay together, in the
  // order the chat message uses.
  const dayHoliday = holidayOn(day)
  const dayMakeup = makeupOn(day)
  const handIns = homeworkForDay(data.items, day, today)
  const listDay = handIns.dueDate
  const dueList = groupBySubject(handIns.items).flatMap(([, list]) => list)
  const futureGroups = isToday ? deadlinesAfter(data.items, listDay) : []
  const futureCount = futureGroups.reduce((count, [, items]) => count + items.length, 0)
  const listTitle = isToday
    ? `Due next school day (${fmtTag(listDay)})`
    : day < today
      ? 'Was due this day'
      : 'Due this day'
  // 'tomorrow' reads on its own; a weekday needs an 'on' in front of it.
  const listWhen = fmtDue(today, listDay).replace(/^Due (?!today|tomorrow)/, 'on ').replace(/^Due /, '')
  // One calendar, everything on it: tests, projects and longer-range homework.
  const onGrid = data.items.filter(onCalendar)

  const filesFor = (id: string) => data.materials.filter((m) => m.item_id === id)
  // Timetable changes for the next school day go into the message, so the class hears about swaps.
  const nextDay = nextSchoolDay(day)
  const swaps = changeLines(daySlots(nextDay, data.timetable, data.changes))
  const nextMonday = addDays(today, ((8 - parseISO(today).getDay()) % 7) || 7)
  const shiftMonth = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <>
      <TopBar user={data.user} />

      <header className="page-head" data-tour="day-head">
        <div className="page-head-text">
          <div className="eyebrow">
            {fmtEyebrow(day)}
            {!isToday && ` · ${relative(today, day)}`}
            {dayHoliday && ` · ${dayHoliday.name} holiday`}
            {dayMakeup && ' · make-up school day'}
          </div>
          <h1>{isToday ? 'Today' : fmtHead(day)}</h1>
        </div>
        <div className="head-actions">
          {!isToday && <button className="btn-quiet" onClick={() => selectDay(today)}>Today</button>}
          <button className="icon-btn" onClick={() => selectDay(addDays(day, -1))} aria-label="Previous day">
            <Icon name="left" />
          </button>
          <button className="icon-btn" onClick={() => selectDay(addDays(day, 1))} aria-label="Next day">
            <Icon name="right" />
          </button>
          {data.editor && (
            <a href="#/post" className="btn-primary desktop-only">
              <Icon name="plus" size={16} stroke={2.4} />
              Add homework
            </a>
          )}
        </div>
      </header>

      <div className="today-grid">
        <div className="col">
          <section className="stack order-1" data-tour="due-list">
            <SectionHeading count={dueList.length}>{listTitle}</SectionHeading>
            {data.loading ? (
              <div className="empty">Loading…</div>
            ) : dueList.length === 0 ? (
              <div className="empty">{isToday ? `Nothing to hand in ${listWhen}.` : 'Nothing due on this day.'}</div>
            ) : (
              dueList.map((i) => <ItemCard key={i.id} item={i} files={filesFor(i.id)} tick showDue={false} />)
            )}
          </section>

          {isToday && (
            <details className="coming-up order-2" open>
              <summary className="coming-up-toggle">
                <span className="coming-up-heading">Coming Up</span>
                {!data.loading && <span className="count">{futureCount}</span>}
                <Icon name="down" size={18} />
              </summary>
              <div className="coming-up-body">
                {data.loading ? (
                  <div className="empty">Loading upcoming assignments…</div>
                ) : futureGroups.length === 0 ? (
                  <div className="empty">No assignments due after the next school day.</div>
                ) : (
                  futureGroups.map(([date, items]) => (
                    <section key={date} className="deadline-group" aria-labelledby={`deadline-${date}`}>
                      <h3 id={`deadline-${date}`} className="deadline-date">
                        <time dateTime={date}>{parseISO(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</time>
                      </h3>
                      {groupBySubject(items).flatMap(([, list]) => list).map((i) => (
                        <ItemCard key={i.id} item={i} files={filesFor(i.id)} tick showDue={false} />
                      ))}
                    </section>
                  ))
                )}
              </div>
            </details>
          )}

          {data.editor && !data.loading && (
            <div className="order-5" data-tour="message">
              <MessageCard
                text={buildMessage(data.items, day, swaps, fmtTag(nextDay))}
                weekText={buildWeekMessage(data.items, nextMonday)}
                reminders={upcoming.length + swaps.length}
              />
            </div>
          )}
        </div>

        <div className="col">
          <section className="stack order-3" data-tour="calendar">
            <SectionHeading
              action={
                <div className="head-actions">
                  <button className="icon-btn sm" onClick={() => shiftMonth(-1)} aria-label="Previous month"><Icon name="left" size={16} /></button>
                  <button className="icon-btn sm" onClick={() => shiftMonth(1)} aria-label="Next month"><Icon name="right" size={16} /></button>
                </div>
              }
            >
              {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </SectionHeading>

            <div className="card month-card">
              <MonthGrid month={month} items={onGrid} selected={day} onSelect={selectDay} />
              <Legend />
            </div>
          </section>
          <ClassNews data={data} />
        </div>
      </div>
    </>
  )
}

export { REMINDER_DAYS }
