/**
 * The Muse-shaped left column in the harness's `sidebar` seat: an icon rail
 * (the agent's face, Chats, Search, the harness's global panels such as
 * Schedules, Devices, and a menu in the corner for everything else) beside a
 * chats column that hosts the harness's own workspace and session browser.
 * Collapsed, only the rail remains. The seven child seats the stock sidebar
 * declares are declared here too, so every occupant of them — the brand mark,
 * the panel glyphs, the browser, the settings shell, footer actions — mounts
 * exactly as before; only the frame around them is ours.
 */
import { createElement as h, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { IconCalendar, IconChat, IconDevices, IconMenu, IconPanelLeft, IconPlus, IconPuzzle, IconSearch, IconBug, IconKeyboard, IconSettings } from './icons.tsx'
import { openShortcutsReference, pressSettingsChord } from './keys.ts'
import { useLive } from './live.ts'
import { DEVICES_PANEL } from './panels.ts'

/** The id the harness's Schedules plugin registers its global panel under. */
const SCHEDULES_PANEL = 'schedules'
/** The id of the harness's plugin manager panel; it lives in the corner menu. */
const PLUGINS_PANEL = 'plugins'

const COLLAPSE_SETTLE_MS = 150

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
  issuesUrl: string
  usePanels<S>(selector: (panels: readonly PanelMeta[]) => S): S
  usePanelInfo<S>(selector: (info: { activePanelId: string | null }) => S): S
  useShortcuts<S>(selector: (rows: readonly { id: string; keys: readonly string[]; aria?: string }[]) => S): S
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
  const { collapsed, width, t, renderSlot, startSession, toggleSidebar, selectPanel, openSettings: openSettingsHook, issuesUrl, usePanels, usePanelInfo, useShortcuts } = props
  const live = useLive()
  const panels = usePanels((rows) => rows)
  const active = usePanelInfo((info) => info.activePanelId)
  const settingsShortcut = useShortcuts((rows) => rows.find((row) => row.id === 'settings.open'))
  const shortcutsShortcut = useShortcuts((rows) => rows.find((row) => row.id === 'shortcuts.open'))
  const newShortcut = useShortcuts((rows) => rows.find((row) => row.id === 'session.new'))
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const menuButton = useRef<HTMLButtonElement | null>(null)
  const column = useRef<HTMLDivElement>(null)
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
  const others = panels.filter((p) => p.id !== SCHEDULES_PANEL && p.id !== PLUGINS_PANEL && p.id !== DEVICES_PANEL)
  const onlineOthers = live.hub.devices.filter((d) => d.id !== live.hub.deviceId && d.kind !== 'web' && d.online).length

  const showChats = () => { selectPanel(null) }
  const search = () => {
    selectPanel(null)
    if (collapsed) toggleSidebar()
    // The browser's own search field is the first text input in the column.
    window.setTimeout(() => {
      const input = column.current?.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')
      input?.focus()
    }, collapsed ? COLLAPSE_SETTLE_MS + 50 : 0)
  }

  const menuItems: (MenuItem | 'sep')[] = [
    { id: 'settings', label: t('menuSettings'), icon: h(IconSettings, { size: 16 }), hint: keysHint(settingsShortcut?.keys), onSelect: openSettings },
    { id: 'shortcuts', label: t('menuShortcuts'), icon: h(IconKeyboard, { size: 16 }), hint: keysHint(shortcutsShortcut?.keys), onSelect: openShortcuts },
    'sep',
    ...(plugins ? [{ id: 'plugins', label: plugins.label, icon: h(IconPuzzle, { size: 16 }), onSelect: () => selectPanel(PLUGINS_PANEL) }] : []),
    ...others.map((p) => ({ id: p.id, label: p.label, icon: h('span', { style: { display: 'inline-flex', width: 16, height: 16 } }, renderSlot('sidebar.panellist', { size: 16, active: false }, { only: p.id })), onSelect: () => selectPanel(p.id) })),
    { id: 'toggle', label: collapsed ? t('menuExpand') : t('menuCollapse'), icon: h(IconPanelLeft, { size: 16 }), onSelect: toggleSidebar },
    'sep',
    { id: 'issue', label: t('menuReport'), icon: h(IconBug, { size: 16 }), onSelect: () => { window.open(issuesUrl, '_blank', 'noopener') } },
  ]

  const rail = h('nav', { className: 'nm-rail', 'aria-label': t('railLabel') },
    h('div', { className: 'nm-rail-top', 'data-window-drag': true }),
    h('button', { type: 'button', className: 'nm-rail-avatar', title: live.profile.name || t('brand'), 'aria-label': t('railProfile'), onClick: openSettings },
      renderSlot('sidebar.brand.mark', { size: 36 })),
    h(RailButton, { label: t('railChats'), active: active === null, onClick: showChats }, h(IconChat, { size: 20 })),
    h(RailButton, { label: t('railSearch'), onClick: search }, h(IconSearch, { size: 20 })),
    schedules
      ? h(RailButton, { label: schedules.label, active: active === SCHEDULES_PANEL, onClick: () => selectPanel(SCHEDULES_PANEL) },
          renderSlot('sidebar.panellist', { size: 20, active: active === SCHEDULES_PANEL }, { only: SCHEDULES_PANEL, fallback: h(IconCalendar, { size: 20 }) }))
      : null,
    h(RailButton, { label: t('railDevices'), active: active === DEVICES_PANEL, dot: onlineOthers > 0, onClick: () => selectPanel(DEVICES_PANEL) }, h(IconDevices, { size: 20 })),
    h('div', { className: 'nm-rail-spacer' }),
    collapsed ? h(RailButton, { label: t('railNew'), onClick: startSession }, h(IconPlus, { size: 20 })) : null,
    h(RailButton, { label: t('railMore'), expanded: menuAnchor !== null, onClick: () => setMenuAnchor((current) => (current ? null : menuButton.current)), buttonRef: (el) => { menuButton.current = el } }, h(IconMenu, { size: 20 })),
    // The settings shell lives in this seat: its trigger is hidden here (the
    // menu opens it), but its dialog and the onboarding steps mount through it.
    h('div', { ref: settingsSeat, className: 'nm-hidden' }, renderSlot('sidebar.settings', { wide: false })),
    h('div', { className: 'nm-hidden' }, renderSlot('sidebar.toggle.badge', {})))

  const chats = wide
    ? h('div', { ref: column, className: `nm-col${collapsed ? ' nm-fading' : ''}`, style: { width: Math.max(0, (collapsed ? lastWideWidth.current : width) - 56) } },
        h('div', { className: 'nm-col-head', 'data-window-drag': true },
          h('span', null, t('railChats')),
          h('div', { className: 'nm-col-head-actions' },
            h('button', { type: 'button', className: 'nm-icon-btn', title: `${t('railNew')}${keysHint(newShortcut?.keys) ? ` (${keysHint(newShortcut?.keys)})` : ''}`, 'aria-label': t('railNew'), 'aria-keyshortcuts': newShortcut?.aria, onClick: startSession }, h(IconPlus, { size: 18 })),
            h('button', { type: 'button', className: 'nm-icon-btn', title: t('menuCollapse'), 'aria-label': t('menuCollapse'), onClick: toggleSidebar }, h(IconPanelLeft, { size: 18 })))),
        h('div', { className: 'nm-col-body' },
          renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => { if (collapsed) toggleSidebar() } })),
        h('div', { className: 'nm-col-foot' }, renderSlot('sidebar.footer.action', { wide: true })))
    : null

  return h('div', { className: 'nm-sidebar', style: { width: wide ? (collapsed ? lastWideWidth.current : width) : 56 } },
    rail,
    chats,
    menuAnchor ? h(CornerMenu, { anchor: menuAnchor, items: menuItems, onClose: () => setMenuAnchor(null) }) : null)
}

/** `⌘ ,` style hint from the catalog's key names; empty when unbound. */
function keysHint(keys: readonly string[] | undefined): string | undefined {
  if (!keys || keys.length === 0) return undefined
  return keys.join(' ')
}
