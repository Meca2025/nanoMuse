/**
 * The nanoMuse browser half: the Muse look on the harness's Web client. The
 * left column (an icon rail beside the harness's chats browser), the agent
 * pinned over the conversation with its status line, a Devices page, the
 * first-run welcome, the nanoMuse section in Settings and the toasts other
 * devices send. Everything here is a slot registration — the harness's client
 * stays the harness's; we occupy the seats it declares (and, for the sidebar,
 * take over the one seat whose stock occupant the bundle layer switches off,
 * declaring the same children so every other plugin's contribution still
 * lands where it did).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { createElement as h, useEffect } from 'react'
import type { Translate } from './api.ts'
import { Avatar, BrandName, type Mood } from './Avatar.tsx'
import { makeCapsule } from './Capsule.tsx'
import { makeCloudSection } from './CloudSection.tsx'
import { makeDevicesPanel } from './DevicesPanel.tsx'
import { IconPanelLeft, IconPlus } from './icons.tsx'
import { pressSettingsChord } from './keys.ts'
import { useLive } from './live.ts'
import { en, zh } from './locales.ts'
import { MuseHeader, type UseSessionStatus } from './MuseHeader.tsx'
import { MuseSidebar, type MuseSidebarProps, type PanelMeta } from './MuseSidebar.tsx'
import { makeOnboarding, type OnboardingOwnerProps } from './Onboarding.tsx'
import { DEVICES_PANEL, ISSUES_URL } from './panels.ts'
import { ensureStyles, setAccent } from './styles.ts'
import { settingsBus } from './bus.ts'

export const name = 'nanomuse-client'
/** Required services: slots, the locale table, the frame, the workspace UI's session actions, shortcuts. */
export const inject = ['slots', 'locale', 'layout', 'uiWorkspace', 'shortcuts']

/** The slot and locale faces we use, named here so the plugin reads plainly. */
interface SlotRegistrar {
  inject(name: string, body: () => unknown): unknown
  register(options: Record<string, unknown>, component: (props: never) => unknown): unknown
  entriesOfSlot(name: string): { options: { id?: string; order?: number; label?: unknown } }[]
  subscribe(name: string, listener: () => void): () => void
}
interface LocaleTable {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  bind(ns: string): (key: string, values?: Record<string, string | number>) => string
  subscribe(listener: () => void): () => void
}
interface LayoutService {
  toggleSidebar(): void
  selectPanel(id: string | null): void
}
interface WorkspaceNavigation {
  startSession(workspaceId?: string): void
}
interface ShortcutsService {
  catalog: unknown
}

interface SessionFace {
  cancel(): Promise<unknown>
}
interface SessionsService {
  using<T>(target: string, options: { source: string }, operation: (reference: { ready: Promise<unknown>; binding: { session: SessionFace } }) => Promise<T>): Promise<T>
}

/** A minimal observable snapshot, the shape the slot host turns into a `useX` hook. */
function observable<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: (next: T) => { value = next; for (const l of listeners) l() },
  }
}

/** The agent's mood from what its sessions are doing: waiting beats working beats idle. */
function useMood(useSessionStatus: UseSessionStatus | undefined): Mood {
  if (typeof useSessionStatus !== 'function') return 'idle'
  return useSessionStatus((snapshot) => {
    let mood: Mood = 'idle'
    for (const status of snapshot.values()) {
      if (status.pendingInteraction !== undefined) return 'waiting'
      if (status.running === true) mood = 'working'
    }
    return mood
  })
}

export function apply(ctx: ClientContext): void {
  const raw = (ctx as unknown as { slots: SlotRegistrar }).slots
  // A seat that fails to register is reported and skipped, not fatal for the
  // whole plugin: the face, the column and the pages stay independent.
  const slots: SlotRegistrar = {
    ...raw,
    entriesOfSlot: (name) => raw.entriesOfSlot(name),
    subscribe: (name, listener) => raw.subscribe(name, listener),
    register: (options, component) => raw.register(options, component),
    inject: (name, body) => raw.inject(name, () => {
      try {
        return body()
      } catch (error) {
        console.error(`[nanomuse] seat "${name}" did not register:`, error)
        return () => undefined
      }
    }),
  }
  const locale = (ctx as unknown as { locale: LocaleTable }).locale
  const layout = (ctx as unknown as { layout: LayoutService }).layout
  const workspaces = (ctx as unknown as { get(name: string): unknown }).get('uiWorkspace') as WorkspaceNavigation
  const shortcuts = (ctx as unknown as { shortcuts: ShortcutsService }).shortcuts

  ctx.effect(() => locale.register('nanomuse', { en, zh }), 'nanomuse: dictionaries')
  ctx.effect(() => ensureStyles(), 'nanomuse: stylesheet')
  const t = locale.bind('nanomuse') as Translate

  // Settings opens through whatever shell occupies `sidebar.settings`: the
  // bus carries the opener our own shell registers; without one the sidebar
  // clicks the stock shell's trigger.
  const openSettings = (): boolean => settingsBus.open?.() ?? false

  // The brand seats: the account's face, with a mood, and the account's name.
  // The mark is always mounted, so it also keeps the accent colour current.
  slots.inject('sidebar.brand.mark', () =>
    slots.register({ name: 'sidebar.brand.mark' }, ({ size, useSessionStatus }: { size: number; useSessionStatus?: UseSessionStatus }) => {
      const live = useLive()
      const mood = useMood(useSessionStatus)
      useEffect(() => { setAccent(live.profile.color) }, [live.profile.color])
      return h(Avatar, { size, profile: live.profile, mood, title: live.profile.name })
    }))
  slots.inject('sidebar.brand.name', () =>
    slots.register({ name: 'sidebar.brand.name' }, () => {
      const live = useLive()
      return h(BrandName, { text: live.profile.name || t('brand') })
    }))

  // The hero above a blank session: the agent, not a logo.
  slots.inject('conversation.hero.brand.mark', () =>
    slots.register({ name: 'conversation.hero.brand.mark' }, ({ size, className }: { size: number; className?: string | undefined }) => {
      const live = useLive()
      return h(Avatar, { size, className, profile: live.profile, title: live.profile.name })
    }))

  // The left column. The panel list mirrors the `sidebar.panellist` ledger the
  // way the stock sidebar's does, labels resolved per locale.
  const panels = observable<readonly PanelMeta[]>([])
  const syncPanels = (): void => {
    const next = slots.entriesOfSlot('sidebar.panellist')
      .map(({ options }) => ({ id: options.id ?? '', order: options.order ?? 0, label: resolveSlotLabel(options.label as never) ?? options.id ?? '' }))
      .sort((a, b) => a.order - b.order)
    const previous = panels.getSnapshot()
    if (previous.length === next.length && previous.every((p, i) => p.id === next[i]!.id && p.order === next[i]!.order && p.label === next[i]!.label)) return
    panels.set(next)
  }
  ctx.effect(() => slots.subscribe('sidebar.panellist', syncPanels), 'nanomuse: panel entries')
  ctx.effect(() => locale.subscribe(syncPanels), 'nanomuse: panel labels')
  const sidebarInjected = () => ({
    startSession: () => { workspaces.startSession() },
    toggleSidebar: () => { layout.toggleSidebar() },
    selectPanel: (id: string | null) => { layout.selectPanel(id) },
    openSettings,
    issuesUrl: ISSUES_URL,
    hooks: { panels, shortcuts: shortcuts.catalog },
  })
  slots.inject('sidebar', () => slots.register({
    name: 'sidebar',
    locale: 'nanomuse',
    children: {
      'sidebar.brand.mark': { kind: 'single', scope: 'root' },
      'sidebar.brand.name': { kind: 'single', scope: 'root' },
      'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      'sidebar.workspaces': { kind: 'single', scope: 'root' },
      'sidebar.settings': { kind: 'single', scope: 'root' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
    inject: sidebarInjected,
  }, (props: MuseSidebarProps) => h(MuseSidebar, props)))
  // macOS desktop hides the collapsed column entirely; the frame then mounts
  // this seat beside the traffic lights for reopening it and a new chat.
  slots.inject('shell.leading', () => slots.register({ name: 'shell.leading', locale: 'nanomuse', inject: sidebarInjected }, ({ toggleSidebar, startSession }: { toggleSidebar(): void; startSession(): void }) =>
    h('div', { style: { display: 'flex', gap: 2, padding: '0 4px' } },
      h('button', { type: 'button', className: 'nm-icon-btn', 'aria-label': t('menuExpand'), title: t('menuExpand'), onClick: toggleSidebar }, h(IconPanelLeft, { size: 18 })),
      h('button', { type: 'button', className: 'nm-icon-btn', 'aria-label': t('railNew'), title: t('railNew'), onClick: startSession }, h(IconPlus, { size: 18 })))))
  syncPanels()

  // The Devices page behind the rail's Devices icon.
  const DevicesPanel = makeDevicesPanel(t)
  slots.inject('main', () => slots.register({ name: 'main', key: DEVICES_PANEL, locale: 'nanomuse' }, DevicesPanel))

  // The agent pinned over the conversation; Stop cancels the running turn(s).
  const stop = async (sessionId: string): Promise<void> => {
    const sessions = (ctx as unknown as { get(name: string): unknown }).get('sessions') as SessionsService | undefined
    if (!sessions || !sessionId) return
    await sessions.using(sessionId, { source: 'controllerOperation' }, async (reference) => {
      await reference.ready
      await reference.binding.session.cancel()
    })
  }
  slots.inject('conversation.header.leading', () =>
    slots.register({ name: 'conversation.header.leading', locale: 'nanomuse' }, ({ useSessionStatus }: { useSessionStatus?: UseSessionStatus }) =>
      h(MuseHeader, { t, stop, openProfile: () => { if (!openSettings()) pressSettingsChord() }, useSessionStatus })))

  // The first run: meet the agent, sign in or use your own key — in the shipped
  // step's seat, below its priority so ours renders whichever registers first.
  const Onboarding = makeOnboarding(t)
  slots.inject('settings.onboarding', () =>
    slots.register({ name: 'settings.onboarding', id: 'deepseek-official', order: 0, priority: -1 }, (props: OnboardingOwnerProps) => h(Onboarding, props)))

  // Settings → nanoMuse, after Models (10) and Agents (20).
  const CloudSection = makeCloudSection(t)
  slots.inject('settings.section', () =>
    slots.register({ name: 'settings.section', id: 'nanomuse-cloud', order: 30, label: () => t('nav') }, CloudSection))

  // Toasts for what other devices did here, over the whole frame.
  const Capsule = makeCapsule({ t })
  slots.inject('shell.overlay', () =>
    slots.register({ name: 'shell.overlay', id: 'nanomuse.capsule' }, Capsule))
}
