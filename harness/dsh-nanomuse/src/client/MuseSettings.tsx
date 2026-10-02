/**
 * The settings dialog, shaped like the Muse desktop's: a grouped nav on the
 * left — the everyday pages first (General, Account, Models, Agents,
 * Devices), then an *Advanced* group with every page the harness's other
 * plugins add — and the page on the right. It occupies `sidebar.settings`
 * (declared by our sidebar) and declares the `settings.*` seats the stock
 * shell declared, so every plugin's section, header action and onboarding
 * step lands as before; the General page is ours too and declares
 * `settings.general.item`, so the harness's own rows (permissions, language,
 * appearance, shortcuts…) mount in it. The onboarding coordinator mounts one
 * step while the main session is blank, as the stock shell did.
 */
import { useModalLayer } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { call, type Translate } from './api.ts'
import { settingsBus } from './bus.ts'
import { IconArchive, IconClose, IconCpu, IconDatabase, IconDevices, IconLogOut, IconPuzzle, IconSettings, IconSliders, IconSparkle, IconUser } from './icons.tsx'
import { useLive } from './live.ts'
import type { RenderSlot } from './MuseSidebar.tsx'

/** The pages that make up the everyday group, in Muse's order; the rest are Advanced. */
const PRIMARY: readonly string[] = ['general', 'nanomuse-cloud', 'models', 'agent-presets', 'nanomuse-devices']

export interface SectionRow {
  id: string
  order: number
  label: string
}
export interface OnboardingStep {
  id: string
  order: number
}

/** Shell state: whether the dialog is open and which page shows. */
export interface ShellState {
  open: boolean
  activeId: string | undefined
}
export function createShellStore() {
  let state: ShellState = { open: false, activeId: undefined }
  const listeners = new Set<() => void>()
  const set = (next: ShellState) => { state = next; for (const l of listeners) l() }
  return {
    getSnapshot: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
    open: () => set({ ...state, open: true }),
    close: () => set({ open: false, activeId: undefined }),
    select: (id: string) => set({ ...state, activeId: id }),
    openSection: (id: string) => set({ open: true, activeId: id }),
    toggle: () => (state.open ? set({ open: false, activeId: undefined }) : set({ ...state, open: true })),
  }
}
export type ShellStore = ReturnType<typeof createShellStore>

export interface MuseSettingsProps {
  t: Translate
  store: ShellStore
  renderSlot: RenderSlot
  useSections<S>(selector: (rows: readonly SectionRow[]) => S): S
  useOnboardingSteps<S>(selector: (rows: readonly OnboardingStep[]) => S): S
  /** The sessions store share, when the host passes it; without it onboarding runs once at boot. */
  useSessions?: (<S>(selector: (state: { phase: string; byId: Record<string, { blank: boolean; retainedBy: { mainView?: number } }> }) => S) => S) | undefined
}

function navIcon(id: string): ReactNode {
  switch (id) {
    case 'general': return h(IconSliders, { size: 16 })
    case 'nanomuse-cloud': return h(IconUser, { size: 16 })
    case 'models': return h(IconDatabase, { size: 16 })
    case 'agent-presets': return h(IconSparkle, { size: 16 })
    case 'nanomuse-devices': return h(IconDevices, { size: 16 })
    case 'plugins': return h(IconPuzzle, { size: 16 })
    case 'archived-sessions': return h(IconArchive, { size: 16 })
    case 'account': return h(IconCpu, { size: 16 })
    default: return h(IconSettings, { size: 16 })
  }
}

interface PanelProps {
  t: Translate
  rows: readonly SectionRow[]
  renderSlot: RenderSlot
  activeId: string | undefined
  onSelect(id: string): void
  onClose(): void
}

function SettingsPanel({ t, rows, renderSlot, activeId, onSelect, onClose }: PanelProps): ReactNode {
  const live = useLive()
  const [signingOut, setSigningOut] = useState(false)
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  useModalLayer(panel, true, onClose)

  const active = rows.find((r) => r.id === activeId)?.id ?? rows[0]?.id
  const primary = PRIMARY.map((id) => rows.find((r) => r.id === id)).filter((r): r is SectionRow => r !== undefined)
  const advanced = rows.filter((r) => !PRIMARY.includes(r.id))

  const cell = (row: SectionRow) => h('button', {
    key: row.id,
    type: 'button',
    className: `nm-settings-cell${row.id === active ? ' nm-active' : ''}`,
    'aria-current': row.id === active ? 'true' : undefined,
    'data-modal-autofocus': row.id === active ? '' : undefined,
    onClick: () => onSelect(row.id),
  }, navIcon(row.id), h('span', { className: 'nm-settings-cell-label' }, row.id === 'nanomuse-cloud' ? t('navAccount') : row.label))

  const signOut = () => {
    setSigningOut(true)
    void call('sign-out', {}).catch(() => undefined).finally(() => setSigningOut(false))
  }

  return createPortal(
    h('div', { className: 'nm-settings-overlay', role: 'presentation' },
      h('div', { className: 'nm-settings-mask', 'aria-hidden': true, onClick: onClose }),
      h('div', { ref: panel, tabIndex: -1, className: 'nm-settings', role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId, 'data-shortcut-modal': 'settings' },
        h('nav', { className: 'nm-settings-nav' },
          h('div', { className: 'nm-settings-title', id: titleId, tabIndex: -1 }, renderSlot('settings.header', {}, { fallback: t('menuSettings') })),
          primary.map(cell),
          advanced.length > 0 ? h('div', { className: 'nm-settings-group' }, t('navAdvanced')) : null,
          advanced.map(cell),
          live.cloud.signedIn
            ? h('div', { className: 'nm-settings-foot' },
                h('button', { type: 'button', className: 'nm-settings-cell', disabled: signingOut, onClick: signOut },
                  h(IconLogOut, { size: 16 }), h('span', { className: 'nm-settings-cell-label' }, signingOut ? t('signingOut') : t('signOut'))))
            : null),
        h('div', { className: 'nm-settings-content' },
          h('div', { className: 'nm-settings-head' },
            renderSlot('settings.action', {}),
            h('button', { type: 'button', className: 'nm-close', onClick: onClose },
              h(IconClose, { size: 14 }),
              h('span', { className: 'nm-hidden' }, renderSlot('settings.close', {}, { fallback: t('close') })))),
          h('div', { className: 'nm-settings-body' },
            active !== undefined ? renderSlot('settings.section', { close: onClose }, { only: active }) : null)))),
    document.body)
}

export function MuseSettings(props: MuseSettingsProps): ReactNode {
  const { t, store, renderSlot, useSections, useOnboardingSteps, useSessions } = props
  const { open, activeId } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const rows = useSections((s) => s)
  const steps = useOnboardingSteps((s) => s)
  const [requested, setRequested] = useState<string | undefined>()
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set())

  // While mounted, the rail's menu and the header's face open the dialog through the bus.
  useEffect(() => {
    settingsBus.open = () => { store.open(); return true }
    settingsBus.openSection = (id) => { store.openSection(id); return true }
    return () => { settingsBus.open = undefined; settingsBus.openSection = undefined }
  }, [store])

  // Onboarding runs while the main session is blank (first boot, or a fresh
  // blank chat with nothing done yet) — exactly the stock coordinator's fact.
  const sessionsBlank = typeof useSessions === 'function'
    ? useSessions((state) => {
        const main = Object.values(state.byId).find((s) => (s.retainedBy.mainView ?? 0) > 0)
        return state.phase === 'ready' && (main === undefined || main.blank)
      })
    : true
  const step = requested !== undefined
    ? steps.find((s) => s.id === requested)
    : sessionsBlank ? steps.find((s) => !completed.has(s.id)) : undefined
  useEffect(() => { if (!sessionsBlank) setCompleted(new Set()) }, [sessionsBlank])
  const stepSeen = useRef(step)
  useEffect(() => {
    const appeared = stepSeen.current === undefined && step !== undefined
    stepSeen.current = step
    if (appeared && open) store.close()
  }, [step, open, store])
  const complete = useCallback((id: string) => {
    setRequested(undefined)
    setCompleted((previous) => (previous.has(id) ? previous : new Set([...previous, id])))
  }, [])

  return h('div', { className: 'nm-settings-seat' },
    // A real trigger for anything that looks for one (the rail's fallback, assistive tech).
    h('button', { type: 'button', className: 'nm-hidden', 'aria-haspopup': 'dialog', 'aria-expanded': open, onClick: () => store.open() },
      renderSlot('settings.trigger', { wide: false }, { fallback: t('menuSettings') })),
    renderSlot('settings.launcher', {
      wide: false,
      settingsOpen: open,
      openSettings: () => store.open(),
      openOnboarding: (id: string) => { store.close(); setRequested(id) },
    }, { fallback: null }),
    open ? h(SettingsPanel, { t, rows, renderSlot, activeId, onSelect: (id) => store.select(id), onClose: () => store.close() }) : null,
    step !== undefined
      ? renderSlot('settings.onboarding', {
          stepId: step.id,
          explicit: requested !== undefined,
          complete: () => complete(step.id),
          openSection: (id: string) => store.openSection(id),
        }, { only: step.id })
      : null)
}

/** The General page: the harness's rows, then where this build comes from. */
export function makeGeneralSection(t: Translate, version: string) {
  return function GeneralSection({ renderSlot }: { renderSlot: RenderSlot }): ReactNode {
    return h('div', { className: 'nm-general' },
      renderSlot('settings.general.item', {}),
      h('div', { className: 'nm-row', style: { fontSize: 13 } },
        h('div', { className: 'nm-row-main' },
          h('span', { className: 'nm-row-title' }, t('versionTitle')),
          h('span', { className: 'nm-row-sub' }, t('versionLine', { version })))))
  }
}
