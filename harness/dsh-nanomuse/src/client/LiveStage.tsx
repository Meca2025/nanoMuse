/**
 * The Live stage — Muse's picture-in-picture of the agent at work. While the
 * hands use this computer's screen (or Reach looks at another device's), the
 * latest screenshot floats over the chat: dimmed, rounded, the agent's face
 * where it last clicked, a caption saying what it just did and which window
 * that was. × puts it away for this run; the expand button opens the frame
 * large; "Take over" cancels the running turn so the person has the mouse back.
 * The frames come from the host's `stage` (`live.ts`), the bytes from
 * `nanomuse/cloud/stage/frame?seq=N`.
 */
import { createElement as h, useEffect, useState, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { Avatar } from './Avatar.tsx'
import { IconClose, IconExpand, IconHand } from './icons.tsx'
import { useLive, type Live, type LiveStage as Stage, type LiveStageAction } from './live.ts'
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
    const takeOver = (): void => {
      if (stopping || !stage.sessionId) return
      setStopping(true)
      void stop(stage.sessionId).catch(() => setStopping(false))
    }
    return h('div', { className: 'nm-stage-layer' },
      h(Frame, { t, live, stage, busy, stopping, onClose: () => setDismissed({ sessionId: stage.sessionId, steps: live.hands.steps }), onExpand: () => setBig(true), onTakeOver: takeOver }),
      big ? h(Sheet, { title: stage.device || t('stageThisComputer'), onClose: () => setBig(false), closeLabel: t('close'), wide: true },
        h('div', { className: 'nm-stage-big' }, h(Picture, { live, stage, busy, dim: false }))) : null)
  }
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
}

function Frame({ t, live, stage, busy, stopping, onClose, onExpand, onTakeOver }: FrameProps): ReactNode {
  const where = stage.source === 'device' ? stage.device : stage.title
  const caption = describeStep(t, stage.action, busy)
  return h('div', { className: `nm-stage${busy ? ' nm-busy' : ''}`, role: 'region', 'aria-label': t('stageLive') },
    h(Picture, { live, stage, busy, dim: true }),
    h('button', { type: 'button', className: 'nm-stage-btn nm-stage-close', 'aria-label': t('stageClose'), title: t('stageClose'), onClick: onClose }, h(IconClose, { size: 14 })),
    h('div', { className: 'nm-stage-tools' },
      h('button', { type: 'button', className: 'nm-stage-btn', 'aria-label': t('stageExpand'), title: t('stageExpand'), onClick: onExpand }, h(IconExpand, { size: 14 })),
      busy || stopping
        ? h('button', { type: 'button', className: 'nm-stage-pill', disabled: stopping, onClick: onTakeOver }, h(IconHand, { size: 14 }), stopping ? t('stageStopping') : t('stageTakeOver'))
        : null),
    h('div', { className: 'nm-stage-caption' },
      busy ? h('span', { className: 'nm-stage-dot', 'aria-hidden': true }) : null,
      h('span', { className: 'nm-stage-verb' }, caption),
      where ? h('span', { className: 'nm-stage-where' }, ` · ${where}`) : null))
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
