/**
 * The first run, the way the Muse desktop opens: a welcome card with the
 * agent's face, sign in with a phone number or an e-mail (free) or use your
 * own key, then three short cards — Hands, the workspace, the other devices —
 * each with one thing to allow or look at, and a Start. Registered as the
 * `settings.onboarding` step with the shipped id, so the coordinator shows
 * ours in that turn; it completes itself when a model can already answer
 * (the account, a DeepSeek key, a provider the person added) unless reopened
 * on purpose.
 */
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useEffect, useRef, useState, type ReactNode } from 'react'
import { call, errorStyle, type CloudStatus, type Translate } from './api.ts'
import { Avatar } from './Avatar.tsx'
import { IconCheck, IconChevronLeft, IconChevronRight, IconDevices, IconFolder, IconHand } from './icons.tsx'
import { useLive } from './live.ts'
import { DEVICES_PANEL } from './panels.ts'
import { SignIn } from './SignIn.tsx'

/** The owner share the onboarding coordinator passes to a step. */
export interface OnboardingOwnerProps {
  stepId: string
  explicit?: boolean | undefined
  complete: () => void
  openSection: (id: string) => void
}

type View = 'loading' | 'welcome' | 'signIn' | 'cards' | 'done'

interface Card {
  id: 'hands' | 'workspace' | 'reach'
  icon: ReactNode
  title: string
  text: string
  action: string
  /** What the action does besides acknowledging; undefined when it only acknowledges. */
  run?: () => void
}

export function makeOnboarding(t: Translate) {
  return function NanomuseOnboarding(props: OnboardingOwnerProps): ReactNode {
    const { complete, openSection, explicit = false } = props
    const live = useLive()
    const [view, setView] = useState<View>('loading')
    const [status, setStatus] = useState<CloudStatus | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [card, setCard] = useState(0)
    const [acknowledged, setAcknowledged] = useState<ReadonlySet<Card['id']>>(() => new Set())
    // The coordinator hands over a fresh `complete` closure on every render; the
    // decision below is made once, when the step mounts, so a re-render while the
    // person is typing a code does not throw them back to the first view.
    const owner = useRef({ complete, explicit })
    owner.current = { complete, explicit }

    useEffect(() => {
      let alive = true
      call<CloudStatus>('status')
        .then((next) => {
          if (!alive) return
          setStatus(next)
          if (next.ready && !owner.current.explicit) owner.current.complete()
          else setView((current) => (current === 'loading' ? (next.signedIn ? 'cards' : 'welcome') : current))
        })
        .catch((err: unknown) => {
          if (!alive) return
          // Without the host half there is nothing to offer: let the turn pass.
          setError(String((err as Error).message))
          owner.current.complete()
        })
      return () => { alive = false }
    }, [])

    if (view === 'loading') return null

    const profile = live.streaming ? live.profile : status?.profile
    const name = profile?.name || 'nanoMuse'

    const cards: Card[] = [
      { id: 'hands', icon: h(IconHand, { size: 44 }), title: t('cardHandsTitle'), text: t('cardHandsText', { name }), action: t('cardHandsAction') },
      { id: 'workspace', icon: h(IconFolder, { size: 44 }), title: t('cardWorkspaceTitle'), text: t('cardWorkspaceText', { name }), action: t('cardWorkspaceAction') },
      { id: 'reach', icon: h(IconDevices, { size: 44 }), title: t('cardReachTitle'), text: t('cardReachText'), action: t('cardReachAction'), run: () => { openSection(DEVICES_PANEL); complete() } },
    ]

    let body: ReactNode
    if (view === 'signIn') {
      body = h('div', { className: 'nm-welcome' },
        h(Avatar, { size: 72, profile, mood: 'idle' }),
        h('h2', { className: 'nm-welcome-title', style: { fontSize: 20 } }, t('signInTitle')),
        h('p', { className: 'nm-welcome-sub' }, t('identifierHint')),
        h('div', { style: { width: '100%', textAlign: 'left' } },
          h(SignIn, {
            t,
            wide: true,
            onSignedIn: (next) => { setStatus(next); setView('cards') },
            footer: h(Button, { variant: 'ghost', size: 'md', type: 'button', style: { width: '100%' }, onClick: () => setView('welcome') }, t('welcomeBack')),
          })))
    } else if (view === 'cards') {
      const current = cards[Math.min(card, cards.length - 1)]!
      const done = acknowledged.has(current.id)
      const last = card === cards.length - 1
      const acknowledge = () => {
        setAcknowledged((previous) => new Set([...previous, current.id]))
        if (current.run) current.run()
        else if (last) setView('done')
        else setCard(card + 1)
      }
      body = h('div', { className: 'nm-perm' },
        h('div', { className: 'nm-perm-art' }, current.icon),
        h('h2', { className: 'nm-perm-title' }, current.title),
        h('p', { className: 'nm-perm-text' }, current.text),
        h('div', { className: 'nm-perm-state' }, done ? [h(IconCheck, { key: 'i', size: 16 }), ' ', t('cardDone')] : null),
        h(Button, { variant: 'primary', size: 'md', style: { width: '100%' }, onClick: acknowledge }, current.action),
        h('div', { className: 'nm-perm-nav' },
          h('button', { type: 'button', className: 'nm-icon-btn', 'aria-label': t('cardPrev'), disabled: card === 0, onClick: () => setCard(card - 1) }, h(IconChevronLeft, { size: 18 })),
          h('div', { className: 'nm-dots', role: 'tablist' }, cards.map((c, i) =>
            h('button', { key: c.id, type: 'button', role: 'tab', 'aria-selected': i === card, 'aria-label': c.title, className: `nm-dot${i === card ? ' nm-active' : ''}`, onClick: () => setCard(i) }))),
          h('button', { type: 'button', className: 'nm-icon-btn', 'aria-label': t('cardNext'), disabled: last, onClick: () => setCard(card + 1) }, h(IconChevronRight, { size: 18 }))),
        h('button', { type: 'button', className: 'nm-link-btn', onClick: () => setView('done') }, t('cardSkip')))
    } else if (view === 'done') {
      body = h('div', { className: 'nm-welcome' },
        h(Avatar, { size: 96, profile, mood: 'happy' }),
        h('h2', { className: 'nm-welcome-title' }, t('doneTitle', { name })),
        h('p', { className: 'nm-welcome-sub' }, status?.signedIn ? t('welcomeSignedIn', { hint: status.account?.hint ?? live.cloud.hint }) : t('doneNoAccount')),
        h('p', { className: 'nm-welcome-sub' }, t('welcomeReady', { name })),
        h('div', { className: 'nm-welcome-actions' },
          h(Button, { variant: 'primary', size: 'md', style: { width: '100%' }, onClick: complete }, t('welcomeStart'))))
    } else {
      body = h('div', { className: 'nm-welcome' },
        h(Avatar, { size: 96, profile, mood: 'idle' }),
        h('h2', { className: 'nm-welcome-title' }, t('welcomeHeadline')),
        h('p', { className: 'nm-welcome-sub' }, t('slogan')),
        h('p', { className: 'nm-welcome-sub' }, t('welcomeBlurb')),
        error ? h('div', { style: errorStyle }, error) : null,
        h('div', { className: 'nm-welcome-actions' },
          h(Button, { variant: 'primary', size: 'md', style: { width: '100%' }, onClick: () => setView('signIn') }, t('welcomeSignIn')),
          h(Button, { variant: 'outline', size: 'md', style: { width: '100%' }, onClick: () => { openSection('models'); complete() } }, t('welcomeOwnKey')),
          h(Button, { variant: 'ghost', size: 'md', style: { width: '100%' }, onClick: () => setView('cards') }, t('welcomeLater'))),
        h('div', { className: 'nm-welcome-foot' }, t('welcomeFoot')))
    }

    return h(Modal, { open: true, headless: true, className: 'nm-onboarding-card', title: t('welcomeTitle'), onClose: () => undefined, backdropBlur: true }, body)
  }
}
