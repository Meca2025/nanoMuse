/**
 * The Muse-shaped left column in the harness's `sidebar` seat: an icon rail —
 * Chats, Search, the rooms (Feed, Ideas, Goals, Library), Devices, and a menu
 * in the corner for settings, shortcuts, the harness's Schedules and plugins
 * and reporting a problem — beside the chats column (search, the main chat,
 * the side chats). Collapsed, only the rail remains. The seven child seats the
 * stock sidebar declares are declared here too, so every occupant of them —
 * the brand mark, the panel glyphs, the browser, the settings shell, footer
 * actions — mounts exactly as before; only the frame around them is ours, and
 * the harness's workspace browser takes the column's place when the person
 * turns the Developer switch on.
 */
import { createElement as h, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { Avatar } from './Avatar.tsx'
import { openLink } from './bridge.ts'
import { IconBulb, IconCalendar, IconChat, IconDevices, IconFeed, IconMenu, IconPanelLeft, IconPlus, IconPuzzle, IconSearch, IconShapes, IconTarget, IconBug, IconKeyboard, IconSettings } from './icons.tsx'
import { openShortcutsReference, pressSettingsChord } from './keys.ts'
import { useLive } from './live.ts'
import { MuseChats, type ChatActions, type UseSessionList, type UseStatusMap, type UseWorkspaceList } from './MuseChats.tsx'
import { DEVICES_PANEL, FEED_PANEL, GOALS_PANEL, IDEAS_PANEL, LIBRARY_PANEL, ROOM_PANELS } from './panels.ts'
import { useRooms } from './rooms.ts'
import { usePrefs } from './prefs.ts'

/** The id the harness's Schedules plugin registers its global panel under. */
const SCHEDULES_PANEL = 'schedules'
/** The id of the harness's plugin manager panel; it lives in the corner menu. */
const PLUGINS_PANEL = 'plugins'

const COLLAPSE_SETTLE_MS = 150
const RAIL = 66

export interface PanelMeta {
  id: string
  order: number
  label: string
}

export type RenderSlot = (name: string, props: Record<string, unknown>, options?: { only?: string; fallback?: ReactNode }) => ReactNode

export interface MuseSidebarProps {
  collapsed: boolean
  width: number
  t: Translate
  renderSlot: RenderSlot
  startSession(): void
  toggleSidebar(): void
  selectPanel(id: string | null): void
  /** Open the settings dialog when the shell exposes a way; the sidebar falls back to its trigger. */
  openSettings?: (() => boolean) | undefined
  /** Open the agent's profile drawer. */
  openProfile(): void
  issuesUrl: string
  chatActions: ChatActions
  usePanels<S>(selector: (panels: readonly PanelMeta[]) => S): S
  usePanelInfo<S>(selector: (info: { activePanelId: string | null }) => S): S
  useShortcuts<S>(selector: (rows: readonly { id: string; keys: readonly string[]; aria?: string }[]) => S): S
  useSessions?: UseSessionList | undefined
  useSessionStatus?: UseStatusMap | undefined
  useWorkspaces?: UseWorkspaceList | undefined
}

interface RailButtonProps {
  label: string
  active?: boolean | undefined
  expanded?: boolean | undefined
  dot?: boolean | undefined
  onClick(): void
  children?: ReactNode
  buttonRef?: ((el: HTMLButtonElement | null) => void) | undefined
}

function RailButton({ label, active, expanded, dot, onClick, children, buttonRef }: RailButtonProps): ReactNode {
  return h('button', {
    type: 'button',
    className: 'nm-rail-btn',
    title: label,
    'aria-label': label,
    'aria-current': active ? 'page' : undefined,
    'aria-expanded': expanded,
    onClick,
    ref: buttonRef,
  }, children, dot ? h('span', { className: 'nm-rail-dot', 'aria-hidden': true }) : null)
}

interface MenuItem {
  id: string
  label: string
  icon: ReactNode
  hint?: string | undefined
  onSelect(): void
}

/** A small anchored menu; closes on outside pointer, Escape, or a choice. */
function CornerMenu({ anchor, items, onClose }: { anchor: HTMLElement; items: (MenuItem | 'sep')[]; onClose(): void }): ReactNode {
  const menu = useRef<HTMLDivElement>(null)
  const rect = anchor.getBoundingClientRect()
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (menu.current?.contains(target) || anchor.contains(target)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])
  useEffect(() => { menu.current?.querySelector('button')?.focus() }, [])
  // Open upward from the corner button, flush with the rail's right edge.
  const style = { left: rect.right + 6, bottom: Math.max(8, window.innerHeight - rect.bottom) }
  return h('div', { ref: menu, className: 'nm-menu', role: 'menu', style },
    items.map((item, index) => item === 'sep'
      ? h('div', { key: `sep-${index}`, className: 'nm-menu-sep', role: 'separator' })
      : h('button', { key: item.id, type: 'button', role: 'menuitem', className: 'nm-menu-item', onClick: () => { onClose(); item.onSelect() } },
          item.icon,
          h('span', { className: 'nm-menu-item-label' }, item.label),
          item.hint ? h('span', { className: 'nm-menu-hint' }, item.hint) : null)))
}

export function MuseSidebar(props: MuseSidebarProps): ReactNode {
  const { collapsed, width, t, renderSlot, startSession, toggleSidebar, selectPanel, openSettings: openSettingsHook, openProfile, issuesUrl, chatActions, usePanels, usePanelInfo, useShortcuts, useSessions, useSessionStatus, useWorkspaces } = props
  const live = useLive()
  const prefs = usePrefs()
  const panels = usePanels((rows) => rows)
  const active = usePanelInfo((info) => info.activePanelId)
  const settingsShortcut = useShortcuts((rows) => rows.find((row) => row.id === 'settings.open'))
  const shortcutsShortcut = useShortcuts((rows) => rows.find((row) => row.id === 'shortcuts.open'))
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const menuButton = useRef<HTMLButtonElement | null>(null)
  const column = useRef<HTMLDivElement>(null)
  const searchField = useRef<HTMLInputElement | null>(null)
  const settingsSeat = useRef<HTMLDivElement>(null)

  // Settings: the shell's own way when it offers one, else the trigger the
  // settings shell renders into its (visually hidden) seat, else the chord.
  const openSettings = () => {
    if (openSettingsHook?.()) return
    const trigger = settingsSeat.current?.querySelector<HTMLButtonElement>('button')
    if (trigger) { trigger.click(); return }
    pressSettingsChord()
  }
  const openShortcuts = () => { openShortcutsReference() }

  // The column stays mounted while the collapse animates (fading), then unmounts.
  const [settled, setSettled] = useState(collapsed)
  useEffect(() => {
    if (!collapsed) { setSettled(false); return undefined }
    const timer = window.setTimeout(() => setSettled(true), COLLAPSE_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [collapsed])
  const wide = !collapsed || !settled
  const lastWideWidth = useRef(width)
  if (!collapsed) lastWideWidth.current = width

  const schedules = panels.find((p) => p.id === SCHEDULES_PANEL)
  const plugins = panels.find((p) => p.id === PLUGINS_PANEL)
  const others = panels.filter((p) => p.id !== SCHEDULES_PANEL && p.id !== PLUGINS_PANEL && !(ROOM_PANELS as readonly string[]).includes(p.id))
  const rooms = useRooms()
  const freshFeed = rooms.feed.posts.some((p) => p.at > rooms.feedSeenAt)
  const onlineOthers = live.hub.devices.filter((d) => d.id !== live.hub.deviceId && d.kind !== 'web' && d.online).length

  const showChats = () => { selectPanel(null) }
  const search = () => {
    selectPanel(null)
    if (collapsed) toggleSidebar()
    window.setTimeout(() => {
      // Our search field, or the browser's own (the first text input in the column).
      const input = searchField.current ?? column.current?.querySelector<HTMLInputElement>('input[type="search"], input[type="text"], input:not([type])')
      input?.focus()
    }, collapsed ? COLLAPSE_SETTLE_MS + 50 : 0)
  }

  const menuItems: (MenuItem | 'sep')[] = [
    { id: 'settings', label: t('menuSettings'), icon: h(IconSettings, { size: 16 }), hint: keysHint(settingsShortcut?.keys), onSelect: openSettings },
    { id: 'shortcuts', label: t('menuShortcuts'), icon: h(IconKeyboard, { size: 16 }), hint: keysHint(shortcutsShortcut?.keys), onSelect: openShortcuts },
    'sep',
    ...(schedules ? [{ id: 'schedules', label: schedules.label, icon: h('span', { style: { display: 'inline-flex', width: 16, height: 16 } }, renderSlot('sidebar.panellist', { size: 16, active: false }, { only: SCHEDULES_PANEL, fallback: h(IconCalendar, { size: 16 }) })), onSelect: () => selectPanel(SCHEDULES_PANEL) }] : []),
    ...(plugins ? [{ id: 'plugins', label: plugins.label, icon: h(IconPuzzle, { size: 16 }), onSelect: () => selectPanel(PLUGINS_PANEL) }] : []),
    ...others.map((p) => ({ id: p.id, label: p.label, icon: h('span', { style: { display: 'inline-flex', width: 16, height: 16 } }, renderSlot('sidebar.panellist', { size: 16, active: false }, { only: p.id })), onSelect: () => selectPanel(p.id) })),
    { id: 'toggle', label: collapsed ? t('menuExpand') : t('menuCollapse'), icon: h(IconPanelLeft, { size: 16 }), onSelect: toggleSidebar },
    'sep',
    { id: 'issue', label: t('menuReport'), icon: h(IconBug, { size: 16 }), onSelect: () => openLink(issuesUrl) },
  ]

  // Muse's rail starts with Chats (a dot while the agent works); the agent's face is
  // the pinned header and the drawer, not a rail button. The brand mark stays mounted
  // (hidden) for the accent and keep-awake effects it carries.
  const busy = typeof useSessions === 'function' ? useSessions((state) => state.ids.some((id) => state.byId[id]?.running === true)) : false
  const rail = h('nav', { className: 'nm-rail', 'aria-label': t('railLabel') },
    h('div', { className: 'nm-rail-top', 'data-window-drag': true }),
    h('div', { className: 'nm-hidden' }, renderSlot('sidebar.brand.mark', { size: 36 })),
    h(RailButton, { label: t('railChats'), active: active === null, dot: busy, onClick: showChats }, h(IconChat, { size: 21 })),
    h(RailButton, { label: t('railSearch'), onClick: search }, h(IconSearch, { size: 21 })),
    // Muse's rooms, in Muse's order: Feed, Ideas, Goals, Library; then our Devices.
    h(RailButton, { label: t('railFeed'), active: active === FEED_PANEL, dot: freshFeed && active !== FEED_PANEL, onClick: () => selectPanel(FEED_PANEL) }, h(IconFeed, { size: 21 })),
    h(RailButton, { label: t('railIdeas'), active: active === IDEAS_PANEL, onClick: () => selectPanel(IDEAS_PANEL) }, h(IconBulb, { size: 21 })),
    h(RailButton, { label: t('railGoals'), active: active === GOALS_PANEL, onClick: () => selectPanel(GOALS_PANEL) }, h(IconTarget, { size: 21 })),
    h(RailButton, { label: t('railLibrary'), active: active === LIBRARY_PANEL, onClick: () => selectPanel(LIBRARY_PANEL) }, h(IconShapes, { size: 21 })),
    h(RailButton, { label: t('railDevices'), active: active === DEVICES_PANEL, dot: onlineOthers > 0, onClick: () => selectPanel(DEVICES_PANEL) }, h(IconDevices, { size: 21 })),
    h('div', { className: 'nm-rail-spacer' }),
    collapsed ? h(RailButton, { label: t('railNew'), onClick: startSession }, h(IconPlus, { size: 21 })) : null,
    collapsed ? h(RailButton, { label: t('railProfile'), onClick: openProfile }, h('span', { className: 'nm-rail-face' }, h(Avatar, { size: 22, profile: live.profile }))) : null,
    h(RailButton, { label: t('railMore'), expanded: menuAnchor !== null, onClick: () => setMenuAnchor((current) => (current ? null : menuButton.current)), buttonRef: (el) => { menuButton.current = el } }, h(IconMenu, { size: 21 })),
    // The settings shell lives in this seat: its trigger is hidden here (the
    // menu opens it), but its dialog and the onboarding steps mount through it.
    h('div', { ref: settingsSeat, className: 'nm-hidden' }, renderSlot('sidebar.settings', { wide: false })),
    h('div', { className: 'nm-hidden' }, renderSlot('sidebar.toggle.badge', {})))

  const browser = prefs.showHarness || typeof useSessions !== 'function'
  const chats = wide
    ? h('div', { ref: column, className: `nm-col${collapsed ? ' nm-fading' : ''}`, style: { width: Math.max(0, (collapsed ? lastWideWidth.current : width) - RAIL) } },
        h('div', { className: 'nm-col-top', 'data-window-drag': true }),
        browser
          ? h('div', { className: 'nm-col-body' },
              h('div', { className: 'nm-col-head' },
                h('span', null, t('railChats')),
                h('div', { className: 'nm-col-head-actions' },
                  h('button', { type: 'button', className: 'nm-icon-btn', title: t('railNew'), 'aria-label': t('railNew'), onClick: startSession }, h(IconPlus, { size: 18 })))),
              renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => { if (collapsed) toggleSidebar() } }))
          : h('div', { className: 'nm-col-body' },
              h(MuseChats, { t, useSessions, useSessionStatus, useWorkspaces, actions: chatActions, searchRef: (el) => { searchField.current = el } })),
        h('div', { className: 'nm-col-foot' }, renderSlot('sidebar.footer.action', { wide: true })))
    : null

  return h('div', { className: 'nm-sidebar', style: { width: wide ? (collapsed ? lastWideWidth.current : width) : RAIL } },
    rail,
    chats,
    menuAnchor ? h(CornerMenu, { anchor: menuAnchor, items: menuItems, onClose: () => setMenuAnchor(null) }) : null)
}

/** `⌘ ,` style hint from the catalog's key names; empty when unbound. */
function keysHint(keys: readonly string[] | undefined): string | undefined {
  if (!keys || keys.length === 0) return undefined
  return keys.join(' ')
}
