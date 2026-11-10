import { useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import { SectionHeading, TopBar } from '../components/ui'
import { academicDateLabel, academicMonthCells, academicRangeLabel, EVENT_CATEGORIES, eventsInMonth, eventsOn, shiftAcademicMonth, type EventCategory } from '../lib/academic-calendar'
import { ACADEMIC_EVENTS } from '../lib/academic-events'
import { parseISO, todayISO, toISO } from '../lib/dates'

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function SchoolCalendar({ data }: { data: AppData }) {
  const today = todayISO()
  const [selected, setSelected] = useState(today)
  const [category, setCategory] = useState<EventCategory | ''>('')
  const date = parseISO(selected)
  const month = new Date(date.getFullYear(), date.getMonth(), 1)
  const monthStart = toISO(month)
  const cells = academicMonthCells(month)
  const dayEvents = eventsOn(ACADEMIC_EVENTS, selected, category || undefined)
  const monthEvents = eventsInMonth(ACADEMIC_EVENTS, month, category || undefined)

  return (
    <>
      <TopBar user={data.user} />
      <header className="page-head" data-tour="school">
        <div className="page-head-text">
          <h1>School Calendar</h1>
        </div>
      </header>
      <p className="school-calendar-intro">School dates and events. <a href="#/">Homework deadlines are on Today.</a></p>
      <p className="small muted">Dates may change. New Year's Day holiday dates have not yet been announced.</p>

      <div className="academic-layout">
        <section className="stack" aria-label="School calendar month">
          <SectionHeading action={
            <div className="head-actions">
              {selected !== today && <button className="btn-quiet" onClick={() => setSelected(today)}>Today</button>}
              <button className="icon-btn" onClick={() => setSelected(shiftAcademicMonth(selected, -1))} aria-label="Previous school calendar month"><Icon name="left" /></button>
              <button className="icon-btn" onClick={() => setSelected(shiftAcademicMonth(selected, 1))} aria-label="Next school calendar month"><Icon name="right" /></button>
            </div>
          }>
            {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </SectionHeading>

          <label className="academic-filter">
            <span>Show events</span>
            <select value={category} onChange={e => setCategory(e.target.value as EventCategory | '')}>
              <option value="">All categories</option>
              {Object.entries(EVENT_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>

          <div className="card academic-month">
            <div className="month-grid academic-grid">
              {WEEK.map(w => <div key={w} className="month-head">{w}</div>)}
              {cells.map(cell => {
                const events = eventsOn(ACADEMIC_EVENTS, cell.iso, category || undefined)
                const categories = [...new Set(events.map(e => e.category))]
                return (
                  <button
                    key={cell.iso}
                    className={`month-cell academic-cell ${cell.inMonth ? '' : 'out'} ${cell.iso === selected ? 'selected' : ''}`}
                    onClick={() => setSelected(cell.iso)}
                    aria-pressed={cell.iso === selected}
                    aria-label={`${academicDateLabel(cell.iso)}: ${events.length} school event${events.length === 1 ? '' : 's'}${events.length ? `, ${events.map(e => e.title).join(', ')}` : ''}`}
                  >
                    <span className={`month-num ${cell.iso === today ? 'today' : ''}`}>{cell.day}</span>
                    <span className="marks" aria-hidden="true">
                      {categories.slice(0, 3).map(key => <span key={key} className={`mark-dot academic-${key}`} />)}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="legend">
              {Object.entries(EVENT_CATEGORIES).map(([key, label]) => <span key={key}><span className={`mark-dot academic-${key}`} />{label}</span>)}
            </div>
          </div>
        </section>

        <div className="stack gap-lg">
          <section className="stack" aria-live="polite" aria-atomic="true">
            <SectionHeading count={dayEvents.length}>{academicDateLabel(selected)}</SectionHeading>
            {dayEvents.length === 0 ? (
              <div className="empty">{ACADEMIC_EVENTS.length === 0 ? 'School events will appear here once the calendar is ready.' : category ? 'No events in this category on this day.' : 'No school events listed for this day.'}</div>
            ) : dayEvents.map(event => (
              <article key={event.id} className="card academic-event">
                <span className={`academic-category academic-${event.category}`}>{EVENT_CATEGORIES[event.category]}</span>
                <h3>{event.title}</h3>
                <p className="academic-event-date">{academicRangeLabel(event)}</p>
                {event.audience && <p className="small muted">{event.audience}</p>}
                {event.description && <p className="card-notes">{event.description}</p>}
              </article>
            ))}
          </section>

          <section className="stack">
            <SectionHeading count={monthEvents.length}>This month</SectionHeading>
            {monthEvents.length === 0 ? (
              <div className="empty">{category ? 'No events in this category this month.' : 'No school events listed this month.'}</div>
            ) : (
              <div className="row-list">
                {monthEvents.map(event => (
                  <button key={event.id} className="row-item academic-agenda" onClick={() => setSelected(event.start < monthStart ? monthStart : event.start)}>
                    <span className={`mark-dot academic-${event.category}`} aria-hidden="true" />
                    <span className="row-item-text">
                      <span className="row-item-title">{event.title}</span>
                      <span className="row-item-meta">{academicRangeLabel(event)} · {EVENT_CATEGORIES[event.category]}</span>
                    </span>
                    <Icon name="right" size={16} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
