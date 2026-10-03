/**
 * The Settings pages Muse has that are not about one service: Connectors (what the
 * agent can reach — the hands, Reach, the rooms, and MCP servers in the preset),
 * Permissions (one place that says what the agent may do and where each switch
 * is), Files (where it works, what it may touch) and Dictation (voice input: the
 * harness's own bundle, or the system's).
 */
import { createElement as h, Fragment, useEffect, useState, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { bridge, gatedPermissions, openLink, type PermissionKind, type PermissionState } from './bridge.ts'
import { settingsBus } from './bus.ts'
import { IconCalendar, IconCheck, IconChevronRight, IconDevices, IconFeed, IconFolder, IconHand, IconLink, IconMic, IconPuzzle, IconShield } from './icons.tsx'
import { useLive } from './live.ts'
import { DEVICES_PANEL } from './panels.ts'
import { usePrefs } from './prefs.ts'
import { roomsCall, useRooms } from './rooms.ts'
import { ago } from './ui.tsx'

export const CONNECTORS_SECTION = 'nanomuse-connectors'
export const PERMISSIONS_SECTION = 'nanomuse-permissions'
export const FILES_SECTION = 'nanomuse-files'
export const DICTATION_SECTION = 'nanomuse-dictation'
/** The Computer-use page's id (MuseSettings owns it; repeated here to avoid a cycle). */
const COMPUTER_SECTION = 'nanomuse-computer'
const HARNESS_MCP_DOCS = 'https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/subsystems/mcp.md'
const PLUGINS_PANEL = 'plugins'

interface Connectors {
  servers: { name: string; tools: { name: string; description: string }[] }[]
  builtin: number
  /** When the catalogue was last read through a chat; 0 before any chat ran. */
  at: number
}

function useConnectors(): Connectors | undefined {
  const [value, setValue] = useState<Connectors | undefined>()
  useEffect(() => {
    let alive = true
    const load = () => roomsCall<Connectors>('connectors').then((v) => { if (alive) setValue(v) }).catch(() => undefined)
    void load()
    const timer = window.setInterval(() => void load(), 15_000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])
  return value
}

function Row({ icon, title, sub, right, onClick }: { icon?: ReactNode; title: string; sub?: ReactNode; right?: ReactNode; onClick?: () => void }): ReactNode {
  const body = [
    icon ? h('span', { key: 'i', className: 'nm-row-icon' }, icon) : null,
    h('div', { key: 'm', className: 'nm-row-main' },
      h('span', { className: 'nm-row-title' }, title),
      sub ? h('span', { className: 'nm-row-sub nm-wrap' }, sub) : null),
    right ?? (onClick ? h('span', { key: 'r', className: 'nm-row-chevron' }, h(IconChevronRight, { size: 16 })) : null),
  ]
  return onClick
    ? h('button', { type: 'button', className: 'nm-row nm-row-button', onClick }, ...body)
    : h('div', { className: 'nm-row' }, ...body)
}

function State({ on, t }: { on: boolean; t: Translate }): ReactNode {
  return h('span', { className: on ? 'nm-state nm-state-on' : 'nm-state' }, on ? h(IconCheck, { size: 14 }) : null, ' ', on ? t('cnOn') : t('cnOff'))
}

// ---- Connectors ---------------------------------------------------------------------

export function makeConnectorsSection(t: Translate) {
  return function ConnectorsSection(): ReactNode {
    const connectors = useConnectors()
    const live = useLive()
    const rooms = useRooms()
    const [open, setOpen] = useState<string | null>(null)
    const seen = (connectors?.at ?? 0) > 0
    const hands = connectors?.servers.some((s) => s.name === 'nanomuse') ?? false
    const others = (connectors?.servers ?? []).filter((s) => s.name !== 'nanomuse')
    const devices = live.hub.devices.filter((d) => d.kind !== 'web').length
    return h('div', { className: 'nm-section' },
      h('p', null, t('cnLead')),
      h('h2', null, t('cnBuiltIn')),
      h('div', { className: 'nm-card' },
        h(Row, { icon: h(IconHand, { size: 18 }), title: t('cnHands'), sub: hands ? t('cnHandsOn') : seen ? t('cnHandsOff') : t('cnNotYet'), right: seen ? h(State, { on: hands, t }) : null, onClick: () => { settingsBus.openSection?.(COMPUTER_SECTION) } }),
        h(Row, { icon: h(IconDevices, { size: 18 }), title: t('cnReach'), sub: devices ? t('cnReachOn', { n: devices }) : t('cnReachOff'), right: h(State, { on: devices > 0, t }), onClick: () => { settingsBus.openSection?.(DEVICES_PANEL) } }),
        h(Row, { icon: h(IconFeed, { size: 18 }), title: t('cnRooms'), sub: t('cnRoomsSub', { goals: rooms.goals.length, items: rooms.library.length }), right: h(State, { on: true, t }) }),
        h(Row, { icon: h(IconCalendar, { size: 18 }), title: t('cnSchedule'), sub: t('cnScheduleSub'), right: h(State, { on: true, t }) })),
      h('h2', null, t('cnMcp')),
      others.length
        ? h('div', { className: 'nm-card' }, others.map((server) => h(Fragment, { key: server.name },
            h(Row, { icon: h(IconLink, { size: 18 }), title: server.name, sub: t('cnTools', { n: server.tools.length }), right: h(State, { on: true, t }), onClick: () => setOpen(open === server.name ? null : server.name) }),
            open === server.name
              ? h('div', { className: 'nm-row nm-row-sublist' }, h('ul', { className: 'nm-tool-list' }, server.tools.map((tool) => h('li', { key: tool.name }, h('code', null, tool.name), tool.description ? ` — ${tool.description}` : ''))))
              : null)))
        : h('p', null, !connectors ? t('cnLoading') : seen ? t('cnNone') : t('cnNotYet')),
      h('div', { className: 'nm-card' },
        h(Row, { icon: h(IconPuzzle, { size: 18 }), title: t('cnAdd'), sub: t('cnAddSub'), onClick: () => { settingsBus.openSection?.('agent-presets') } }),
        h(Row, { icon: h(IconLink, { size: 18 }), title: t('cnDocs'), onClick: () => openLink(HARNESS_MCP_DOCS) })),
      seen && connectors ? h('p', { className: 'nm-fine' }, t('cnBuiltinCount', { n: connectors.builtin })) : null)
  }
}

// ---- Permissions --------------------------------------------------------------------

export function makePermissionsSection(t: Translate) {
  return function PermissionsSection(): ReactNode {
    const prefs = usePrefs()
    const connectors = useConnectors()
    const live = useLive()
    const [states, setStates] = useState<Partial<Record<PermissionKind, PermissionState>>>({})
    const gated = gatedPermissions()
    useEffect(() => {
      if (!gated) return
      void bridge()?.permissions().then(setStates).catch(() => undefined)
    }, [gated])
    const word = (kind: PermissionKind) => {
      if (!gated) return t('pmNotGated')
      const state = states[kind]
      return state === 'granted' ? t('pmGranted') : state === 'not-determined' ? t('pmNotAsked') : state ? t('pmDenied') : '…'
    }
    const devices = live.hub.devices.filter((d) => d.kind !== 'web').length
    const approvals = prefs.approvals.slice(0, 8)
    return h('div', { className: 'nm-section' },
      h('p', null, t('pmLead')),
      h('h2', null, t('pmWhat')),
      h('div', { className: 'nm-card' },
        h(Row, { icon: h(IconHand, { size: 18 }), title: t('pmComputer'), sub: `${t('obAccessibility')}: ${word('accessibility')} · ${t('obScreen')}: ${word('screen')}`, onClick: () => { settingsBus.openSection?.(COMPUTER_SECTION) } }),
        h(Row, { icon: h(IconFolder, { size: 18 }), title: t('pmFiles'), sub: t('pmFilesSub'), onClick: () => { settingsBus.openSection?.(FILES_SECTION) } }),
        h(Row, { icon: h(IconMic, { size: 18 }), title: t('pmMic'), sub: word('microphone'), onClick: () => { settingsBus.openSection?.(DICTATION_SECTION) } }),
        h(Row, { icon: h(IconLink, { size: 18 }), title: t('pmConnectors'), sub: connectors ? t('pmConnectorsSub', { n: connectors.servers.length }) : '…', onClick: () => { settingsBus.openSection?.(CONNECTORS_SECTION) } }),
        h(Row, { icon: h(IconDevices, { size: 18 }), title: t('pmDevices'), sub: `${t('remoteControl')}: ${live.hub.remoteControl ? t('cnOn') : t('cnOff')} · ${devices ? t('pmDevicesSub', { n: devices }) : t('pmDevicesNone')}`, onClick: () => { settingsBus.openSection?.(DEVICES_PANEL) } })),
      h('h2', null, t('pmHow')),
      h('div', { className: 'nm-card' },
        h(Row, { icon: h(IconShield, { size: 18 }), title: t('pmPreset'), sub: t('pmPresetSub'), onClick: () => { settingsBus.openSection?.('agent-presets') } })),
      h('h2', null, t('pmRecent')),
      approvals.length
        ? h('div', { className: 'nm-card' }, approvals.map((a, i) => h(Row, { key: `${a.at}-${i}`, icon: h(IconShield, { size: 18 }), title: a.reason || a.toolName, sub: `${a.outcome === 'allowed' ? t('pfAllowed') : t('pfDenied')} · ${ago(t, a.at)}` })))
        : h('p', null, t('pmRecentNone')))
  }
}

// ---- Files --------------------------------------------------------------------------

interface Folders {
  home: string
  library: string
  downloads: string
  state: string
}

export function makeFilesSection(t: Translate) {
  return function FilesSection(): ReactNode {
    const [folders, setFolders] = useState<Folders | undefined>()
    useEffect(() => {
      void roomsCall<Folders>('files').then(setFolders).catch(() => undefined)
    }, [])
    const b = bridge()
    const reveal = (which: keyof Folders) => { void roomsCall('files/reveal', { which }).catch(() => undefined) }
    const folder = (which: keyof Folders, title: string, sub: string) =>
      h(Row, { icon: h(IconFolder, { size: 18 }), title, sub: h(Fragment, null, sub, folders ? h('span', { className: 'nm-path' }, folders[which]) : null), onClick: () => reveal(which) })
    return h('div', { className: 'nm-section' },
      h('p', null, t('fsLead')),
      h('h2', null, t('fsFolders')),
      h('div', { className: 'nm-card' },
        folder('home', t('fsHome'), t('fsHomeSub')),
        folder('library', t('fsLibrary'), t('fsLibrarySub')),
        folder('downloads', t('fsDownloads'), t('fsDownloadsSub')),
        folder('state', t('fsState'), t('fsStateSub'))),
      h('h2', null, t('fsRules')),
      h('div', { className: 'nm-card' },
        h(Row, { icon: h(IconShield, { size: 18 }), title: t('fsRead'), sub: t('fsReadSub') }),
        h(Row, { icon: h(IconShield, { size: 18 }), title: t('fsWrite'), sub: t('fsWriteSub') }),
        h(Row, { icon: h(IconShield, { size: 18 }), title: t('fsSandbox'), sub: t('fsSandboxSub'), onClick: () => { settingsBus.openSection?.('agent-presets') } })),
      b?.platform === 'darwin'
        ? h(Fragment, null,
            h('h2', null, t('fsMacTitle')),
            h('div', { className: 'nm-card' },
              h(Row, { icon: h(IconFolder, { size: 18 }), title: t('fsFullDisk'), sub: t('fsFullDiskSub'), onClick: () => { void b.openPermissionSettings('files') } })))
        : null)
  }
}

// ---- Dictation ----------------------------------------------------------------------

export function makeDictationSection(t: Translate, selectPanel: (id: string) => void) {
  return function DictationSection(): ReactNode {
    const b = bridge()
    const [mic, setMic] = useState<PermissionState | undefined>()
    const gated = gatedPermissions()
    const refresh = () => { void b?.permissions().then((p) => setMic(p.microphone)).catch(() => undefined) }
    useEffect(() => { if (gated) refresh() }, [gated]) // eslint-disable-line react-hooks/exhaustive-deps
    const os = b?.platform === 'darwin' ? t('dcOsMac') : b?.platform === 'win32' ? t('dcOsWin') : t('dcOsOther')
    return h('div', { className: 'nm-section' },
      h('p', null, t('dcLead')),
      h('h2', null, t('dcBuiltIn')),
      h('div', { className: 'nm-card' },
        h(Row, { icon: h(IconMic, { size: 18 }), title: t('dcVoiceInput'), sub: t('dcVoiceInputSub'), onClick: () => selectPanel(PLUGINS_PANEL) }),
        gated
          ? h(Row, { icon: h(IconShield, { size: 18 }), title: t('dcMic'), sub: mic === 'granted' ? t('pmGranted') : mic === 'denied' ? t('pmDenied') : t('pmNotAsked'),
              right: mic === 'granted'
                ? h('span', { className: 'nm-ob-granted', 'aria-label': t('obAllowed') }, h(IconCheck, { size: 16 }))
                : h('button', { type: 'button', className: 'nm-pill nm-pill-sm', onClick: () => { void b?.requestPermission('microphone').then(() => refresh()) } }, t('obAllow')) })
          : null),
      h('h2', null, t('dcSystem')),
      h('div', { className: 'nm-card' },
        h(Row, { icon: h(IconMic, { size: 18 }), title: t('dcOs'), sub: os })),
      h('p', { className: 'nm-fine' }, t('dcPrivacy')))
  }
}
