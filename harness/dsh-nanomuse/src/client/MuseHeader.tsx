/**
 * The agent pinned over the conversation, the way the Muse desktop keeps its
 * face, name and a status line at the top of every chat: the account's face
 * (ringed while it works), its name, and one line that says what it is doing —
 * connected, thinking, which Hands step, waiting for your word — with **Stop**
 * beside it while a turn runs. Occupies `conversation.header.leading`, the
 * root-scoped seat before the session title, and centres itself over the
 * header with the stylesheet's help.
 */
import { createElement as h, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { Avatar, type Mood } from './Avatar.tsx'
import { describeCall } from './Capsule.tsx'
import { IconStop } from './icons.tsx'
import { useLive, type LiveCall } from './live.ts'

const LINGER_MS = 1800

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

interface Activity {
  /** Session ids with a turn running. */
  running: string[]
  /** Whether any session waits on the person (approval, question). */
  waiting: boolean
}

function useActivity(useSessionStatus: UseSessionStatus | undefined): Activity {
  const none: Activity = { running: [], waiting: false }
  if (typeof useSessionStatus !== 'function') return none
  return useSessionStatus((snapshot) => {
    const running: string[] = []
    let waiting = false
    for (const [id, status] of snapshot) {
      if (status.pendingInteraction !== undefined) waiting = true
      if (status.running === true) running.push(id)
    }
    return running.length === 0 && !waiting ? none : { running, waiting }
  })
}

export function MuseHeader({ t, stop, openProfile, useSessionStatus }: MuseHeaderProps): ReactNode {
  const live = useLive()
  const activity = useActivity(useSessionStatus)
  const calls = live.hands.calls
  const current = calls[calls.length - 1]
  const [shown, setShown] = useState<LiveCall | undefined>(current)
  const [stopping, setStopping] = useState(false)
  const linger = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A finished call lingers a moment so a run of steps reads as one.
  useEffect(() => {
    if (current) {
      if (linger.current) clearTimeout(linger.current)
      linger.current = undefined
      setShown(current)
      return undefined
    }
    if (shown && !linger.current) {
      linger.current = setTimeout(() => { linger.current = undefined; setShown(undefined) }, LINGER_MS)
    }
    return undefined
  }, [current, shown])
  useEffect(() => { if (activity.running.length === 0) setStopping(false) }, [activity.running.length])

  const busy = activity.running.length > 0
  let mood: Mood = 'idle'
  let ring = ''
  let dot = live.hub.connected || live.cloud.signedIn ? 'nm-on' : ''
  let line: string
  if (activity.waiting) {
    mood = 'waiting'
    ring = 'nm-wait'
    dot = 'nm-wait'
    line = t('statusWaiting')
  } else if (shown && (busy || current)) {
    mood = 'working'
    ring = 'nm-live'
    dot = 'nm-live'
    const reach = !shown.name.startsWith('mcp__')
    line = `${reach ? t('capsuleReach') : t('capsuleHands')} · ${t('capsuleStep', { n: live.hands.steps })} · ${describeCall(t, shown)}`
  } else if (busy) {
    mood = 'working'
    ring = 'nm-live'
    dot = 'nm-live'
    line = t('statusThinking')
  } else if (!live.streaming) {
    line = t('statusStarting')
  } else if (!live.cloud.signedIn) {
    line = t('statusSignedOut')
  } else if (live.hub.connected) {
    const others = live.hub.devices.filter((d) => d.id !== live.hub.deviceId && d.kind !== 'web' && d.online).length
    line = others > 0 ? t('statusConnectedWith', { n: others }) : t('statusConnected')
  } else {
    line = live.hub.lastError ? t('statusHubOffline') : t('statusConnecting')
  }
  if (stopping) line = t('capsuleStopping')

  const onStop = () => {
    if (stopping) return
    const targets = activity.running.length ? activity.running : (shown ? [shown.sessionId] : [])
    if (targets.length === 0) return
    setStopping(true)
    void Promise.all(targets.map((id) => stop(id))).catch(() => setStopping(false))
  }

  return h('div', { className: 'nm-header', role: 'status', 'aria-live': 'polite' },
    h('button', { type: 'button', className: `nm-header-face ${ring}`.trim(), 'aria-label': live.profile.name || t('brand'), title: t('railProfile'), onClick: openProfile },
      h(Avatar, { size: 44, profile: live.profile, mood })),
    h('div', { className: 'nm-header-name' }, live.profile.name || t('brand')),
    h('div', { className: `nm-header-status${busy ? ' nm-live' : ''}` },
      h('span', { className: `nm-status-dot ${dot}`.trim(), 'aria-hidden': true }),
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, line),
      busy ? h('button', { type: 'button', className: 'nm-stop', disabled: stopping, onClick: onStop }, h(IconStop, { size: 14 }), t('capsuleStop')) : null))
}
