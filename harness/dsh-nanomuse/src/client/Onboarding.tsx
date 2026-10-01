/**
 * The first run, the way the Android app's `FirstRunSetup` does it: meet the
 * agent, then sign in with a phone number or an e-mail (free) or use your own
 * key — in place of the harness's DeepSeek-key dialog. Registered as the
 * `settings.onboarding` step with the shipped id, so the coordinator shows ours
 * in that turn; it completes itself when a model can already answer (the
 * account, a DeepSeek key, a provider the person added) unless reopened on
 * purpose.
 */
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useEffect, useRef, useState, type ReactNode } from 'react'
import { call, errorStyle, muted, type CloudStatus, type Translate } from './api.ts'
import { Avatar } from './Avatar.tsx'
import { useLive } from './live.ts'
import { SignIn } from './SignIn.tsx'

/** The owner share the onboarding coordinator passes to a step. */
export interface OnboardingOwnerProps {
  stepId: string
  explicit?: boolean
  complete: () => void
  openSection: (id: string) => void
}

type View = 'loading' | 'meet' | 'signIn' | 'done'

const panel: Record<string, string | number> = { display: 'flex', flexDirection: 'column', gap: 16, padding: 8, maxWidth: 420 }
const lines: Record<string, string | number> = { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary, #6b6b6b)' }
const actions: Record<string, string | number> = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }

export function makeOnboarding(t: Translate) {
  return function NanomuseOnboarding(props: OnboardingOwnerProps): ReactNode {
    const { complete, openSection, explicit = false } = props
    const live = useLive()
    const [view, setView] = useState<View>('loading')
    const [status, setStatus] = useState<CloudStatus | undefined>()
    const [error, setError] = useState<string | undefined>()
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
          else setView((current) => (current === 'loading' ? (next.signedIn ? 'done' : 'meet') : current))
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
    const face = (mood: 'idle' | 'happy') => h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 } },
      h(Avatar, { size: 96, profile, mood }),
      h('div', { style: { fontSize: 20, fontWeight: 600 } }, view === 'done' ? (profile?.name ?? 'nanoMuse') : 'nanoMuse'),
      h('div', { style: { ...muted, textAlign: 'center', fontSize: 14 } }, t('slogan')))

    let body: ReactNode
    if (view === 'signIn') {
      body = h('div', { style: panel },
        face('idle'),
        h(SignIn, {
          t,
          wide: true,
          onSignedIn: (next) => { setStatus(next); setView('done') },
          footer: h(Button, { variant: 'ghost', size: 'md', type: 'button', style: { width: '100%' }, onClick: () => setView('meet') }, t('welcomeBack')),
        }))
    } else if (view === 'done') {
      body = h('div', { style: panel },
        face('happy'),
        h('div', { style: lines },
          h('div', null, t('welcomeSignedIn', { hint: status?.account?.hint ?? live.cloud.hint })),
          h('div', null, t('welcomeReady', { name: profile?.name ?? 'nanoMuse' }))),
        h('div', { style: actions },
          h(Button, { variant: 'primary', size: 'md', style: { width: '100%' }, onClick: complete }, t('welcomeStart'))))
    } else {
      body = h('div', { style: panel },
        face('idle'),
        h('div', { style: lines },
          h('div', null, t('welcomeHands')),
          h('div', null, t('welcomeReach')),
          h('div', null, t('welcomeAccount'))),
        error ? h('div', { style: errorStyle }, error) : null,
        h('div', { style: actions },
          h(Button, { variant: 'primary', size: 'md', style: { width: '100%' }, onClick: () => setView('signIn') }, t('welcomeSignIn')),
          h(Button, { variant: 'outline', size: 'md', style: { width: '100%' }, onClick: () => { openSection('models'); complete() } }, t('welcomeOwnKey')),
          h(Button, { variant: 'ghost', size: 'md', style: { width: '100%' }, onClick: complete }, t('welcomeLater'))))
    }

    return h(Modal, { open: true, headless: true, title: t('welcomeTitle'), onClose: () => undefined, backdropBlur: true }, body)
  }
}
