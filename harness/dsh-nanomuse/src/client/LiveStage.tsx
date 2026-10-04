/**
 * The Live stage — Muse's picture-in-picture of the agent at work. While the
 * hands use this computer's screen (or Reach looks at another device's), the
 * latest screenshot floats over the chat: dimmed, rounded, the agent's face
 * where it last clicked, a caption saying what it just did and which window
 * that was. × puts it away for this run; the expand button opens the frame
 * large; "Take over" cancels the running turn so the person has the mouse back.
 * The frame can be dragged anywhere over the window and resized from its
 * bottom-right corner; where it was put is remembered (`prefs.stage`).
 * The frames come from the host's `stage` (`live.ts`), the bytes from
 * `nanomuse/cloud/stage/frame?seq=N`.
 */
import { createElement as h, useEffect, useRef, useState, type ReactNode } from 'react'
import { call, type Translate } from './api.ts'
import { Avatar } from './Avatar.tsx'
import { IconCheck, IconClose, IconExpand, IconHand, IconSquare } from './icons.tsx'
import { useLive, type Live, type LiveStage as Stage, type LiveStageAction } from './live.ts'
import { setPrefs, usePrefs, type StagePlace } from './prefs.ts'
import { Sheet } from './ui.tsx'

/** How long after the last hands call the stage stays up without a new frame. */
const LINGER_MS = 120_000

/** Document-relative, so it resolves under whatever mount served the page. */
export function frameUrl(seq: number): string {
  return `nanomuse/cloud/stage/frame?seq=${seq}`
}

/** `enter`→↵ and friends, the way Muse writes keys in its captions. */
export function keyWords(keys: string): string {
  const names: Record<string, string> = { enter: '↵', return: '↵', cmd: '⌘', command: '⌘', meta: '⌘', ctrl: '⌃', control: '⌃', alt: '⌥', option: '⌥', shift: '⇧', tab: '⇥', esc: '⎋', escape: '⎋', backspace: '⌫', delete: '⌦', space: '␣', up: '↑', down: '↓', left: '←', right: '→' }
  return keys
    .split('+')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => names[k.toLowerCase()] ?? (k.length === 1 ? k.toUpperCase() : k))
    .join(' ')
}

/** The caption's verb: what the hands just did, in the past tense. */
export function describeStep(t: Translate, action: LiveStageAction | null, busy: boolean): string {
  if (!action) return busy ? t('stageLooking') : t('stageDone')
  switch (action.kind) {
    case 'look':
      return busy ? t('stageLooking') : t('stageLooked')
    case 'click':
    case 'double_click':
    case 'right_click':
    case 'middle_click':
      return action.label ? t('stageClicked', { label: action.label }) : t('stageClickedSomewhere')
    case 'type':
      return t('stageTyped', { text: action.text })
    case 'key':
      return t('stagePressed', { keys: keyWords(action.text) })
    case 'scroll':
      return t('stageScrolled')
    case 'drag':
      return t('stageDragged')
    case 'move':
      return t('stageMoved')
    case 'open_app':
      return t('stageOpened', { app: action.text })
    case 'wait':
      return t('stageWaiting')
    default:
      return action.kind
  }
}

const POINTED = new Set(['click', 'double_click', 'right_click', 'middle_click', 'move', 'drag', 'scroll'])

/** The frame's width when nothing was chosen: 400px or 38% of the window, whichever is less. */
export function defaultStageWidth(viewport: number): number {
  return Math.min(400, Math.round(viewport * 0.38))
}

const STAGE_MIN_WIDTH = 220
const STAGE_MARGIN = 8

/** A place that keeps the whole frame inside the window; `frame` is the frame as currently drawn, for its height at the new width. */
export function clampStage(place: StagePlace, viewport: { width: number; height: number }, frame: { width: number; height: number }): StagePlace {
  const width = Math.max(STAGE_MIN_WIDTH, Math.min(place.width, viewport.width - 2 * STAGE_MARGIN))
  const height = frame.width > 0 ? frame.height * (width / frame.width) : frame.height
  return {
    width,
    right: Math.max(STAGE_MARGIN, Math.min(place.right, viewport.width - width - STAGE_MARGIN)),
    bottom: Math.max(STAGE_MARGIN, Math.min(place.bottom, viewport.height - height - STAGE_MARGIN)),
  }
}

export interface LiveStageProps {
  t: Translate
  stop(sessionId: string): Promise<void>
}

/** The overlay entry: the stage, when there is a frame worth showing. */
export function makeLiveStage({ t, stop }: LiveStageProps) {
  return function LiveStageEntry(): ReactNode {
    const live = useLive()
    const stage = live.stage
    const busy = live.hands.calls.length > 0
    // × hides the stage for this run: until the hands start a new burst or another chat uses them
    const [dismissed, setDismissed] = useState<{ sessionId: string; steps: number } | null>(null)
    const [big, setBig] = useState(false)
    const [stopping, setStopping] = useState(false)
    const [, tick] = useState(0)
    // the stage fades out on its own a while after the last frame; a slow clock notices
    useEffect(() => {
      if (!stage.seq) return
      const timer = setInterval(() => tick((n) => n + 1), 15_000)
      return () => clearInterval(timer)
    }, [stage.seq])
    useEffect(() => {
      if (!busy) setStopping(false)
    }, [busy])
    if (!stage.seq) return null
    const stale = !busy && Date.now() - stage.at > LINGER_MS
    if (stale) return null
    if (dismissed && dismissed.sessionId === stage.sessionId && live.hands.steps >= dismissed.steps) return null
    const stopRun = (): void => {
      if (stopping || !stage.sessionId) return
      setStopping(true)
      void stop(stage.sessionId).catch(() => setStopping(false))
    }
    // "I'll take it": a hold (C1) — the hands wait for Done rather than stop
    const takeOver = (): void => {
      if (!stage.sessionId) return
      void call('holds', { thread: stage.sessionId, tool: 'computer', reason: '' }).catch(() => undefined)
    }
    return h(StageLayer, null,
      h(Frame, { t, live, stage, busy, stopping, onClose: () => setDismissed({ sessionId: stage.sessionId, steps: live.hands.steps }), onExpand: () => setBig(true), onTakeOver: takeOver, onStop: stopRun }),
      big ? h(Sheet, { title: stage.device || t('stageThisComputer'), onClose: () => setBig(false), closeLabel: t('close'), wide: true },
        h('div', { className: 'nm-stage-big' }, h(Picture, { live, stage, busy, dim: false }))) : null)
  }
}

/**
 * The floating layer: where the frame sits and how wide it is. Dragging the frame moves it
 * (the buttons and the picture's own controls excepted), the handle at the bottom-right
 * corner resizes it; both are kept in prefs and kept inside the window.
 */
function StageLayer({ children }: { children?: ReactNode }): ReactNode {
  const prefs = usePrefs()
  const ref = useRef<HTMLDivElement | null>(null)
  const [, bump] = useState(0)
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })
  const drawn = () => ({ width: ref.current?.offsetWidth ?? 0, height: ref.current?.offsetHeight ?? 0 })
  const place: StagePlace = prefs.stage ?? { right: 24, bottom: 96, width: defaultStageWidth(window.innerWidth) }
  const shown = clampStage(place, viewport(), drawn())
  useEffect(() => {
    const onResize = () => bump((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const track = (event: PointerEvent, move: (dx: number, dy: number) => StagePlace): void => {
    const target = event.currentTarget as HTMLElement
    const startX = event.clientX
    const startY = event.clientY
    let last = shown
    const onMove = (e: PointerEvent) => {
      last = clampStage(move(e.clientX - startX, e.clientY - startY), viewport(), drawn())
      setPrefs({ stage: last })
    }
    const onUp = () => {
      target.releasePointerCapture?.(event.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    target.setPointerCapture?.(event.pointerId)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    event.preventDefault()
  }
  const onDrag = (event: PointerEvent): void => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button, a, .nm-stage-resize')) return
    const from = shown
    track(event, (dx, dy) => ({ ...from, right: from.right - dx, bottom: from.bottom - dy }))
  }
  const onResizeStart = (event: PointerEvent): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    const from = shown
    const start = drawn()
    // the corner follows the pointer: the frame grows to the right and down, its top-left staying put
    track(event, (dx) => {
      const width = Math.max(STAGE_MIN_WIDTH, from.width + dx)
      const height = start.width > 0 ? start.height * (width / start.width) : start.height
      return { width, right: from.right - (width - from.width), bottom: from.bottom - (height - start.height) }
    })
  }
  return h('div', { ref, className: 'nm-stage-layer', style: { right: shown.right, bottom: shown.bottom, width: shown.width }, onPointerDown: onDrag },
    children,
    h('div', { className: 'nm-stage-resize', role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': 'resize', onPointerDown: onResizeStart }))
}

interface FrameProps {
  t: Translate
  live: Live
  stage: Stage
  busy: boolean
  stopping: boolean
  onClose(): void
  onExpand(): void
  onTakeOver(): void
  onStop(): void
}

function Frame({ t, live, stage, busy, stopping, onClose, onExpand, onTakeOver, onStop }: FrameProps): ReactNode {
  const where = stage.source === 'device' ? stage.device : stage.title
  const hold = live.holds.find((x) => x.thread === stage.sessionId) ?? (stage.sessionId ? undefined : live.holds[0])
  const caption = hold ? t('stageYourTurn') : describeStep(t, stage.action, busy)
  const approvals = live.approvals.filter((a) => !stage.sessionId || a.sessionId === stage.sessionId)
  return h('div', { className: `nm-stage${busy ? ' nm-busy' : ''}${hold ? ' nm-held' : ''}`, role: 'region', 'aria-label': t('stageLive') },
    h(Picture, { live, stage, busy, dim: true }),
    h('button', { type: 'button', className: 'nm-stage-btn nm-stage-close', 'aria-label': t('stageClose'), title: t('stageClose'), onClick: onClose }, h(IconClose, { size: 14 })),
    h('div', { className: 'nm-stage-tools' },
      h('button', { type: 'button', className: 'nm-stage-btn', 'aria-label': t('stageExpand'), title: t('stageExpand'), onClick: onExpand }, h(IconExpand, { size: 14 })),
      (busy || stopping) && stage.sessionId
        ? h('button', { type: 'button', className: 'nm-stage-btn', 'aria-label': t('capsuleStop'), title: t('capsuleStop'), disabled: stopping, onClick: onStop }, h(IconSquare, { size: 13 }))
        : null,
      hold
        ? h('button', { type: 'button', className: 'nm-stage-pill nm-stage-pill-on', onClick: () => void call(`holds/${encodeURIComponent(hold.id)}/done`, {}).catch(() => undefined) }, h(IconCheck, { size: 14 }), t('stageDoneBtn'))
        : busy && stage.sessionId && stage.source === 'computer'
          ? h('button', { type: 'button', className: 'nm-stage-pill', onClick: onTakeOver }, h(IconHand, { size: 14 }), t('stageTakeIt'))
          : null),
    h('div', { className: 'nm-stage-caption' },
      busy && !hold ? h('span', { className: 'nm-stage-dot', 'aria-hidden': true }) : null,
      h('span', { className: 'nm-stage-verb' }, caption),
      hold?.reason ? h('span', { className: 'nm-stage-where' }, ` — ${hold.reason}`) : where ? h('span', { className: 'nm-stage-where' }, ` · ${where}`) : null),
    stage.mode === 'window' && !hold ? h('div', { className: 'nm-stage-note' }, t('stageWindowMode', { app: stage.title.split(/\s+[—–·|-]\s+/)[0] || t('stageThisComputer') })) : null,
    approvals.length ? h(StageApproval, { t, approval: approvals[0]!, app: stage.title.split(/\s+[—–·|-]\s+/)[0] ?? '' }) : null)
}

/** The question the agent asked before a step, answered here without going back to the chat (C2). */
function StageApproval({ t, approval, app }: { t: Translate; approval: Live['approvals'][number]; app: string }): ReactNode {
  const zh = t('langTag') === 'zh'
  const text = (zh && approval.summaryZh) || approval.summary || approval.purpose || approval.toolName
  const decide = (approved: boolean, scope: 'once' | 'always' = 'once') => void call(`approvals/${encodeURIComponent(approval.id)}`, { approved, scope, reason: '' }).catch(() => undefined)
  const hands = approval.toolName.startsWith('mcp__nanomuse__')
  return h('div', { className: 'nm-stage-ask', role: 'group', 'aria-label': t('statusNeedsApproval') },
    h('div', { className: 'nm-stage-ask-text' }, text),
    h('div', { className: 'nm-stage-ask-actions' },
      h('button', { type: 'button', className: 'nm-stage-pill nm-stage-pill-on', onClick: () => decide(true) }, t('stageAllowOnce')),
      hands && app ? h('button', { type: 'button', className: 'nm-stage-pill', onClick: () => decide(true, 'always') }, t('stageAlwaysApp', { app })) : null,
      h('button', { type: 'button', className: 'nm-stage-pill nm-stage-pill-no', onClick: () => decide(false) }, t('stageDeny'))))
}

/** The frame with the agent's face where it last pointed. */
function Picture({ live, stage, busy, dim }: { live: Live; stage: Stage; busy: boolean; dim: boolean }): ReactNode {
  const ratio = stage.width > 0 && stage.height > 0 ? `${stage.width} / ${stage.height}` : '16 / 10'
  const action = stage.action
  const pointed = action && action.x >= 0 && action.y >= 0 && stage.width > 0 && stage.height > 0 && POINTED.has(action.kind)
  return h('div', { className: `nm-stage-picture${dim ? ' nm-dim' : ''}`, style: { aspectRatio: ratio } },
    h('img', { src: frameUrl(stage.seq), alt: '', draggable: false }),
    pointed
      ? h('div', { key: action.at, className: 'nm-stage-cursor', style: { left: `${(action.x / stage.width) * 100}%`, top: `${(action.y / stage.height) * 100}%` } },
          action.kind !== 'move' ? h('span', { className: 'nm-stage-ripple', 'aria-hidden': true }) : null,
          h(Avatar, { size: 26, profile: live.profile, mood: busy ? 'working' : 'idle', className: 'nm-stage-face' }))
      : null)
}
