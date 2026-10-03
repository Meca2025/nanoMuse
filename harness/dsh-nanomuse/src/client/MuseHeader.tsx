/**
 * The agent pinned over the conversation, the way the Muse desktop keeps its
 * face and name at the top of every chat, with one small line under the name
 * while something is happening: what step it is on (looking at the screen,
 * searching, writing, running a command, waiting for your word), "done" for a
 * moment when a turn ends, and a passing "N approvals allowed" after an
 * approval card. Idle, it is the face and the name alone. Hovering the face
 * enlarges it; clicking opens the profile. Occupies `conversation.header.leading`.
 */
import { createElement as h, Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { Avatar, type Mood } from './Avatar.tsx'
import { describeCall } from './Capsule.tsx'
import { IconCheck, IconChevronLeft, IconMenu, IconSpinner } from './icons.tsx'
import { useLive } from './live.ts'
import { mainChatId } from './MuseChats.tsx'
import { usePrefs } from './prefs.ts'
import { statusWords } from './ProfileDrawer.tsx'
import { activityOf, nav, useRooms } from './rooms.ts'
import { useWin } from './win.ts'

/** "Done" stays this long after a turn ends; the approvals toast this long. */
const DONE_MS = 2600
const TOAST_MS = 3200
/** The first seconds of a turn read as "gathering thoughts". */
const PLANNING_MS = 4000

interface SessionStatus {
  running: boolean | undefined
  pendingInteraction: unknown
}
export type UseSessionStatus = <S>(selector: (snapshot: ReadonlyMap<string, SessionStatus>) => S) => S

export interface MuseHeaderProps {
  t: Translate
  stop(sessionId: string): Promise<void>
  openProfile(): void
  useSessionStatus?: UseSessionStatus | undefined
}

export function MuseHeader({ t, openProfile, useSessionStatus }: MuseHeaderProps): ReactNode {
  const live = useLive()
  const rooms = useRooms()
  const prefs = usePrefs()
  const { current, split } = useWin()
  const status = typeof useSessionStatus === 'function' ? useSessionStatus((map) => (current ? map.get(current) : undefined)) : undefined
  const record = activityOf(rooms, current)
  const running = status?.running === true || record?.status === 'running'
  const pending = status?.pendingInteraction as { kind?: string } | undefined
  const waiting = pending !== undefined
  // an approval request reads "needs approval"; a question (or plan review) "waiting for you"
  const askingYou = waiting && pending?.kind !== 'approval'
  const [, tick] = useState(0)
  const [toast, setToast] = useState<{ n: number; at: number } | null>(null)
  const approvals = useRef(prefs.approvals.length)

  // "done" lingers, "gathering thoughts" ages into "working": re-render on a clock while it matters
  useEffect(() => {
    const endedAt = record?.endedAt ?? 0
    const young = running && record && Date.now() - record.startedAt < PLANNING_MS
    const fresh = !running && endedAt && Date.now() - endedAt < DONE_MS
    if (!young && !fresh) return undefined
    const timer = window.setTimeout(() => tick((n) => n + 1), young ? PLANNING_MS - (Date.now() - record!.startedAt) + 50 : DONE_MS - (Date.now() - endedAt) + 50)
    return () => window.clearTimeout(timer)
  }, [running, record?.startedAt, record?.endedAt])
  // the approvals toast: how many were allowed in one go
  useEffect(() => {
    const before = approvals.current
    approvals.current = prefs.approvals.length
    if (prefs.approvals.length <= before) return undefined
    const allowed = prefs.approvals.slice(0, prefs.approvals.length - before).filter((a) => a.outcome === 'allowed').length
    if (!allowed) return undefined
    setToast((t0) => ({ n: (t0 && Date.now() - t0.at < TOAST_MS ? t0.n : 0) + allowed, at: Date.now() }))
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [prefs.approvals.length])

  const calls = live.hands.calls
  const hands = calls.length ? calls[calls.length - 1] : undefined
  let mood: Mood = 'idle'
  let line: ReactNode = null
  let tone = ''
  if (waiting) {
    mood = 'waiting'
    tone = 'nm-wait'
    line = askingYou ? t('statusAsking') : t('statusNeedsApproval')
  } else if (running) {
    mood = 'working'
    tone = 'nm-live'
    if (hands && current && hands.sessionId === current) line = describeCall(t, hands)
    else if (record) line = statusWords(t, record)
    else line = t('statusWorking')
  } else if (record?.endedAt && Date.now() - record.endedAt < DONE_MS) {
    tone = 'nm-done'
    line = record.status === 'error' ? t('statusFailed') : t('statusDone')
  } else if (live.streaming && !live.cloud.signedIn) {
    line = t('statusSignedOut')
  } else if (live.streaming && !live.hub.connected && live.hub.lastError) {
    line = t('statusHubOffline')
  }

  // a side chat carries a way back to the main chat at its top left; beside a room
  // (the split) the chat column is headed "≡ 聊天" instead, which brings the chats back
  const main = mainChatId()
  const side = current !== null && main !== undefined && main !== current
  return h(Fragment, null,
    split !== null
      ? h('button', { type: 'button', className: 'nm-header-back nm-header-chats', 'aria-label': t('railChats'), title: t('splitClose'), onClick: () => nav.split(null) }, h(IconMenu, { size: 18 }), h('span', null, t('railChats')))
      : side ? h('button', { type: 'button', className: 'nm-header-back', 'aria-label': t('chMain'), title: t('chMain'), onClick: () => nav.openSession(main) }, h(IconChevronLeft, { size: 18 })) : null,
    h('div', { className: 'nm-header', role: 'status', 'aria-live': 'polite' },
      h('button', { type: 'button', className: `nm-header-face${running ? ' nm-live' : waiting ? ' nm-wait' : ''}`, 'aria-label': live.profile.name || t('brand'), title: t('railProfile'), onClick: openProfile },
        h(Avatar, { size: 44, profile: live.profile, mood })),
      h('div', { className: 'nm-header-name' }, live.profile.name || t('brand')),
      toast
        ? h('div', { className: 'nm-header-status nm-header-toast' }, h(IconCheck, { size: 13 }), t('statusApproved', { n: toast.n }))
        : line
          ? h('div', { className: `nm-header-status ${tone}`.trim() }, running || waiting ? h(IconSpinner, { size: 13 }) : null, h('span', { className: 'nm-header-line' }, line))
          : null))
}
