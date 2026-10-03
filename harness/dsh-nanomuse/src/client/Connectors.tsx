/**
 * Settings → Connectors, the way Muse lays it out: a search field, the connected
 * ones, the available ones with a "Connect" at the end of each row, and a detail
 * view per connector (what it can do, what gates it). The inventory is what this
 * agent can actually reach: the harness's own tools, the runtime's hands and the
 * connectors its config.toml turns on (mailbox, calendar, address book — they
 * arrive through `nanomuse mcp`), the account's other devices, the rooms, and any
 * MCP server in the preset. There is no OAuth catalogue of third-party services:
 * connecting a mailbox or a calendar means putting the credentials in the
 * runtime's vault, and the connect sheet says exactly how.
 */
import { createElement as h, Fragment, useEffect, useState, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { openLink } from './bridge.ts'
import { settingsBus } from './bus.ts'
import {
  IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconCode, IconCopy, IconDevices, IconFeed, IconFolder, IconGlobe, IconHand, IconLink, IconMail, IconPuzzle, IconSearch, IconShield, IconUsers,
} from './icons.tsx'
import { useLive } from './live.ts'
import { DEVICES_PANEL } from './panels.ts'
import { roomsCall, useRooms } from './rooms.ts'
import { Sheet } from './ui.tsx'

export const CONNECTORS_SECTION = 'nanomuse-connectors'
const COMPUTER_SECTION = 'nanomuse-computer'
const PERMISSIONS_SECTION = 'nanomuse-permissions'
const FILES_SECTION = 'nanomuse-files'
const HARNESS_MCP_DOCS = 'https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/subsystems/mcp.md'
const RUNTIME_DOCS = 'https://github.com/nano-muse/nanoMuse/blob/main/docs/configuration.md#connectors'

interface Catalogue {
  servers: { name: string; tools: { name: string; description: string }[] }[]
  builtin: number
  /** When the catalogue was last read through a chat; 0 before any chat ran. */
  at: number
}

export function useConnectors(): Catalogue | undefined {
  const [value, setValue] = useState<Catalogue | undefined>()
  useEffect(() => {
    let alive = true
    const load = () => roomsCall<Catalogue>('connectors').then((v) => { if (alive) setValue(v) }).catch(() => undefined)
    void load()
    const timer = window.setInterval(() => void load(), 15_000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])
  return value
}

type Icon = (p: { size?: number }) => ReactNode

/** One connector as the page knows it. `tools` are the runtime/MCP tools it brings. */
interface Entry {
  id: string
  icon: Icon
  title: string
  sub: string
  about: string
  on: boolean
  /** The tools behind it, when known. */
  tools: { name: string; description: string }[]
  /** Where "Connect" leads when it is off: a settings page, or the vault steps. */
  connect?: { section: string } | { steps: Step[] }
  /** Where the detail's "settings" row leads, when there is a page of its own. */
  page?: string
}

interface Step { text: string; command?: string }

const RUNTIME_TOOL = /^mcp__nanomuse__(.+)$/

export function makeConnectorsSection(t: Translate) {
  return function ConnectorsSection(): ReactNode {
    const catalogue = useConnectors()
    const live = useLive()
    const rooms = useRooms()
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState<string | null>(null)
    const [connecting, setConnecting] = useState<Entry | null>(null)
    const seen = (catalogue?.at ?? 0) > 0
    const runtime = catalogue?.servers.find((s) => s.name === 'nanomuse')
    const runtimeTools = new Map((runtime?.tools ?? []).map((tool) => [tool.name, tool]))
    const has = (...names: string[]) => names.some((n) => runtimeTools.has(n))
    const pick = (...names: string[]) => names.flatMap((n) => { const tool = runtimeTools.get(n); return tool ? [tool] : [] })
    const devices = live.hub.devices.filter((d) => d.kind !== 'web').length
    const others = (catalogue?.servers ?? []).filter((s) => s.name !== 'nanomuse')

    const entries: Entry[] = [
      { id: 'hands', icon: IconHand, title: t('cnHands'), sub: has('computer_act') ? t('cnHandsOn') : seen ? t('cnHandsOff') : t('cnNotYet'), about: t('cnHandsAbout'), on: has('computer_act'), tools: pick('computer_screen', 'computer_act'), connect: { section: COMPUTER_SECTION }, page: COMPUTER_SECTION },
      { id: 'email', icon: IconMail, title: t('cnEmail'), sub: has('read_emails') ? t('cnEmailOn') : t('cnEmailOff'), about: t('cnEmailAbout'), on: has('read_emails', 'send_email'), tools: pick('read_emails', 'send_email'), connect: { steps: [
        { text: t('cnStepAddress'), command: 'nanomuse vault set EMAIL_ADDRESS' },
        { text: t('cnStepPassword'), command: 'nanomuse vault set EMAIL_PASSWORD' },
        { text: t('cnStepConfig', { file: '~/.nanomuse/config.toml' }), command: '[connectors.email]\nenabled = true\nimap_host = "imap.gmail.com"\nsmtp_host = "smtp.gmail.com"' },
        { text: t('cnStepRestart') },
      ] } },
      { id: 'calendar', icon: IconCalendar, title: t('cnCalendar'), sub: has('calendar') ? t('cnCalendarOn') : t('cnCalendarOff'), about: t('cnCalendarAbout'), on: has('calendar'), tools: pick('calendar'), connect: { steps: [
        { text: t('cnStepFeed'), command: 'nanomuse vault set CALENDAR_WORK' },
        { text: t('cnStepConfig', { file: '~/.nanomuse/config.toml' }), command: '[connectors.calendar]\nenabled = true\n[[connectors.calendar.feeds]]\nname = "Work"\nurl = "{{vault:CALENDAR_WORK}}"' },
        { text: t('cnStepRestart') },
      ] } },
      { id: 'contacts', icon: IconUsers, title: t('cnContacts'), sub: has('contacts') ? t('cnContactsOn') : t('cnContactsOff'), about: t('cnContactsAbout'), on: has('contacts'), tools: pick('contacts'), connect: { steps: [
        { text: t('cnStepVcf'), command: '[connectors.contacts]\nenabled = true\n[[connectors.contacts.sources]]\nname = "Google"\nurl = "~/Downloads/contacts.vcf"' },
        { text: t('cnStepRestart') },
      ] } },
      { id: 'reach', icon: IconDevices, title: t('cnReach'), sub: devices ? t('cnReachOn', { n: devices }) : t('cnReachOff'), about: t('cnReachAbout'), on: devices > 0, tools: [], connect: { section: DEVICES_PANEL }, page: DEVICES_PANEL },
      { id: 'web', icon: IconGlobe, title: t('cnWeb'), sub: t('cnWebSub'), about: t('cnWebAbout'), on: true, tools: [] },
      { id: 'files', icon: IconFolder, title: t('cnFiles'), sub: t('cnFilesSub'), about: t('cnFilesAbout'), on: true, tools: [], page: FILES_SECTION },
      { id: 'shell', icon: IconCode, title: t('cnShell'), sub: t('cnShellSub'), about: t('cnShellAbout'), on: true, tools: [] },
      { id: 'rooms', icon: IconFeed, title: t('cnRooms'), sub: t('cnRoomsSub', { goals: rooms.goals.length, items: rooms.library.length }), about: t('cnRoomsAbout'), on: true, tools: [] },
      { id: 'schedule', icon: IconCalendar, title: t('cnSchedule'), sub: t('cnScheduleSub'), about: t('cnScheduleAbout'), on: true, tools: [] },
      ...others.map((server): Entry => ({ id: `mcp:${server.name}`, icon: IconLink, title: server.name, sub: t('cnTools', { n: server.tools.length }), about: t('cnMcpAbout'), on: true, tools: server.tools })),
    ]
    const q = query.trim().toLowerCase()
    const shown = q ? entries.filter((e) => `${e.title} ${e.sub}`.toLowerCase().includes(q)) : entries
    const connected = shown.filter((e) => e.on)
    const available = shown.filter((e) => !e.on)
    const current = open ? entries.find((e) => e.id === open) : undefined

    if (current) {
      return h(Detail, { t, entry: current, onBack: () => setOpen(null), onConnect: () => beginConnect(current) })
    }

    function beginConnect(entry: Entry) {
      if (!entry.connect) return
      if ('section' in entry.connect) { settingsBus.openSection?.(entry.connect.section); return }
      setConnecting(entry)
    }

    return h('div', { className: 'nm-section nm-connectors' },
      h('p', null, t('cnLead')),
      h('label', { className: 'nm-lib-search nm-cn-search' },
        h(IconSearch, { size: 16 }),
        h('input', { type: 'search', value: query, placeholder: t('cnSearch'), 'aria-label': t('cnSearch'), onChange: (e: { currentTarget: HTMLInputElement }) => setQuery(e.currentTarget.value) })),
      connected.length ? h(Fragment, null,
        h('h2', null, t('cnConnected')),
        h('div', { className: 'nm-card' }, connected.map((entry) => h(ConnectorRow, { key: entry.id, t, entry, onOpen: () => setOpen(entry.id) })))) : null,
      available.length || !q ? h(Fragment, null,
        h('h2', null, t('cnAvailable')),
        h('div', { className: 'nm-card' },
          available.map((entry) => h(ConnectorRow, { key: entry.id, t, entry, onOpen: () => setOpen(entry.id), onConnect: () => beginConnect(entry) })),
          !q ? h('button', { type: 'button', className: 'nm-row nm-row-button', onClick: () => { settingsBus.openSection?.('agent-presets') } },
            h('span', { className: 'nm-row-icon' }, h(IconPuzzle, { size: 18 })),
            h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, t('cnAdd')), h('span', { className: 'nm-row-sub nm-wrap' }, t('cnAddSub'))),
            h('span', { className: 'nm-row-chevron' }, h(IconChevronRight, { size: 16 }))) : null)) : null,
      q && !shown.length ? h('p', { className: 'nm-fine' }, t('cnNoMatch')) : null,
      h('p', { className: 'nm-fine' },
        seen && catalogue ? `${t('cnBuiltinCount', { n: catalogue.builtin })} ` : '',
        h('a', { href: HARNESS_MCP_DOCS, onClick: (e: Event) => { e.preventDefault(); openLink(HARNESS_MCP_DOCS) } }, t('cnDocs'))),
      connecting ? h(ConnectSheet, { t, entry: connecting, onClose: () => setConnecting(null) }) : null)
  }
}

function ConnectorRow({ t, entry, onOpen, onConnect }: { t: Translate; entry: Entry; onOpen(): void; onConnect?: () => void }): ReactNode {
  return h('div', { className: 'nm-row nm-cn-row' },
    h('button', { type: 'button', className: 'nm-cn-main', onClick: onOpen },
      h('span', { className: 'nm-row-icon' }, h(entry.icon, { size: 18 })),
      h('div', { className: 'nm-row-main' },
        h('span', { className: 'nm-row-title' }, entry.title),
        h('span', { className: 'nm-row-sub nm-wrap' }, entry.sub))),
    entry.on
      ? h('span', { className: 'nm-row-chevron', 'aria-hidden': true }, h(IconChevronRight, { size: 16 }))
      : entry.connect
        ? h('button', { type: 'button', className: 'nm-cn-connect', onClick: onConnect }, t('cnConnect'))
        : null)
}

function Detail({ t, entry, onBack, onConnect }: { t: Translate; entry: Entry; onBack(): void; onConnect(): void }): ReactNode {
  return h('div', { className: 'nm-section nm-cn-detail' },
    h('button', { type: 'button', className: 'nm-cn-back', onClick: onBack }, h(IconChevronLeft, { size: 16 }), t('navConnectors')),
    h('div', { className: 'nm-cn-hero' },
      h('span', { className: 'nm-cn-hero-icon' }, h(entry.icon, { size: 26 })),
      h('div', { className: 'nm-cn-hero-main' },
        h('h3', null, entry.title),
        h('p', null, entry.about)),
      entry.on
        ? h('span', { className: 'nm-state nm-state-on nm-cn-state' }, h(IconCheck, { size: 14 }), ' ', t('cnConnectedOne'))
        : entry.connect ? h('button', { type: 'button', className: 'nm-cn-connect nm-cn-connect-big', onClick: onConnect }, t('cnConnect')) : null),
    entry.tools.length ? h(Fragment, null,
      h('h2', null, t('cnCanDo')),
      h('div', { className: 'nm-card' }, entry.tools.map((tool) => h('div', { key: tool.name, className: 'nm-row' },
        h('div', { className: 'nm-row-main' },
          h('span', { className: 'nm-row-title' }, h('code', null, tool.name)),
          tool.description ? h('span', { className: 'nm-row-sub nm-wrap' }, tool.description) : null))))) : null,
    h('h2', null, t('cnGates')),
    h('div', { className: 'nm-card' },
      h('button', { type: 'button', className: 'nm-row nm-row-button', onClick: () => { settingsBus.openSection?.(PERMISSIONS_SECTION) } },
        h('span', { className: 'nm-row-icon' }, h(IconShield, { size: 18 })),
        h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, t('cnGatePolicy')), h('span', { className: 'nm-row-sub nm-wrap' }, t('cnGatePolicySub'))),
        h('span', { className: 'nm-row-chevron' }, h(IconChevronRight, { size: 16 }))),
      entry.id === 'hands' || entry.id === 'email' ? h('div', { className: 'nm-row' },
        h('span', { className: 'nm-row-icon' }, h(IconHand, { size: 18 })),
        h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, t('cnGateSentinel')), h('span', { className: 'nm-row-sub nm-wrap' }, entry.id === 'email' ? t('cnGateSentinelMail') : t('cnGateSentinelHands')))) : null,
      entry.page ? h('button', { type: 'button', className: 'nm-row nm-row-button', onClick: () => { settingsBus.openSection?.(entry.page!) } },
        h('span', { className: 'nm-row-icon' }, h(IconLink, { size: 18 })),
        h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, t('cnOwnPage'))),
        h('span', { className: 'nm-row-chevron' }, h(IconChevronRight, { size: 16 }))) : null),
    h('p', { className: 'nm-fine' }, t('cnDetailFine')))
}

function ConnectSheet({ t, entry, onClose }: { t: Translate; entry: Entry; onClose(): void }): ReactNode {
  const steps = entry.connect && 'steps' in entry.connect ? entry.connect.steps : []
  const [copied, setCopied] = useState<number | null>(null)
  const copy = (i: number, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => { setCopied(i); window.setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500) }).catch(() => undefined)
  }
  return h(Sheet, { title: t('cnConnectTitle', { name: entry.title }), onClose, closeLabel: t('close'), footer: h(Fragment, null,
    h('button', { type: 'button', className: 'nm-pill nm-pill-ghost', onClick: () => { void roomsCall('files/reveal', { which: 'runtime' }).catch(() => undefined) } }, t('cnOpenConfig')),
    h('button', { type: 'button', className: 'nm-pill', onClick: onClose }, t('cnDone'))) },
    h('div', { className: 'nm-cn-consent' },
      h('span', { className: 'nm-cn-hero-icon' }, h(entry.icon, { size: 26 })),
      h('p', { className: 'nm-cn-consent-lead' }, entry.about)),
    h('div', { className: 'nm-card' },
      h('div', { className: 'nm-row' }, h('span', { className: 'nm-row-icon' }, h(IconCheck, { size: 18 })), h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, t('cnConsentGets')), h('span', { className: 'nm-row-sub nm-wrap' }, t('cnConsentGetsSub')))),
      h('div', { className: 'nm-row' }, h('span', { className: 'nm-row-icon' }, h(IconShield, { size: 18 })), h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, t('cnConsentYou')), h('span', { className: 'nm-row-sub nm-wrap' }, t('cnConsentYouSub')))),
      h('div', { className: 'nm-row' }, h('span', { className: 'nm-row-icon' }, h(IconFolder, { size: 18 })), h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, t('cnConsentWhere')), h('span', { className: 'nm-row-sub nm-wrap' }, t('cnConsentWhereSub'))))),
    h('h2', null, t('cnHowTo')),
    h('ol', { className: 'nm-cn-steps' }, steps.map((step, i) => h('li', { key: i },
      h('span', null, step.text),
      step.command ? h('div', { className: 'nm-cn-command' },
        h('pre', null, step.command),
        h('button', { type: 'button', className: 'nm-cn-copy', 'aria-label': t('edCopy'), title: t('edCopy'), onClick: () => copy(i, step.command!) }, copied === i ? h(IconCheck, { size: 14 }) : h(IconCopy, { size: 14 }))) : null))),
    h('p', { className: 'nm-fine' }, t('cnHowToFine'), ' ', h('a', { href: RUNTIME_DOCS, onClick: (e: Event) => { e.preventDefault(); openLink(RUNTIME_DOCS) } }, t('cnRuntimeDocs'))))
}
