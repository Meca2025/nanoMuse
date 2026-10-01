/**
 * Words for what a Hands or Reach call is doing, and the toasts for what other
 * devices did here. The status itself lives in the header pinned over the
 * conversation (`MuseHeader`); this file keeps the frame-wide overlay entry
 * that shows the notices (`notify`, and each remote `call` that ran here).
 */
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useState, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { call } from './api.ts'
import { useLive, type LiveCall, type LiveNotice } from './live.ts'
import type { Words } from './locales.ts'

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
    case 'task':
      return 'incomingTask'
    default:
      return 'incomingOther'
  }
}

export interface CapsuleProps {
  t: Translate
}

/** The overlay entry: the newest notice from another device, once each. */
export function makeCapsule({ t }: CapsuleProps) {
  return function Capsule(): ReactNode {
    const live = useLive()
    return h('div', { style: { position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' } },
      h(Notices, { t, notices: live.notices }))
  }
}

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
