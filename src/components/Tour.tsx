import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon'

const seenKey = (userId: string) => `hw-tour-seen:${userId}`

export const tourSeen = (userId: string) => {
  try {
    return localStorage.getItem(seenKey(userId)) === '1'
  } catch {
    return true
  }
}

const markSeen = (userId: string) => {
  try {
    localStorage.setItem(seenKey(userId), '1')
  } catch {
  }
}

interface Step {
  route?: string
  target?: string
  title: string
  body: string
  editorOnly?: boolean
  adminOnly?: boolean
  menuBody?: string
}

const STEPS: Step[] = [
  {
    title: 'A quick tour',
    body: 'Classboard holds the homework, the timetable and the class files. This takes about a minute, and you can leave it at any point.',
  },
  {
    route: '#/',
    target: '[data-tour="day-head"]',
    title: 'The day you are looking at',
    body: 'Today opens on today. The arrows step one day back or forward, and the Today button brings you home again.',
  },
  {
    route: '#/',
    target: '[data-tour="due-list"]',
    title: 'What has to be handed in',
    body: 'On today this lists everything due the next school day — the weekend and the national holidays are skipped. On any other day it lists that day’s own work.',
  },
  {
    route: '#/',
    target: '[data-tour="calendar"]',
    title: 'The month at a glance',
    body: 'A star marks a test, and a dot marks a project or a longer piece of homework, in its subject’s colour. Green days are school days, sand days are weekends and holidays. Tap any day to see its homework.',
  },
  {
    route: '#/',
    target: '[data-tour="message"]',
    title: 'The message for the group',
    body: 'Classboard writes the WeChat message for you: the homework, the reminders and any timetable change. Press Copy, then paste it into the group. Week gives the Sunday preview instead.',
    editorOnly: true,
  },
  {
    route: '#/schedule',
    target: '[data-tour="slots"]',
    title: 'The timetable',
    body: 'Pick a day here and its lessons appear below with their bell times. Any change the teacher makes shows up here.',
  },
  {
    route: '#/schedule',
    target: '[data-tour="lessons"]',
    title: 'Changing a lesson',
    body: 'Tap a lesson to swap it with another one — the same day or a different day — or to cancel it, either just for that day or every week from now on. The group message picks the change up too.',
    editorOnly: true,
  },
  {
    route: '#/school-calendar',
    target: '[data-tour="school"]',
    title: 'The school calendar',
    body: 'School dates and events, month by month. Homework deadlines stay on Today.',
  },
  {
    route: '#/materials',
    target: '[data-tour="files"]',
    title: 'Files and notes',
    body: 'Review materials, worksheets and notes live here, grouped by subject, so nobody has to scroll back through the chat to find them.',
  },
  {
    route: '#/news',
    target: '[data-tour="news"]',
    title: 'Class news',
    body: 'Announcements, achievements and updates from the class. Filter by category to find a post.',
  },
  {
    route: '#/feedback',
    target: '[data-tour="feedback"]',
    title: 'Feedback',
    body: 'Report a problem, suggest an improvement or follow up on an earlier report.',
  },
  {
    route: '#/post',
    target: '[data-tour="form"]',
    title: 'Adding homework',
    body: 'Pick the type and the subject, write what has to be done, and set the dates. EE, EC and Math open to show their classes. Posting it updates the day’s list, the calendar and the group message at once.',
    editorOnly: true,
  },
  {
    route: '#/people',
    target: '[data-tour="people"]',
    title: 'Who may post',
    body: 'Everyone signs up with their own email, and a new account can only read. Make someone an editor here and they can post homework, change the timetable and upload files.',
    adminOnly: true,
  },
  {
    target: '[data-tour="guide"], [data-tour="menu"]',
    title: 'That is everything',
    body: 'Open this guide again from here whenever you need it.',
    menuBody: 'Open the menu here, then choose Guide whenever you want this tour again.',
  },
]

/** The first element matching the selector that is actually on screen. */
const findTarget = (sel: string) =>
  [...document.querySelectorAll<HTMLElement>(sel)].find((el) => !el.closest('[inert],[hidden]') && (el.offsetParent !== null || el === document.body)) ?? null

const routeOf = (hash: string) => hash.replace(/^#\/?/, '').split('?')[0]

interface Rect { top: number; left: number; width: number; height: number }

export default function Tour({ userId, editor, admin, onClose }: { userId: string; editor: boolean; admin: boolean; onClose: () => void }) {
  const steps = STEPS.filter((s) => (!s.editorOnly || editor) && (!s.adminOnly || admin))
  const [n, setN] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [cardH, setCardH] = useState(210)
  const step = steps[n]
  const cardRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    markSeen(userId)
    onClose()
  }, [onClose, userId])

  useEffect(() => {
    let alive = true
    if (step.route && routeOf(location.hash) !== routeOf(step.route)) {
      location.hash = step.route
      setRect(null)
    }
    if (!step.target) {
      setRect(null)
      return
    }
    const look = (tries: number) => {
      if (!alive) return
      const el = findTarget(step.target!)
      if (!el) {
        setRect(null)
        if (tries > 0) setTimeout(() => look(tries - 1), 80)
        return
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      for (const wait of [60, 320, 700]) {
        setTimeout(() => {
          if (!alive) return
          const r = el.getBoundingClientRect()
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        }, wait)
      }
    }
    look(150)
    return () => {
      alive = false
    }
  }, [step])

  // Keep the hole on the element while the page moves under it.
  useLayoutEffect(() => {
    if (!step.target) return
    const measure = () => {
      const el = findTarget(step.target!)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step])

  // Move focus into the guide, keep it there, and hand it back when the guide closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    cardRef.current?.querySelector<HTMLElement>('.btn-primary')?.focus()
    return () => {
      if (before?.isConnected) before.focus()
    }
  }, [])

  useLayoutEffect(() => {
    setCardH(cardRef.current?.offsetHeight ?? 210)
  }, [n])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const buttons = [...(cardRef.current?.querySelectorAll<HTMLElement>('button') ?? [])]
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        const here = document.activeElement
        if (!first || !last) return
        if (!cardRef.current!.contains(here) || (e.shiftKey && here === first) || (!e.shiftKey && here === last)) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus()
        }
      }
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') setN((i) => Math.min(i + 1, steps.length - 1))
      if (e.key === 'ArrowLeft') setN((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, steps.length])

  const pad = 8
  const hole = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null

  const cardStyle: React.CSSProperties = {}
  if (hole) {
    const roomBelow = window.innerHeight - (hole.top + hole.height)
    const fitsBelow = roomBelow >= cardH + 32
    const fitsAbove = hole.top >= cardH + 32
    if (fitsBelow || roomBelow >= hole.top) cardStyle.bottom = 16
    else cardStyle.top = 16
    // A target too tall for either side: park the card beside it if the screen is wide enough.
    if (!fitsBelow && !fitsAbove) {
      const cardW = Math.min(380, window.innerWidth - 32)
      const roomRight = window.innerWidth - (hole.left + hole.width)
      if (roomRight >= cardW + 32) Object.assign(cardStyle, { left: hole.left + hole.width + 16, transform: 'none' })
      else if (hole.left >= cardW + 32) Object.assign(cardStyle, { left: hole.left - cardW - 16, transform: 'none' })
    }
  }
  // Off a phone the lit element can be the menu button instead of the sidebar's.
  const body = step.menuBody && !findTarget('[data-tour="guide"]') ? step.menuBody : step.body

  const last = n === steps.length - 1

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      {/* Swallows clicks so a stray tap can't end the guide; Skip and Escape do that. */}
      <div className={`tour-shade${hole ? '' : ' dim'}`} />
      {hole && <div className="tour-hole" style={hole} />}
      <div className={`tour-card ${hole ? '' : 'middle'}`} style={cardStyle} ref={cardRef}>
        <div className="tour-step">Step {n + 1} of {steps.length}</div>
        <h3 id="tour-title">{step.title}</h3>
        <p id="tour-body">{body}</p>
        <div className="tour-actions">
          <button className="link-btn" onClick={close}>Skip</button>
          <div className="tour-buttons">
            {n > 0 && <button className="btn-quiet" onClick={() => setN(n - 1)}>Back</button>}
            <button className="btn-primary" onClick={() => (last ? close() : setN(n + 1))}>
              {last ? 'Done' : 'Next'}
              {!last && <Icon name="right" size={16} stroke={2.4} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
