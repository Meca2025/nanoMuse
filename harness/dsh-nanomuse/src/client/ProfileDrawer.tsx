/**
 * The agent's profile, the panel the Muse desktop slides in from the right
 * when its face is clicked: the big face with a pencil badge (change the look,
 * edit the name), the name, a line for how it is connected, and four tabs —
 * Activity (today's chats and what ran in them), Approvals (the answers given
 * on approval cards), Schedule (the harness's schedules) and Memory (what
 * follows the account: the name, the look, the personality). The name and the
 * simple looks are written to the account through the host, so the phone
 * wears them too.
 */
import { createElement as h, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { call, type Translate } from './api.ts'
import { Avatar } from './Avatar.tsx'
import { profileBus, useProfileOpen } from './bus.ts'
import { IconBrain, IconCheck, IconClock, IconClose, IconList, IconPencil, IconShield } from './icons.tsx'
import { useLive, type LiveProfile } from './live.ts'
import type { ChatListState, ChatStatus } from './MuseChats.tsx'
import { usePrefs } from './prefs.ts'

type Tab = 'activity' | 'approvals' | 'schedule' | 'memory'

export interface ProfileDrawerProps {
  t: Translate
  openSchedules(): void
  useSessions?: (<S>(selector: (state: ChatListState) => S) => S) | undefined
  useSessionStatus?: (<S>(selector: (snapshot: ReadonlyMap<string, ChatStatus>) => S) => S) | undefined
}

const EMOJI_CHOICES = ['✨', '🐉', '🌙', '🍀', '🦊', '🐼', '🌸', '⚡', '🎧', '🫧']
const COLOR_CHOICES = ['#0064d4', '#c8743a', '#7a4ea8', '#2f9e5f', '#c0392b', '#e0a13a', '#1d8a8a', '#5b6b7a']

function timeOf(at: number, t: Translate): string {
  const diff = Math.max(0, Date.now() - at)
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutesAgo', { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('hoursAgo', { n: hours })
  return t('daysAgo', { n: Math.round(hours / 24) })
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function makeProfileDrawer(t: Translate) {
  return function ProfileDrawer({ openSchedules, useSessions, useSessionStatus }: Omit<ProfileDrawerProps, 't'>): ReactNode {
    const open = useProfileOpen()
    if (!open) return null
    return h(Drawer, { t, openSchedules, useSessions, useSessionStatus })
  }
}

function Drawer({ t, openSchedules, useSessions, useSessionStatus }: ProfileDrawerProps): ReactNode {
  const live = useLive()
  const prefs = usePrefs()
  const [tab, setTab] = useState<Tab>('activity')
  const [editing, setEditing] = useState<'none' | 'name' | 'look'>('none')
  const [menu, setMenu] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  // Like Muse's panel it stays beside the chat until closed (×, Escape); the
  // chat column makes room for it meanwhile.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (panel.current?.contains(document.activeElement) || document.activeElement === document.body) profileBus.close()
    }
    document.addEventListener('keydown', onKey)
    document.documentElement.setAttribute('data-nm-profile', '')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.removeAttribute('data-nm-profile')
    }
  }, [])
  useEffect(() => { panel.current?.focus() }, [])

  const name = live.profile.name || t('brand')
  let status: ReactNode
  if (!live.cloud.signedIn) status = h('span', { className: 'nm-pf-status' }, h('span', { className: 'nm-status-dot' }), t('pfSignedOut'))
  else if (live.hub.connected) status = h('span', { className: 'nm-pf-status' }, h('span', { className: 'nm-status-dot nm-on' }), t('pfConnected'))
  else status = h('span', { className: 'nm-pf-status' }, h('span', { className: 'nm-status-dot nm-wait' }), t('pfOffline'))

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'activity', label: t('pfActivity'), icon: h(IconList, { size: 17 }) },
    { id: 'approvals', label: t('pfApprovals'), icon: h(IconShield, { size: 17 }) },
    { id: 'schedule', label: t('pfSchedule'), icon: h(IconClock, { size: 17 }) },
    { id: 'memory', label: t('pfMemory'), icon: h(IconBrain, { size: 17 }) },
  ]

  let body: ReactNode
  if (editing === 'name') body = h(NameEditor, { t, profile: live.profile, onDone: () => setEditing('none') })
  else if (editing === 'look') body = h(LookEditor, { t, profile: live.profile, onDone: () => setEditing('none') })
  else if (tab === 'activity') body = h(Activity, { t, name, useSessions, useSessionStatus })
  else if (tab === 'approvals') {
    body = prefs.approvals.length === 0
      ? h('p', { className: 'nm-pf-empty' }, t('pfApprovalsEmpty', { name }))
      : h('div', { className: 'nm-pf-rows' }, prefs.approvals.map((a, i) => h('div', { key: `${a.at}-${i}`, className: 'nm-pf-row' },
          h('span', { className: 'nm-pf-row-icon' }, h(IconShield, { size: 18 })),
          h('div', { className: 'nm-pf-row-main' },
            h('div', { className: 'nm-pf-row-title' }, a.reason || a.toolName),
            h('div', { className: 'nm-pf-row-sub' }, `${a.outcome === 'allowed' ? t('pfAllowed') : t('pfDenied')} · ${timeOf(a.at, t)}`)))))
  } else if (tab === 'schedule') {
    body = h('div', { className: 'nm-pf-stack' },
      h('p', { className: 'nm-pf-empty' }, t('pfScheduleEmpty', { name })),
      h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: () => { profileBus.close(); openSchedules() } }, t('pfOpenSchedules')))
  } else {
    body = h('div', { className: 'nm-pf-stack' },
      h('p', { className: 'nm-pf-empty' }, t('pfMemoryText', { name })),
      live.profile.description
        ? h('div', { className: 'nm-pf-row' },
            h('div', { className: 'nm-pf-row-main' },
              h('div', { className: 'nm-pf-row-title' }, t('pfDescription')),
              h('div', { className: 'nm-pf-row-sub nm-wrap' }, live.profile.description)))
        : null,
      live.profile.avatar === 'face' ? h('p', { className: 'nm-pf-empty' }, t('pfFaceNote')) : null)
  }

  return h('aside', { ref: panel, tabIndex: -1, className: 'nm-pf', role: 'complementary', 'aria-label': name },
    h('div', { className: 'nm-pf-top', 'data-window-drag': true },
      h('button', { type: 'button', className: 'nm-icon-btn', 'aria-label': t('close'), onClick: () => profileBus.close() }, h(IconClose, { size: 16 }))),
    h('div', { className: 'nm-pf-head' },
      h('div', { className: 'nm-pf-face' },
        h(Avatar, { size: 86, profile: live.profile, mood: 'idle' }),
        h('button', { type: 'button', className: 'nm-pf-pen', 'aria-label': t('pfEditName'), 'aria-haspopup': 'menu', 'aria-expanded': menu, onClick: () => setMenu((m) => !m) }, h(IconPencil, { size: 13 })),
        menu
          ? h('div', { className: 'nm-menu nm-pf-menu', role: 'menu' },
              h('button', { type: 'button', role: 'menuitem', className: 'nm-menu-item', onClick: () => { setMenu(false); setEditing('look') } }, h('span', { className: 'nm-menu-item-label' }, t('pfChangeLook'))),
              h('button', { type: 'button', role: 'menuitem', className: 'nm-menu-item', onClick: () => { setMenu(false); setEditing('name') } }, h('span', { className: 'nm-menu-item-label' }, t('pfEditName'))))
          : null),
      h('div', { className: 'nm-pf-name' }, name),
      status),
    editing === 'none'
      ? h('div', { className: 'nm-seg', role: 'tablist' }, tabs.map((item) =>
          h('button', { key: item.id, type: 'button', role: 'tab', className: `nm-seg-btn${tab === item.id ? ' nm-active' : ''}`, 'aria-selected': tab === item.id, 'aria-label': item.label, title: item.label, onClick: () => setTab(item.id) }, item.icon)))
      : null,
    h('div', { className: 'nm-pf-body' }, body))
}

function Activity({ t, name, useSessions, useSessionStatus }: { t: Translate; name: string; useSessions: ProfileDrawerProps['useSessions']; useSessionStatus: ProfileDrawerProps['useSessionStatus'] }): ReactNode {
  const live = useLive()
  const sessions = typeof useSessions === 'function'
    ? useSessions((s) => s.ids.map((id) => s.byId[id]).filter((c) => c !== undefined && c.origin !== 'subagent' && !c.blank))
    : []
  const statuses = typeof useSessionStatus === 'function' ? useSessionStatus((m) => m) : undefined
  interface Row { at: number; title: string; sub: string; live: boolean }
  const rows: Row[] = sessions.map((c) => {
    const status = statuses?.get(c!.id)
    const waiting = status?.pendingInteraction !== undefined
    const running = status?.running ?? c!.running
    return { at: c!.updatedAt, title: c!.displayTitle, sub: waiting ? t('chWaiting') : running ? t('chRunning') : timeOf(c!.updatedAt, t), live: running || waiting }
  })
  for (const notice of live.notices) rows.push({ at: notice.at, title: notice.title, sub: `${notice.from} · ${timeOf(notice.at, t)}`, live: false })
  rows.sort((a, b) => b.at - a.at)
  if (rows.length === 0) return h('p', { className: 'nm-pf-empty' }, t('pfNoActivity', { name }))
  const today = startOfToday()
  const recent = rows.filter((r) => r.at >= today)
  const earlier = rows.filter((r) => r.at < today)
  const list = (items: Row[]) => items.slice(0, 30).map((r, i) => h('div', { key: `${r.at}-${i}`, className: 'nm-pf-row' },
    h('span', { className: `nm-pf-row-icon${r.live ? ' nm-live' : ''}` }, h(r.live ? IconClock : IconCheck, { size: 18 })),
    h('div', { className: 'nm-pf-row-main' },
      h('div', { className: 'nm-pf-row-title' }, r.title),
      h('div', { className: 'nm-pf-row-sub' }, r.sub))))
  return h('div', { className: 'nm-pf-rows' },
    recent.length > 0 ? h('div', { className: 'nm-pf-day' }, t('pfToday')) : null,
    list(recent),
    earlier.length > 0 ? h('div', { className: 'nm-pf-day' }, t('pfEarlier')) : null,
    list(earlier))
}

function NameEditor({ t, profile, onDone }: { t: Translate; profile: LiveProfile; onDone(): void }): ReactNode {
  const [value, setValue] = useState(profile.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const save = (event: FormEvent) => {
    event.preventDefault()
    const name = value.trim()
    if (!name) return
    setBusy(true)
    setError(undefined)
    call('profile', { name })
      .then(() => onDone())
      .catch((err: unknown) => setError(t('failed', { message: (err as Error).message })))
      .finally(() => setBusy(false))
  }
  return h('form', { className: 'nm-pf-stack', onSubmit: save },
    h('label', { className: 'nm-pf-label' }, t('pfNameLabel')),
    h('input', { className: 'nm-field', value, maxLength: 60, autoFocus: true, 'aria-label': t('pfNameLabel'), onChange: (e: FormEvent<HTMLInputElement>) => setValue(e.currentTarget.value) }),
    error ? h('div', { className: 'nm-ob-error', role: 'alert' }, error) : null,
    h('div', { className: 'nm-pf-actions' },
      h('button', { type: 'submit', className: 'nm-pill nm-pill-sm', disabled: busy || value.trim().length === 0 }, t('save')),
      h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', disabled: busy, onClick: onDone }, t('cancel'))))
}

function LookEditor({ t, profile, onDone }: { t: Translate; profile: LiveProfile; onDone(): void }): ReactNode {
  const [avatar, setAvatar] = useState<'dragon' | 'emoji'>(profile.avatar === 'emoji' ? 'emoji' : 'dragon')
  const [emoji, setEmoji] = useState(profile.emoji || '✨')
  const [color, setColor] = useState(profile.color || '#0064d4')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const preview: LiveProfile = { ...profile, avatar, emoji, color }
  const save = () => {
    setBusy(true)
    setError(undefined)
    call('profile', avatar === 'emoji' ? { avatar, emoji, color } : { avatar })
      .then(() => onDone())
      .catch((err: unknown) => setError(t('failed', { message: (err as Error).message })))
      .finally(() => setBusy(false))
  }
  return h('div', { className: 'nm-pf-stack' },
    h('div', { className: 'nm-pf-preview' }, h(Avatar, { size: 72, profile: preview })),
    h('div', { className: 'nm-seg', role: 'radiogroup' },
      h('button', { type: 'button', role: 'radio', 'aria-checked': avatar === 'dragon', className: `nm-seg-btn nm-seg-text${avatar === 'dragon' ? ' nm-active' : ''}`, onClick: () => setAvatar('dragon') }, t('lookDragon')),
      h('button', { type: 'button', role: 'radio', 'aria-checked': avatar === 'emoji', className: `nm-seg-btn nm-seg-text${avatar === 'emoji' ? ' nm-active' : ''}`, onClick: () => setAvatar('emoji') }, t('lookEmoji'))),
    avatar === 'emoji'
      ? h('div', { className: 'nm-pf-stack' },
          h('label', { className: 'nm-pf-label' }, t('pfEmoji')),
          h('div', { className: 'nm-pf-choices' }, EMOJI_CHOICES.map((e) => h('button', { key: e, type: 'button', className: `nm-pf-choice${emoji === e ? ' nm-active' : ''}`, onClick: () => setEmoji(e) }, e))),
          h('input', { className: 'nm-field', value: emoji, maxLength: 16, 'aria-label': t('pfEmoji'), onChange: (e: FormEvent<HTMLInputElement>) => setEmoji(e.currentTarget.value) }),
          h('label', { className: 'nm-pf-label' }, t('pfColor')),
          h('div', { className: 'nm-pf-choices' }, COLOR_CHOICES.map((c) => h('button', { key: c, type: 'button', className: `nm-pf-swatch${color === c ? ' nm-active' : ''}`, style: { background: c }, 'aria-label': c, onClick: () => setColor(c) }))))
      : profile.avatar === 'face' ? h('p', { className: 'nm-pf-empty' }, t('pfFaceNote')) : null,
    error ? h('div', { className: 'nm-ob-error', role: 'alert' }, error) : null,
    h('div', { className: 'nm-pf-actions' },
      h('button', { type: 'button', className: 'nm-pill nm-pill-sm', disabled: busy, onClick: save }, t('save')),
      h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', disabled: busy, onClick: onDone }, t('cancel'))))
}
