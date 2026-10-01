/**
 * The capsule: what the Android app draws over the screen while its Hands work,
 * here in the harness's frame-wide overlay — the face in a ring, three moving
 * bars, the step and what it is doing, and **Stop**. It shows while a Hands
 * (`mcp__nanomuse__computer_*`) or Reach (`device_*`, `delegate`) call is in
 * flight, as the host streams it, and lingers a moment between steps so a run
 * reads as one. Stop cancels the session's turn the way the composer's stop
 * button does. Notices other devices send (`notify`) show under it as toasts.
 */
import { Button, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { Avatar } from './Avatar.tsx'
import { call } from './api.ts'
import { useLive, type LiveCall, type LiveNotice } from './live.ts'
import type { Words } from './locales.ts'

const LINGER_MS = 1800

/** What a call is, in the person's words. */
export function describeCall(t: Translate, c: LiveCall): string {
  const a = c.args
  const device = a.device || t('otherDevice')
  if (c.name === 'mcp__nanomuse__computer_screen') return t('handsLooking')
  if (c.name === 'mcp__nanomuse__computer_act') {
    const action = (a.action ?? '').toLowerCase()
    if (action === 'click' || action === 'tap' || action === 'double_click' || action === 'right_click') return a.label ? t('handsClick', { label: a.label }) : t('handsClickSomewhere')
    if (action === 'type' || action === 'text') return t('handsType', { text: a.text ?? '' })
    if (action === 'scroll' || action === 'swipe') return t('handsScroll')
    if (action === 'key' || action === 'hotkey' || action === 'press') return t('handsKey', { text: a.text ?? a.label ?? '' })
    if (action === 'wait') return t('handsWait')
    return a.label ? t('handsClick', { label: a.label }) : t('handsAct', { action: a.action ?? '' })
  }
  if (c.name === 'device_screen') return t('reachScreen', { device })
  if (c.name === 'device_shell') return t('reachShell', { device, command: a.command ?? '' })
  if (c.name === 'device_files') return t('reachFiles', { device })
  if (c.name === 'device_open') return t('reachOpen', { device })
  if (c.name === 'device_notify') return t('reachNotify', { device })
  if (c.name === 'delegate') return t('reachDelegate', { device })
  if (c.name === 'devices') return t('reachDevices')
  return c.name
}

/** The toast line for something another device did here. */
function callKey(action: string | undefined): Words {
  switch (action) {
    case 'shell':
      return 'incomingShell'
    case 'file.get':
      return 'incomingFileGet'
    case 'file.put':
      return 'incomingFilePut'
    case 'open':
      return 'incomingOpen'
    case 'screen':
      return 'incomingScreen'
    default:
      return 'incomingOther'
  }
}

export interface CapsuleProps {
  t: Translate
  /** Cancel the turn of the session the call belongs to. */
  stop(sessionId: string): Promise<void>
}

export function makeCapsule({ t, stop }: CapsuleProps) {
  return function Capsule(): ReactNode {
    const live = useLive()
    const calls = live.hands.calls
    const current = calls[calls.length - 1]
    const [shown, setShown] = useState<LiveCall | undefined>(current)
    const [stopping, setStopping] = useState(false)
    const lingerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    useEffect(() => {
      if (current) {
        if (lingerTimer.current) clearTimeout(lingerTimer.current)
        lingerTimer.current = undefined
        setShown(current)
        return
      }
      if (shown && !lingerTimer.current) {
        lingerTimer.current = setTimeout(() => {
          lingerTimer.current = undefined
          setShown(undefined)
          setStopping(false)
        }, LINGER_MS)
      }
      return undefined
    }, [current, shown])

    const onStop = () => {
      if (!shown || stopping) return
      setStopping(true)
      void stop(shown.sessionId).catch(() => setStopping(false))
    }

    return h('div', { style: { position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' } },
      shown ? h(Pill, { t, call: shown, live: Boolean(current), step: live.hands.steps, profile: live.profile, stopping, onStop }) : null,
      h(Notices, { t, notices: live.notices }))
  }
}

interface PillProps {
  t: Translate
  call: LiveCall
  live: boolean
  step: number
  profile: Parameters<typeof Avatar>[0]['profile']
  stopping: boolean
  onStop(): void
}

function Pill({ t, call: c, live, step, profile, stopping, onStop }: PillProps): ReactNode {
  const reach = !c.name.startsWith('mcp__')
  return h('div', {
    role: 'status',
    'aria-live': 'polite',
    style: {
      pointerEvents: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '6px 10px 6px 6px',
      borderRadius: 999,
      background: 'rgba(24, 24, 28, 0.92)',
      color: '#fff',
      boxShadow: '0 6px 24px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.06) inset',
      backdropFilter: 'blur(8px)',
      fontSize: 13,
      lineHeight: 1.2,
      maxWidth: 'min(640px, 90vw)',
    },
  },
    h('span', { style: { position: 'relative', display: 'inline-flex', width: 32, height: 32, borderRadius: '50%', boxShadow: live ? '0 0 0 2px rgba(116, 200, 255, 0.9)' : '0 0 0 2px rgba(255,255,255,0.25)', transition: 'box-shadow 300ms' } },
      h(Avatar, { size: 32, profile, mood: stopping ? 'waiting' : 'working' })),
    h(Bars, { live: live && !stopping }),
    h('span', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
      h('span', { style: { fontSize: 11, opacity: 0.7, letterSpacing: '0.02em' } }, `${reach ? t('capsuleReach') : t('capsuleHands')} · ${t('capsuleStep', { n: step })}`),
      h('span', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 } }, stopping ? t('capsuleStopping') : describeCall(t, c))),
    h(Button, { variant: 'outline', size: 'sm', disabled: stopping, onClick: onStop, style: { color: '#fff', borderColor: 'rgba(255,255,255,0.35)', marginLeft: 4 } }, t('capsuleStop')))
}

/** Three bars that move while the hands work. */
function Bars({ live }: { live: boolean }): ReactNode {
  return h('span', { 'aria-hidden': true, style: { display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 16, width: 16 } },
    [0, 1, 2].map((i) =>
      h('span', {
        key: i,
        style: {
          width: 3,
          borderRadius: 2,
          background: live ? 'rgba(116, 200, 255, 0.95)' : 'rgba(255,255,255,0.35)',
          height: live ? undefined : 6,
          animation: live ? `nanomuse-bars 900ms ${i * 150}ms ease-in-out infinite alternate` : 'none',
          minHeight: 4,
        },
      })),
    h('style', null, '@keyframes nanomuse-bars { from { height: 4px } to { height: 16px } }'))
}

/** The newest notice from another device, once each. */
function Notices({ t, notices }: { t: Translate; notices: LiveNotice[] }): ReactNode {
  const [seen, setSeen] = useState(0)
  const latest = notices[notices.length - 1]
  if (!latest || latest.id <= seen) return null
  const text =
    latest.kind === 'call'
      ? t(callKey(latest.action), { from: latest.from, what: latest.text })
      : `${latest.from}${latest.title ? ` · ${latest.title}` : ''}: ${latest.text}`
  return h(Toast, {
    key: latest.id,
    text,
    holdMs: 6000,
    onDone: () => {
      setSeen(latest.id)
      if (latest.id === notices[notices.length - 1]?.id) void call('notices/clear', {}).catch(() => undefined)
    },
  })
}
