/**
 * What the Electron shell draws outside this window while the hands work: the glow
 * with the agent's face at the pointer, and the capsule with the question or the hold
 * (harness/desktop/src/main.ts, `registerOverlays`). This side reads the host's live
 * state and sends the shell only what it needs — fractions of the screen for the
 * pointer, words for the cards — and turns the capsule's answers into the same calls
 * the Live stage makes. Content protection on this window follows the hands too.
 */
import { call, type Translate } from './api.ts'
import { stillUrl } from './Avatar.tsx'
import { bridge } from './bridge.ts'
import { subscribeLive, type Live } from './live.ts'
import { describeStep } from './LiveStage.tsx'

const POINTED = new Set(['click', 'double_click', 'right_click', 'tap', 'drag', 'move', 'scroll', 'type'])

export function syncOverlay(t: Translate): () => void {
  const b = bridge()
  if (!b?.setOverlay) return () => undefined
  let lastKey = ''
  let protectedOn = false
  const push = (live: Live) => {
    const busy = live.hands.calls.length > 0
    const stage = live.stage
    const hold = live.holds[0]
    const action = stage.action
    const pointed = action && action.x >= 0 && action.y >= 0 && stage.width > 0 && stage.height > 0 && POINTED.has(action.kind)
    const hands = busy || hold
      ? {
          active: busy && stage.source === 'computer',
          held: Boolean(hold),
          x: pointed ? Math.min(1, Math.max(0, action.x / stage.width)) : -1,
          y: pointed ? Math.min(1, Math.max(0, action.y / stage.height)) : -1,
          kind: action?.kind ?? '',
          text: hold ? `${t('stageYourTurn')}${hold.reason ? ` — ${hold.reason}` : ''}` : stage.seq ? describeStep(t, action, busy) : '',
          face: new URL(stillUrl(live.profile, hold ? 'waiting' : 'working'), document.baseURI).href,
        }
      : null
    const zh = t('langTag') === 'zh'
    const cards = [
      ...live.holds.map((h) => ({ id: `hold:${h.id}`, kind: 'hold' as const, title: t('stageYourTurn'), text: h.reason || t('stageYourTurn'), actions: [{ id: 'done', label: t('stageDoneBtn'), tone: 'on' as const }] })),
      ...live.approvals.map((a) => ({ id: `ap:${a.id}`, kind: 'approval' as const, title: t('statusNeedsApproval'), text: (zh && a.summaryZh) || a.summary || a.purpose || a.toolName, actions: [{ id: 'allow', label: t('stageAllowOnce'), tone: 'on' as const }, { id: 'deny', label: t('stageDeny'), tone: 'no' as const }] })),
    ]
    const key = JSON.stringify({ hands, cards })
    if (key === lastKey) return
    lastKey = key
    b.setOverlay?.({ hands, cards })
    const wantProtected = Boolean(hands?.active)
    if (wantProtected !== protectedOn) {
      protectedOn = wantProtected
      void b.setContentProtection?.(wantProtected)
    }
  }
  const offLive = subscribeLive(push)
  const offAct = b.onOverlayAction?.((card, action) => {
    if (card.startsWith('hold:') && action === 'done') void call(`holds/${encodeURIComponent(card.slice(5))}/done`, {}).catch(() => undefined)
    else if (card.startsWith('ap:')) void call(`approvals/${encodeURIComponent(card.slice(3))}`, { approved: action === 'allow', scope: 'once', reason: '' }).catch(() => undefined)
  })
  return () => {
    offLive()
    offAct?.()
    b.setOverlay?.({ hands: null, cards: [] })
    if (protectedOn) void b.setContentProtection?.(false)
  }
}
