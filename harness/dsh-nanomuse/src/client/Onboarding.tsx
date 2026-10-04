/**
 * The first run, the way the Muse desktop opens — the whole window, not a
 * card: the agent's face and "Welcome", a Sign in pill; "Sign in or create an
 * account" with one field for a phone number or an e-mail; the six boxes of
 * the code (or the password, as the other way); a spinner while the account
 * and its look arrive; then the three permission pages of Muse's recording —
 * the computer (Accessibility and Screen Recording, each with an Allow pill
 * that turns into a check), the files (the working folder and what the agent
 * may touch), voice input (the microphone) — each with "Skip" under the card
 * that becomes "Continue" once everything on the page is allowed, a dots pager
 * and arrows in the corner; and at the end the main chat opened with the
 * agent's introduction in it. Registered as the `settings.onboarding` step with
 * the shipped id, so the coordinator shows ours in that turn; it completes
 * itself when a model can already answer (the account, a DeepSeek key, a
 * provider the person added) unless reopened on purpose.
 */
import { useModalLayer } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { call, type CloudStatus, type Translate } from './api.ts'
import { useCloudConfig } from './AccountPage.tsx'
import { Avatar } from './Avatar.tsx'
import { gatedPermissions, openLink, type PermissionKind } from './bridge.ts'
import { usePermissions, type Permissions } from './permissions.ts'
import { IconCheck, IconChevronLeft, IconChevronRight, IconDownload, IconFolder, IconHand, IconHome, IconMic, IconMonitor } from './icons.tsx'
import { useLive } from './live.ts'
import { setMainChatId } from './MuseChats.tsx'
import { nav, roomsCall } from './rooms.ts'

/** The owner share the onboarding coordinator passes to a step. */
export interface OnboardingOwnerProps {
  stepId: string
  explicit?: boolean | undefined
  complete: () => void
  openSection: (id: string) => void
  /** The workspace list, when the host passes its share. */
  useWorkspaces?: (<S>(selector: (snapshot: { items: readonly { workspaceId: string; path: string; title: string }[] }) => S) => S) | undefined
}

/** What the plugin lends the flow: the workspace actions the files page needs. */
export interface OnboardingActions {
  pickDirectory(): Promise<string | null>
  createWorkspace(path: string): Promise<{ workspaceId: string }>
  openWorkspace(workspaceId: string): Promise<void>
}

type View = 'loading' | 'welcome' | 'identifier' | 'code' | 'password' | 'wait' | 'slides' | 'starting'
type SlideId = 'computer' | 'files' | 'voice'

/** How long the end of the run may take to open the main chat before we stop waiting. */
const KICKOFF_MS = 12_000
const PRIVACY_URL = 'https://github.com/nano-muse/nanoMuse/blob/main/docs/privacy.md'
const TERMS_URL = 'https://github.com/nano-muse/nanoMuse/blob/main/docs/terms.md'
const HANDS_URL = 'https://github.com/nano-muse/nanoMuse/blob/main/docs/sentinel.md'

function Pill({ children, onClick, disabled, type = 'button', ghost = false, small = false, className = '' }: {
  children?: ReactNode
  onClick?: (() => void) | undefined
  disabled?: boolean | undefined
  type?: 'button' | 'submit'
  ghost?: boolean
  small?: boolean
  className?: string
}): ReactNode {
  return h('button', { type, disabled, onClick, className: `nm-pill${ghost ? ' nm-pill-ghost' : ''}${small ? ' nm-pill-sm' : ''} ${className}`.trim() }, children)
}

function Spinner(): ReactNode {
  return h('div', { className: 'nm-spinner', role: 'progressbar', 'aria-busy': true })
}

/** Six boxes over one real input, so paste, IME and autofill all land in the same place. */
function CodeBoxes({ value, onChange, disabled, label }: { value: string; onChange(next: string): void; disabled: boolean; label: string }): ReactNode {
  const input = useRef<HTMLInputElement>(null)
  // focus on mount, and again when a wrong code has been cleared (a disabled input loses focus)
  useEffect(() => { if (!disabled) input.current?.focus() }, [disabled])
  const digits = value.replace(/\D/g, '').slice(0, 6)
  return h('div', { className: 'nm-code', onClick: () => input.current?.focus() },
    h('input', {
      ref: input,
      className: 'nm-code-input',
      value: digits,
      inputMode: 'numeric',
      autoComplete: 'one-time-code',
      maxLength: 6,
      disabled,
      'aria-label': label,
      onChange: (e: FormEvent<HTMLInputElement>) => onChange(e.currentTarget.value.replace(/\D/g, '').slice(0, 6)),
    }),
    Array.from({ length: 6 }, (_, i) =>
      h('div', { key: i, className: `nm-code-box${i === Math.min(digits.length, 5) ? ' nm-code-caret' : ''}${digits[i] ? ' nm-code-filled' : ''}`, 'aria-hidden': true }, digits[i] ?? '')))
}

const ART_COMPUTER = h('svg', { viewBox: '0 0 240 150', width: 240, height: 150, className: 'nm-art', 'aria-hidden': true },
  h('rect', { x: 46, y: 10, width: 170, height: 104, rx: 12, className: 'nm-art-back' }),
  h('rect', { x: 30, y: 26, width: 170, height: 104, rx: 12, className: 'nm-art-mid' }),
  h('rect', { x: 14, y: 42, width: 170, height: 104, rx: 12, className: 'nm-art-front' }),
  h('circle', { cx: 30, cy: 56, r: 3.5, className: 'nm-art-dot' }), h('circle', { cx: 41, cy: 56, r: 3.5, className: 'nm-art-dot' }), h('circle', { cx: 52, cy: 56, r: 3.5, className: 'nm-art-dot' }),
  h('rect', { x: 30, y: 72, width: 90, height: 8, rx: 4, className: 'nm-art-line' }),
  h('rect', { x: 30, y: 88, width: 130, height: 8, rx: 4, className: 'nm-art-line' }),
  h('rect', { x: 30, y: 104, width: 70, height: 8, rx: 4, className: 'nm-art-line' }),
  h('path', { d: 'M150 100l10 26 5-10 10-5z', className: 'nm-art-cursor' }))

const ART_FILES = h('svg', { viewBox: '0 0 240 150', width: 240, height: 150, className: 'nm-art', 'aria-hidden': true },
  h('path', { d: 'M28 44a10 10 0 0 1 10-10h44l16 16h96a10 10 0 0 1 10 10v70a10 10 0 0 1-10 10H38a10 10 0 0 1-10-10z', className: 'nm-art-mid' }),
  h('rect', { x: 90, y: 20, width: 70, height: 88, rx: 8, className: 'nm-art-front' }),
  h('rect', { x: 102, y: 38, width: 46, height: 6, rx: 3, className: 'nm-art-line' }),
  h('rect', { x: 102, y: 52, width: 34, height: 6, rx: 3, className: 'nm-art-line' }),
  h('rect', { x: 102, y: 66, width: 42, height: 6, rx: 3, className: 'nm-art-line' }),
  h('path', { d: 'M28 70h184v60a10 10 0 0 1-10 10H38a10 10 0 0 1-10-10z', className: 'nm-art-back' }))

const ART_VOICE = h('svg', { viewBox: '0 0 240 150', width: 240, height: 150, className: 'nm-art', 'aria-hidden': true },
  h('rect', { x: 62, y: 14, width: 116, height: 122, rx: 12, className: 'nm-art-front' }),
  h('rect', { x: 78, y: 32, width: 60, height: 6, rx: 3, className: 'nm-art-line' }),
  h('rect', { x: 78, y: 46, width: 84, height: 6, rx: 3, className: 'nm-art-line' }),
  h('rect', { x: 78, y: 60, width: 48, height: 6, rx: 3, className: 'nm-art-line' }),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => h('rect', { key: i, x: 80 + i * 7, y: 102 - [6, 12, 20, 9, 16, 24, 14, 8, 18, 11, 6, 10][i]! / 2, width: 4, height: [6, 12, 20, 9, 16, 24, 14, 8, 18, 11, 6, 10][i], rx: 2, className: 'nm-art-accent' })),
  h('path', { d: 'M66 98l12 6-12 6z', className: 'nm-art-cursor' }))

export function makeOnboarding(t: Translate, actions: OnboardingActions) {
  return function NanomuseOnboarding(props: OnboardingOwnerProps): ReactNode {
    const { complete, openSection, explicit = false, useWorkspaces } = props
    const live = useLive()
    const [view, setView] = useState<View>('loading')
    const [status, setStatus] = useState<CloudStatus | undefined>()
    const [identifier, setIdentifier] = useState('')
    const [code, setCode] = useState('')
    const [password, setPassword] = useState('')
    // A friend's invite code (optional, with the six digits): both get credit on a first sign-in.
    const [invite, setInvite] = useState('')
    const [inviteOpen, setInviteOpen] = useState(false)
    // What the relay gives on sign-up, read before anyone signs in (relay 0.15; silent on older ones).
    const config = useCloudConfig()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | undefined>()
    const [resent, setResent] = useState(false)
    const [slide, setSlide] = useState(0)
    const [fading, setFading] = useState(false)
    const layer = useRef<HTMLDivElement>(null)
    useModalLayer(layer, view !== 'loading', () => undefined)
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
          else setView((current) => (current === 'loading' ? (next.signedIn ? 'slides' : 'welcome') : current))
        })
        .catch(() => {
          if (!alive) return
          // Without the host half there is nothing to offer: let the turn pass.
          owner.current.complete()
        })
      return () => { alive = false }
    }, [])

    const finish = useCallback(() => {
      setFading(true)
      window.setTimeout(() => owner.current.complete(), 260)
    }, [])
    // The end of the run: the main chat is opened with the introduction in it (once
    // per install; the host says so), then the overlay fades into it.
    const start = useCallback(() => {
      setView('starting')
      let done = false
      const settle = () => { if (!done) { done = true; finish() } }
      const timer = window.setTimeout(settle, KICKOFF_MS)
      roomsCall<{ sessionId?: string; introduced: boolean }>('kickoff', {})
        .then((result) => {
          if (result.sessionId) {
            setMainChatId(result.sessionId)
            nav.openSession(result.sessionId)
          }
        })
        .catch(() => undefined)
        .finally(() => { window.clearTimeout(timer); settle() })
    }, [finish])

    const run = async (work: () => Promise<void>) => {
      setBusy(true)
      setError(undefined)
      try {
        await work()
      } catch (err: unknown) {
        setError(t('failed', { message: (err as Error).message }))
      } finally {
        setBusy(false)
      }
    }
    const sendCode = (event?: FormEvent) => {
      event?.preventDefault()
      void run(async () => {
        await call('code', { identifier: identifier.trim() })
        setCode('')
        setView('code')
      })
    }
    const resend = () => {
      void run(async () => {
        await call('code', { identifier: identifier.trim() })
        setResent(true)
        window.setTimeout(() => setResent(false), 4000)
      })
    }
    const signedIn = (next: CloudStatus) => {
      setStatus(next)
      setView('wait')
      // The spinner, like Muse's, while the look and the devices arrive.
      window.setTimeout(() => setView('slides'), 900)
    }
    const verify = (value: string) => {
      if (busy || value.length !== 6) return
      void run(async () => {
        try {
          const next = await call<CloudStatus>('verify', { identifier: identifier.trim(), code: value, invite: invite.trim().toUpperCase() })
          setCode('')
          signedIn(next)
        } catch (err: unknown) {
          // a wrong code leaves empty boxes, not six digits to delete one by one
          setCode('')
          throw err
        }
      })
    }
    const login = (event: FormEvent) => {
      event.preventDefault()
      void run(async () => {
        const next = await call<CloudStatus>('login', { identifier: identifier.trim(), password })
        setPassword('')
        signedIn(next)
      })
    }

    if (view === 'loading') return null

    const profile = live.streaming ? live.profile : status?.profile
    const name = profile?.name || 'nanoMuse'
    const slides: SlideId[] = ['computer', 'files', 'voice']

    let body: ReactNode
    if (view === 'welcome') {
      body = h('div', { className: 'nm-ob-center' },
        h(Avatar, { size: 112, profile, mood: 'idle' }),
        h('h1', { className: 'nm-ob-title' }, t('obWelcomeTitle')),
        h('p', { className: 'nm-ob-fine' }, config.allowance_cny ? t('obFreeAmount', { allowance: config.allowance_cny }) : t('obFree')),
        h(Pill, { onClick: () => setView('identifier'), className: 'nm-ob-cta' }, t('obSignIn')),
        h('div', { className: 'nm-ob-links' },
          h('button', { type: 'button', className: 'nm-ob-link', onClick: () => { openSection('models'); finish() } }, t('obOwnKey')),
          h('span', { className: 'nm-ob-sep', 'aria-hidden': true }, '·'),
          h('button', { type: 'button', className: 'nm-ob-link', onClick: () => setView('slides') }, t('obLater'))))
    } else if (view === 'identifier') {
      body = h('form', { className: 'nm-ob-center nm-ob-form', onSubmit: sendCode },
        h('h1', { className: 'nm-ob-title' }, t('obSignInTitle')),
        h('input', { className: 'nm-field', value: identifier, placeholder: t('obIdentifier'), autoComplete: 'username', autoFocus: true, 'aria-label': t('obIdentifier'), onChange: (e: FormEvent<HTMLInputElement>) => setIdentifier(e.currentTarget.value) }),
        h('p', { className: 'nm-ob-fine' },
          t('obTermsLead'), ' ',
          h('a', { href: TERMS_URL, onClick: (e: Event) => { e.preventDefault(); openLink(TERMS_URL) } }, t('obTerms')), t('obTermsAnd'),
          h('a', { href: PRIVACY_URL, onClick: (e: Event) => { e.preventDefault(); openLink(PRIVACY_URL) } }, t('obPrivacy')), t('obTermsEnd')),
        error ? h('div', { className: 'nm-ob-error', role: 'alert' }, error) : null,
        h(Pill, { type: 'submit', disabled: busy || identifier.trim().length < 3, className: 'nm-ob-wide' }, busy ? t('sending') : t('obContinue')),
        h('button', { type: 'button', className: 'nm-ob-link', onClick: () => { setError(undefined); setView('welcome') } }, t('obBack')))
    } else if (view === 'code') {
      body = h('div', { className: 'nm-ob-center nm-ob-form' },
        h('h1', { className: 'nm-ob-title' }, t('obCodeTitle')),
        h('p', { className: 'nm-ob-fine' },
          t('obCodeSent', { identifier: identifier.trim() }), ' ',
          h('button', { type: 'button', className: 'nm-ob-link nm-inline', disabled: busy, onClick: resend }, resent ? t('obResent') : t('obResend'))),
        h(CodeBoxes, { value: code, disabled: busy, label: t('code'), onChange: (next) => { setCode(next); if (next.length === 6) verify(next) } }),
        inviteOpen
          ? h('input', { className: 'nm-field', value: invite, placeholder: t('obInviteCode'), autoComplete: 'off', autoCapitalize: 'characters', 'aria-label': t('obInviteCode'), onChange: (e: FormEvent<HTMLInputElement>) => setInvite(e.currentTarget.value.replace(/[^0-9a-zA-Z-]/g, '').slice(0, 16)) })
          : h('button', { type: 'button', className: 'nm-ob-link nm-inline', disabled: busy, onClick: () => setInviteOpen(true) }, t('obHaveInvite')),
        inviteOpen ? h('p', { className: 'nm-ob-fine' }, t('obInviteHint', { bonus: config.invitee_bonus_cny ?? 5 })) : null,
        error ? h('div', { className: 'nm-ob-error', role: 'alert' }, error) : null,
        h(Pill, { disabled: busy || code.length !== 6, onClick: () => verify(code), className: 'nm-ob-wide' }, busy ? t('signingIn') : t('obNext')),
        h('div', { className: 'nm-ob-links' },
          h('button', { type: 'button', className: 'nm-ob-link', onClick: () => { setError(undefined); setView('password') } }, t('obOtherWay')),
          h('span', { className: 'nm-ob-sep', 'aria-hidden': true }, '·'),
          h('button', { type: 'button', className: 'nm-ob-link', onClick: () => { setError(undefined); setCode(''); setView('identifier') } }, t('obChangeIdentifier'))))
    } else if (view === 'password') {
      body = h('form', { className: 'nm-ob-center nm-ob-form', onSubmit: login },
        h('h1', { className: 'nm-ob-title' }, t('obPasswordTitle')),
        h('p', { className: 'nm-ob-fine' }, identifier.trim()),
        h('input', { className: 'nm-field', type: 'password', value: password, placeholder: t('obPassword'), autoComplete: 'current-password', autoFocus: true, 'aria-label': t('obPassword'), onChange: (e: FormEvent<HTMLInputElement>) => setPassword(e.currentTarget.value) }),
        error ? h('div', { className: 'nm-ob-error', role: 'alert' }, error) : null,
        h(Pill, { type: 'submit', disabled: busy || password.length === 0, className: 'nm-ob-wide' }, busy ? t('signingIn') : t('obSignIn')),
        h('div', { className: 'nm-ob-links' },
          h('button', { type: 'button', className: 'nm-ob-link', onClick: () => { setError(undefined); setView('code') } }, t('obUseCode')),
          h('span', { className: 'nm-ob-sep', 'aria-hidden': true }, '·'),
          h('button', { type: 'button', className: 'nm-ob-link', onClick: () => { setError(undefined); setPassword(''); setView('identifier') } }, t('obChangeIdentifier'))))
    } else if (view === 'wait' || view === 'starting') {
      body = h('div', { className: 'nm-ob-center' }, h(Spinner))
    } else {
      const index = Math.min(slide, slides.length - 1)
      const current = slides[index]!
      const last = index === slides.length - 1
      const next = () => { if (last) start(); else setSlide(index + 1) }
      const props: SlideProps = { t, name, onNext: next, dots: h(Dots, { count: slides.length, index }) }
      body = h('div', { className: 'nm-ob-slide-wrap' },
        h('div', { className: 'nm-ob-pager' },
          h('button', { type: 'button', className: 'nm-ob-pager-btn', 'aria-label': t('obPrev'), disabled: index === 0, onClick: () => setSlide(index - 1) }, h(IconChevronLeft, { size: 16 })),
          h('button', { type: 'button', className: 'nm-ob-pager-btn', 'aria-label': t('obNextSlide'), disabled: last, onClick: () => setSlide(index + 1) }, h(IconChevronRight, { size: 16 }))),
        current === 'computer'
          ? h(ComputerSlide, props)
          : current === 'files'
            ? h(FilesSlide, { ...props, actions, useWorkspaces })
            : h(VoiceSlide, props))
    }

    return createPortal(
      h('div', { ref: layer, tabIndex: -1, className: `nm-ob${fading ? ' nm-ob-fading' : ''}`, role: 'dialog', 'aria-modal': true, 'aria-label': t('welcomeTitle'), 'data-shortcut-modal': 'onboarding' },
        h('div', { className: 'nm-ob-drag', 'data-window-drag': true }),
        body),
      document.body)
  }
}

interface SlideProps {
  t: Translate
  name: string
  /** Moves on: the next page, or the end of the run on the last one. */
  onNext(): void
  dots: ReactNode
}

function Dots({ count, index }: { count: number; index: number }): ReactNode {
  return h('div', { className: 'nm-ob-dots', 'aria-hidden': true },
    Array.from({ length: count }, (_, i) => h('span', { key: i, className: `nm-ob-dot${i === index ? ' nm-on' : ''}` })))
}

/**
 * One page as the recording has it: the picture, the question, a line under it,
 * the card of rows, fine print, then "Skip" in plain text — or the blue
 * "Continue" once everything on the page is allowed — and the dots.
 */
function SlideFrame({ t, art, title, text, children, fine, onNext, dots, done, above }: Omit<SlideProps, 'name'> & { art: ReactNode; title: string; text: string; children?: ReactNode; fine: ReactNode; done: boolean; above?: ReactNode }): ReactNode {
  return h('div', { className: 'nm-ob-center nm-ob-slide' },
    art,
    h('h1', { className: 'nm-ob-title nm-ob-title-sm' }, title),
    h('p', { className: 'nm-ob-sub' }, text),
    above ?? null,
    h('div', { className: 'nm-ob-card' }, children),
    h('p', { className: 'nm-ob-fine' }, fine),
    done
      ? h(Pill, { onClick: onNext, className: 'nm-ob-wide' }, t('obContinue'))
      : h('button', { type: 'button', className: 'nm-ob-skip', onClick: onNext }, t('obSkip')),
    dots)
}

function PermissionRow({ t, kind, icon, title, sub, perms }: { t: Translate; kind: PermissionKind; icon: ReactNode; title: string; sub: string; perms: Permissions }): ReactNode {
  const granted = perms.granted(kind)
  return h('div', { className: 'nm-ob-row' },
    h('span', { className: 'nm-ob-row-icon' }, icon),
    h('div', { className: 'nm-ob-row-main' },
      h('div', { className: 'nm-ob-row-title' }, title),
      h('div', { className: 'nm-ob-row-sub' }, sub)),
    granted
      ? h('span', { className: 'nm-ob-granted', 'aria-label': t('obAllowed') }, h(IconCheck, { size: 16 }))
      : perms.asked(kind) && gatedPermissions()
        // a second press cannot bring the system's dialog back: the pane is where the switch is
        ? h(Pill, { small: true, onClick: () => perms.settings(kind) }, t('obOpenSettings'))
        : h(Pill, { small: true, onClick: () => perms.allow(kind) }, t('obAllow')))
}

/** macOS applies Screen Recording only to processes started after the grant: the notice and the restart. */
export function RelaunchNotice({ t, perms }: { t: Translate; perms: Permissions }): ReactNode {
  if (!perms.needsRelaunch) return null
  return h('div', { className: 'nm-ob-relaunch', role: 'status' },
    h('span', null, t('obRelaunch')),
    h(Pill, { small: true, onClick: () => perms.relaunch() }, t('obRelaunchNow')))
}

/** macOS: Accessibility for clicking and typing, Screen Recording for the screenshots the hands look at. Elsewhere nothing is asked and both rows are already checks. */
function ComputerSlide(props: SlideProps): ReactNode {
  const { t, name } = props
  const perms = usePermissions(['accessibility', 'screen'])
  return h(SlideFrame, {
    ...props,
    art: ART_COMPUTER,
    title: t('obPermTitle', { name }),
    text: t('obPermSub', { name }),
    done: perms.granted('accessibility') && perms.granted('screen'),
    fine: h(Fragment, null, gatedPermissions() ? t('obPermFine') : t('obPermFineOpen', { name }), ' ', h('a', { href: HANDS_URL, onClick: (e: Event) => { e.preventDefault(); openLink(HANDS_URL) } }, t('obLearnMore'))),
  },
    h(PermissionRow, { t, kind: 'accessibility', icon: h(IconHand, { size: 18 }), title: t('obAccessibility'), sub: t('obAccessibilitySub', { name }), perms }),
    h(PermissionRow, { t, kind: 'screen', icon: h(IconMonitor, { size: 18 }), title: t('obScreen'), sub: t('obScreenSub', { name }), perms }),
    h(RelaunchNotice, { t, perms }))
}

/** The working folder, and the places the agent may read and write under the default permission preset. */
function FilesSlide(props: SlideProps & { actions: OnboardingActions; useWorkspaces: OnboardingOwnerProps['useWorkspaces'] }): ReactNode {
  const { t, name, actions, useWorkspaces } = props
  const first = typeof useWorkspaces === 'function' ? useWorkspaces((s) => s.items[0]) : undefined
  const [chosen, setChosen] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const path = chosen ?? first?.path
  const choose = () => {
    if (busy) return
    setBusy(true)
    void actions.pickDirectory()
      .then(async (picked) => {
        if (!picked) return
        const workspace = await actions.createWorkspace(picked)
        await actions.openWorkspace(workspace.workspaceId)
        setChosen(picked)
      })
      .catch(() => undefined)
      .finally(() => setBusy(false))
  }
  const place = (icon: ReactNode, title: string, sub: string, right: string) => h('div', { className: 'nm-ob-row' },
    h('span', { className: 'nm-ob-row-icon' }, icon),
    h('div', { className: 'nm-ob-row-main' },
      h('div', { className: 'nm-ob-row-title' }, title),
      h('div', { className: 'nm-ob-row-sub' }, sub)),
    h('span', { className: 'nm-ob-mode' }, right))
  return h(SlideFrame, {
    ...props,
    art: ART_FILES,
    title: t('obFilesTitle', { name }),
    text: t('obFilesSub', { name }),
    done: true,
    fine: t('obFilesFine'),
    above: h(Fragment, null,
      h('div', { className: 'nm-ob-folder' },
        h(IconFolder, { size: 16 }),
        h('span', { className: 'nm-ob-folder-path', title: path }, path ?? t('obFolderNone')),
        h('button', { type: 'button', className: 'nm-ob-link nm-inline', disabled: busy, onClick: choose }, path ? t('obChange') : t('obChoose'))),
      h('div', { className: 'nm-ob-card-label' }, t('obPlaces', { name }))),
  },
    place(h(IconFolder, { size: 18 }), t('obFolder'), t('obFolderSub', { name }), t('obReadWrite')),
    place(h(IconHome, { size: 18 }), t('obHome'), t('obHomeSub'), t('obReadAsk')),
    place(h(IconDownload, { size: 18 }), t('obDownloads'), t('obDownloadsSub'), t('obReadAsk')))
}

/** Voice input: the microphone, asked for here so the composer's mic works at once. */
function VoiceSlide(props: SlideProps): ReactNode {
  const { t, name } = props
  const perms = usePermissions(['microphone'])
  return h(SlideFrame, {
    ...props,
    art: ART_VOICE,
    title: t('obVoiceTitle'),
    text: t('obVoiceSub'),
    done: perms.granted('microphone'),
    fine: t('obVoiceFine'),
  },
    h(PermissionRow, { t, kind: 'microphone', icon: h(IconMic, { size: 18 }), title: t('obMic'), sub: t('obMicSub', { name }), perms }))
}
