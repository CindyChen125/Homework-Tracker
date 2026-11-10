import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, SyntheticEvent } from 'react'
import type { Account } from '../lib/store'
import { initialSidebarState, readSidebarPreferences, saveSidebarPreference, sidebarLayout, sidebarReducer } from '../lib/sidebar'
import { activateSidebarOverlay } from '../lib/sidebar-overlay'
import Icon, { type IconName } from './Icon'
import { ThemeToggle, Wordmark } from './ui'
import RoleBadge from './RoleBadge'
import { SidebarContext } from './SidebarContext'

export interface NavigationItem { route: string; href: string; label: string; icon: IconName }
const viewportWidth = () => Number.isFinite(window.innerWidth) ? window.innerWidth : 1024

export default function Sidebar({ user, items, route, onGuide, guideOpen, signOut, children }: {
  user: Account
  items: readonly NavigationItem[]
  route: string
  onGuide: () => void
  guideOpen: boolean
  signOut: () => Promise<void>
  children: ReactNode
}) {
  const [state, dispatch] = useReducer(sidebarReducer, undefined, () => {
    let preferences = {}
    try { preferences = readSidebarPreferences(localStorage) } catch { /* No storage access. */ }
    return initialSidebarState(viewportWidth(), preferences)
  })
  const saved = useRef(state)
  const layout = sidebarLayout(state)
  const drawerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const current = useRef({ mode: state.mode, overlay: layout.overlay })
  current.current = { mode: state.mode, overlay: layout.overlay }
  const [tooltip, setTooltip] = useState<{ label: string; top: number; left: number } | null>(null)
  const tooltipId = useId()
  const close = () => dispatch({ type: 'close' })
  const toggle = () => dispatch({ type: 'toggle' })

  useLayoutEffect(() => {
    const resize = () => dispatch({ type: 'resize', width: viewportWidth() })
    window.addEventListener('resize', resize)
    resize()
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    try {
      if (saved.current.desktopExpanded !== state.desktopExpanded) saveSidebarPreference(localStorage, 'desktop', state.desktopExpanded)
      if (saved.current.tabletExpanded !== state.tabletExpanded) saveSidebarPreference(localStorage, 'tablet', state.tabletExpanded)
    } catch { /* Navigation still works when localStorage is unavailable. */ }
    saved.current = state
  }, [state.desktopExpanded, state.tabletExpanded])
  useEffect(() => { setTooltip(null) }, [state.mode, layout.expanded, layout.visible])
  useLayoutEffect(() => {
    if (!layout.visible && drawerRef.current?.contains(document.activeElement)) {
      queueMicrotask(() => menuRef.current?.focus({ preventScroll: true }))
    }
  }, [layout.visible])
  useLayoutEffect(() => {
    if (guideOpen) dispatch({ type: 'close' })
  }, [guideOpen])
  useLayoutEffect(() => {
    if (!layout.overlay || !drawerRef.current || guideOpen) return
    return activateSidebarOverlay(drawerRef.current, close, () => {
      if (current.current.overlay) return null
      return current.current.mode === 'phone' ? menuRef.current : toggleRef.current
    })
  }, [layout.overlay, guideOpen])
  useEffect(() => {
    // Also cover hash changes from browser Back/Forward or other page links.
    const navigate = () => { close(); setTooltip(null) }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])

  const showTooltip = (event: SyntheticEvent<HTMLElement>, label: string) => {
    if (layout.expanded || !layout.visible) return
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({ label, top: Math.max(16, Math.min(rect.top, window.innerHeight - 176)), left: rect.right + 8 })
  }
  const hint = (label: string) => ({
    'aria-describedby': !layout.expanded && tooltip?.label === label ? tooltipId : undefined,
    onMouseEnter: (event: SyntheticEvent<HTMLElement>) => showTooltip(event, label),
    onMouseLeave: () => setTooltip(null),
    onFocus: (event: SyntheticEvent<HTMLElement>) => showTooltip(event, label),
    onBlur: () => setTooltip(null),
  })
  const toggleLabel = state.mode === 'phone' ? 'Close navigation menu' : layout.expanded ? 'Collapse sidebar' : 'Expand sidebar'
  const accountLabel = `Account: ${user.name || user.email}, ${user.email}. Role: ${user.role === 'admin' ? 'Admin' : user.role === 'editor' ? 'Editor' : 'Reader'}`

  return <SidebarContext.Provider value={{ mode: state.mode, open: layout.overlay, toggle, menuRef }}>
    <div className="app navigation-shell" data-navigation-mode={state.mode} style={{ '--navigation-offset': `${layout.offset}px` } as CSSProperties}>
      <button className="sidebar-backdrop" data-open={layout.overlay} disabled={!layout.overlay} aria-hidden={!layout.overlay || undefined} tabIndex={-1} aria-label="Close navigation menu" onClick={close} />
      <aside ref={drawerRef} id="classboard-navigation" className="sidebar" data-expanded={layout.expanded} data-visible={layout.visible}
        role={layout.overlay ? 'dialog' : undefined} aria-modal={layout.overlay ? true : undefined} aria-label="Classboard navigation" aria-hidden={!layout.visible || undefined}
        tabIndex={-1} {...(!layout.visible ? { inert: '' } : {})} onScroll={() => setTooltip(null)}>
        <div className="sidebar-header">
          <button ref={toggleRef} className="sidebar-toggle sidebar-row" onClick={toggle} aria-label={toggleLabel} aria-expanded={layout.visible && layout.expanded} aria-controls="classboard-navigation" {...hint(toggleLabel)}>
            <Icon name={state.mode === 'phone' ? 'close' : layout.expanded ? 'left' : 'right'} size={20} />
          </button>
          <a href="#/" className="sidebar-brand sidebar-label" tabIndex={layout.expanded ? undefined : -1} aria-hidden={!layout.expanded || undefined} onClick={close}><Wordmark /></a>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {items.map(item => <a key={item.route} className={`sidebar-row${route === item.route ? ' active' : ''}`} href={item.href} aria-label={item.label} aria-current={route === item.route ? 'page' : undefined}
            onClick={() => { close(); setTooltip(null) }} {...hint(item.label)}>
            <Icon name={item.icon} size={20} /><span className="sidebar-label">{item.label}</span>
          </a>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-row" data-tour="guide" onClick={() => { close(); onGuide() }} aria-label="Open the guide" {...hint('Guide')}><Icon name="help" size={20} /><span className="sidebar-label">Guide</span></button>
          <div className="sidebar-theme" {...hint('Switch theme')}><ThemeToggle row /></div>
          <div className="sidebar-account sidebar-row" role="group" tabIndex={0} aria-label={accountLabel} {...hint(accountLabel)}>
            <Icon name="user" size={20} /><span className="sidebar-label"><span className="sidebar-account-name">{user.name || user.email}</span><RoleBadge role={user.role} /></span>
          </div>
          <button className="sidebar-row" onClick={() => { close(); void signOut() }} aria-label="Sign out" {...hint('Sign out')}><Icon name="logout" size={20} /><span className="sidebar-label">Sign out</span></button>
        </div>
      </aside>
      <div className="navigation-content" {...(layout.overlay && !guideOpen ? { inert: '' } : {})} aria-hidden={layout.overlay && !guideOpen ? true : undefined}>{children}</div>
      {tooltip && !layout.expanded && <div id={tooltipId} className="sidebar-tooltip" role="tooltip" style={{ top: tooltip.top, left: tooltip.left }}>{tooltip.label}</div>}
    </div>
  </SidebarContext.Provider>
}
