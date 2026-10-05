/**
 * "Try it" for the hands, and the two things that most often stand in their way on a Mac.
 *
 * `HandsTryRows` — two rows for Settings → Computer use and the first-run page: *Take a
 * test screenshot* (a thumbnail of what the hands see, or the black frame that means Screen
 * Recording is missing for nanoMuse Desktop) and *Move the mouse a little* (20 px and back,
 * or "Accessibility not granted"). Both go through the host, which starts a fresh
 * `nanomuse mcp` as its child — the same chain the real hands run in, so a pass here is a
 * pass for them. The screenshot row also reports window mode (`hands.status.window.reason`).
 *
 * `RuntimeRow` — which binary the hands run, loud when `NANOMUSE_PY` points at nothing or at
 * the wrong file, with the fix.
 *
 * `BlackScreenNotice` — the unmissable one: the hands saw an all-black screen. On macOS the
 * grant applies to freshly started apps only, so the fix is a relaunch, and the button is
 * right there.
 */
import { createElement as h, useCallback, useEffect, useState, type ReactNode } from 'react'
import { call, type Translate } from './api.ts'
import { IconCheck, IconMonitor, IconRefresh } from './icons.tsx'
import type { Permissions } from './permissions.ts'

export interface ScreenshotResult {
  ok: boolean
  black: boolean
  thumbnail?: string
  width?: number
  height?: number
  title?: string
  window?: { available: boolean; reason: string }
  error?: string
}

export interface MoveResult {
  ok: boolean
  accessibility: boolean
  error?: string
}

export interface RuntimeInfo {
  path: string
  source: 'env' | 'path' | 'none'
  ok: boolean
  problem?: 'missing' | 'not-executable' | 'not-found'
}

type Busy = 'screenshot' | 'move' | null

/** The two "try it" rows. `onScreenshot` hears every screenshot result (the Computer-use page shows window mode from it). */
export function HandsTryRows({ t, perms, onScreenshot }: { t: Translate; perms: Permissions; onScreenshot?: (r: ScreenshotResult) => void }): ReactNode {
  const [busy, setBusy] = useState<Busy>(null)
  const [shot, setShot] = useState<ScreenshotResult | null>(null)
  const [move, setMove] = useState<MoveResult | null>(null)
  const run = useCallback(
    (kind: 'screenshot' | 'move') => {
      setBusy(kind)
      void call<ScreenshotResult | MoveResult>('hands/check', { kind })
        .then((r) => {
          if (kind === 'screenshot') {
            setShot(r as ScreenshotResult)
            onScreenshot?.(r as ScreenshotResult)
          } else setMove(r as MoveResult)
        })
        .catch((error: unknown) => {
          const text = error instanceof Error ? error.message : String(error)
          if (kind === 'screenshot') setShot({ ok: false, black: false, error: text })
          else setMove({ ok: false, accessibility: false, error: text })
        })
        .finally(() => setBusy(null))
    },
    [onScreenshot],
  )
  const tryButton = (kind: 'screenshot' | 'move') => h('button', { type: 'button', className: 'nm-pill nm-pill-sm', disabled: busy !== null, onClick: () => run(kind) }, busy === kind ? t('pmTryRunning') : t('pmTryRun'))
  return h(
    'div',
    { className: 'nm-card nm-hc' },
    h(
      'div',
      { className: 'nm-row' },
      h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, t('pmTryShot')), h('span', { className: 'nm-row-sub nm-wrap' }, t('pmTryLead'))),
      tryButton('screenshot'),
    ),
    shot ? h(ShotResult, { t, shot, perms }) : null,
    h(
      'div',
      { className: 'nm-row' },
      h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, t('pmTryMove')), h('span', { className: 'nm-row-sub' }, t('pmTryMoveSub'))),
      tryButton('move'),
    ),
    move
      ? h(
          'div',
          { className: `nm-hc-result${move.ok ? ' nm-hc-ok' : ' nm-hc-bad'}`, role: 'status' },
          move.ok ? h(IconCheck, { size: 16 }) : null,
          h('span', { className: 'nm-wrap' }, move.ok ? t('pmTryMoveOk') : move.accessibility ? t('pmTryMoveNoAccess') : t('pmTryFailed', { error: move.error ?? '' })),
          !move.ok && move.accessibility ? h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: () => perms.settings('accessibility') }, t('obOpenSettings')) : null,
        )
      : null,
  )
}

function ShotResult({ t, shot, perms }: { t: Translate; shot: ScreenshotResult; perms: Permissions }): ReactNode {
  if (shot.ok) {
    return h(
      'div',
      { className: 'nm-hc-result nm-hc-ok', role: 'status' },
      shot.thumbnail ? h('img', { className: 'nm-hc-thumb', src: shot.thumbnail, alt: '', width: 96, draggable: false }) : h(IconCheck, { size: 16 }),
      h('span', { className: 'nm-wrap' }, t('pmTryShotOk', { w: shot.width ?? 0, h: shot.height ?? 0, title: shot.title || '—' })),
    )
  }
  return h(
    'div',
    { className: 'nm-hc-result nm-hc-bad', role: 'alert' },
    h('span', { className: 'nm-hc-black', 'aria-hidden': true }),
    h('span', { className: 'nm-wrap' }, shot.black ? t('pmTryShotBlack') : t('pmTryFailed', { error: shot.error ?? '' })),
    shot.black
      ? h(
          'span',
          { className: 'nm-hc-actions' },
          h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: () => perms.settings('screen') }, t('obOpenSettings')),
          h('button', { type: 'button', className: 'nm-pill nm-pill-sm', onClick: () => perms.relaunch() }, t('pmBlackRelaunch')),
        )
      : null,
  )
}

/** Which binary the hands run; loud about a path that leads nowhere. */
export function RuntimeRow({ t }: { t: Translate }): ReactNode {
  const [info, setInfo] = useState<RuntimeInfo | null>(null)
  useEffect(() => {
    let on = true
    void call<RuntimeInfo>('hands/runtime')
      .then((r) => {
        if (on) setInfo(r)
      })
      .catch(() => undefined)
    return () => {
      on = false
    }
  }, [])
  if (!info) return null
  const sub = info.ok
    ? `${info.path} · ${info.source === 'env' ? t('pmRuntimeBundled') : t('pmRuntimeOnPath')}`
    : info.problem === 'missing'
      ? t('pmRuntimeMissing', { path: info.path })
      : info.problem === 'not-executable'
        ? t('pmRuntimeNotExec', { path: info.path })
        : t('pmRuntimeNone')
  return h(
    'div',
    { className: `nm-row${info.ok ? '' : ' nm-hc-runtime-bad'}` },
    h('span', { className: 'nm-row-icon' }, h(IconMonitor, { size: 18 })),
    h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, t('pmRuntime')), h('span', { className: 'nm-row-sub nm-wrap nm-hc-mono' }, sub)),
    info.ok ? h('span', { className: 'nm-ob-granted', 'aria-label': t('obAllowed') }, h(IconCheck, { size: 16 })) : null,
  )
}

/** What the black-screen notice needs of `usePermissions()`; the capsule builds it from the live state so it need not poll. */
export type BlackScreenPerms = Pick<Permissions, 'blackScreen' | 'relaunch' | 'clearBlackScreen'>

/** The hands saw a black screen: Screen Recording for nanoMuse Desktop, then a relaunch — the button is here. */
export function BlackScreenNotice({ t, perms, compact = false }: { t: Translate; perms: BlackScreenPerms; compact?: boolean }): ReactNode {
  if (!perms.blackScreen) return null
  return h(
    'div',
    { className: `nm-hc-black-notice${compact ? ' nm-hc-compact' : ''}`, role: 'alert' },
    h('div', { className: 'nm-hc-black-text' }, h('strong', null, t('pmBlackTitle')), compact ? null : h('span', { className: 'nm-wrap' }, t('pmBlackBody'))),
    h(
      'div',
      { className: 'nm-hc-actions' },
      h('button', { type: 'button', className: 'nm-pill nm-pill-sm', onClick: () => perms.relaunch() }, h(IconRefresh, { size: 14 }), ' ', t('pmBlackRelaunch')),
      h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: () => perms.clearBlackScreen() }, t('pmBlackLater')),
    ),
  )
}
