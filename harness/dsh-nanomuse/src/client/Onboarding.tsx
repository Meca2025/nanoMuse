/**
 * The first run, the way the Muse desktop opens — the whole window, not a
 * card: the agent's face and "Welcome", a Sign in pill; "Sign in or create an
 * account" with one field for a phone number or an e-mail; the six boxes of
 * the code (or the password, as the other way); a spinner while the account
 * and its look arrive; then the permissions carousel, one page per thing to
 * allow — the computer (Accessibility and Screen Recording on macOS, each with
 * its Allow pill that turns into a check), the files (the working folder), the
 * other devices — with a pager in the corner and Skip under every page; and the
 * agent ready. Registered as the `settings.onboarding` step with the shipped
 * id, so the coordinator shows ours in that turn; it completes itself when a
 * model can already answer (the account, a DeepSeek key, a provider the person
 * added) unless reopened on purpose.
 */
import { useModalLayer } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { call, type CloudStatus, type Translate } from './api.ts'
import { Avatar } from './Avatar.tsx'
import { bridge, gatedPermissions, openLink, type PermissionKind, type PermissionState } from './bridge.ts'
import { IconCheck, IconChevronLeft, IconChevronRight, IconDevices, IconFolder, IconLaptop, IconPhone } from './icons.tsx'
import { useLive } from './live.ts'

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

type View = 'loading' | 'welcome' | 'identifier' | 'code' | 'password' | 'wait' | 'slides' | 'ready'
type SlideId = 'computer' | 'files' | 'devices'

const READY_MS = 1400
const PRIVACY_URL = 'https://github.com/nano-muse/nanoMuse/blob/main/docs/privacy.md'
const TERMS_URL = 'https://github.com/nano-muse/nanoMuse/blob/main/docs/terms.md'
const PHONE_URL = 'https://nanomuse.cn/'

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
  useEffect(() => { input.current?.focus() }, [])
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

const ART_DEVICES = h('svg', { viewBox: '0 0 240 150', width: 240, height: 150, className: 'nm-art', 'aria-hidden': true },
  h('rect', { x: 20, y: 30, width: 136, height: 86, rx: 10, className: 'nm-art-mid' }),
  h('rect', { x: 8, y: 116, width: 160, height: 10, rx: 5, className: 'nm-art-front' }),
  h('rect', { x: 170, y: 46, width: 54, height: 94, rx: 10, className: 'nm-art-front' }),
  h('rect', { x: 189, y: 56, width: 16, height: 4, rx: 2, className: 'nm-art-line' }),
  h('circle', { cx: 88, cy: 73, r: 16, className: 'nm-art-accent' }),
  h('circle', { cx: 197, cy: 92, r: 10, className: 'nm-art-accent' }),
  h('path', { d: 'M104 73h66', className: 'nm-art-link' }))

export function makeOnboarding(t: Translate, actions: OnboardingActions) {
  return function NanomuseOnboarding(props: OnboardingOwnerProps): ReactNode {
    const { complete, openSection, explicit = false, useWorkspaces } = props
    const live = useLive()
    const [view, setView] = useState<View>('loading')
    const [status, setStatus] = useState<CloudStatus | undefined>()
    const [identifier, setIdentifier] = useState('')
    const [code, setCode] = useState('')
    const [password, setPassword] = useState('')
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
    useEffect(() => {
      if (view !== 'ready') return undefined
      const timer = window.setTimeout(finish, READY_MS)
      return () => window.clearTimeout(timer)
    }, [view, finish])

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
        const next = await call<CloudStatus>('verify', { identifier: identifier.trim(), code: value })
        setCode('')
        signedIn(next)
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
    const slides: SlideId[] = [...(gatedPermissions() ? ['computer' as const] : []), 'files', 'devices']

    let body: ReactNode
    if (view === 'welcome') {
      body = h('div', { className: 'nm-ob-center' },
        h(Avatar, { size: 112, profile, mood: 'idle' }),
        h('h1', { className: 'nm-ob-title' }, t('obWelcomeTitle')),
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
        error ? h('div', { className: 'nm-ob-error', role: 'alert' }, error) : null,
        h(Pill, { disabled: busy || code.length !== 6, onClick: () => verify(code), className: 'nm-ob-wide' }, busy ? t('signingIn') : t('obNext')),
        h('button', { type: 'button', className: 'nm-ob-link', onClick: () => { setError(undefined); setView('password') } }, t('obOtherWay')))
    } else if (view === 'password') {
      body = h('form', { className: 'nm-ob-center nm-ob-form', onSubmit: login },
        h('h1', { className: 'nm-ob-title' }, t('obPasswordTitle')),
        h('p', { className: 'nm-ob-fine' }, identifier.trim()),
        h('input', { className: 'nm-field', type: 'password', value: password, placeholder: t('obPassword'), autoComplete: 'current-password', autoFocus: true, 'aria-label': t('obPassword'), onChange: (e: FormEvent<HTMLInputElement>) => setPassword(e.currentTarget.value) }),
        error ? h('div', { className: 'nm-ob-error', role: 'alert' }, error) : null,
        h(Pill, { type: 'submit', disabled: busy || password.length === 0, className: 'nm-ob-wide' }, busy ? t('signingIn') : t('obSignIn')),
        h('button', { type: 'button', className: 'nm-ob-link', onClick: () => { setError(undefined); setView('code') } }, t('obUseCode')))
    } else if (view === 'wait') {
      body = h('div', { className: 'nm-ob-center' }, h(Spinner))
    } else if (view === 'ready') {
      body = h('div', { className: 'nm-ob-center' },
        h(Avatar, { size: 112, profile, mood: 'happy' }),
        h('h1', { className: 'nm-ob-title' }, t('obReady', { name })))
    } else {
      const index = Math.min(slide, slides.length - 1)
      const current = slides[index]!
      const last = index === slides.length - 1
      const next = () => { if (last) setView('ready'); else setSlide(index + 1) }
      body = h('div', { className: 'nm-ob-slide-wrap' },
        h('div', { className: 'nm-ob-pager' },
          h('button', { type: 'button', className: 'nm-ob-pager-btn', 'aria-label': t('obPrev'), disabled: index === 0, onClick: () => setSlide(index - 1) }, h(IconChevronLeft, { size: 16 })),
          h('button', { type: 'button', className: 'nm-ob-pager-btn', 'aria-label': t('obNextSlide'), disabled: last, onClick: () => setSlide(index + 1) }, h(IconChevronRight, { size: 16 }))),
        current === 'computer'
          ? h(ComputerSlide, { t, name, onNext: next, onSkip: () => setView('ready') })
          : current === 'files'
            ? h(FilesSlide, { t, name, actions, useWorkspaces, onNext: next, onSkip: () => setView('ready') })
            : h(DevicesSlide, { t, name, live, onNext: next, onSkip: () => setView('ready') }))
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
  onNext(): void
  onSkip(): void
}

function SlideFrame({ t, art, title, text, children, fine, onNext, onSkip, nextLabel }: SlideProps & { art: ReactNode; title: string; text: string; children?: ReactNode; fine: string; nextLabel?: string }): ReactNode {
  return h('div', { className: 'nm-ob-center nm-ob-slide' },
    art,
    h('h1', { className: 'nm-ob-title nm-ob-title-sm' }, title),
    h('p', { className: 'nm-ob-sub' }, text),
    h('div', { className: 'nm-ob-card' }, children),
    h('p', { className: 'nm-ob-fine' }, fine),
    h(Pill, { onClick: onNext, className: 'nm-ob-wide' }, nextLabel ?? t('obContinue')),
    h('button', { type: 'button', className: 'nm-ob-link', onClick: onSkip }, t('obSkip')))
}

function PermissionRow({ t, kind, title, sub, state, onAllow }: { t: Translate; kind: PermissionKind; title: string; sub: string; state: PermissionState | undefined; onAllow(kind: PermissionKind): void }): ReactNode {
  const granted = state === 'granted' || state === 'not-needed'
  return h('div', { className: 'nm-ob-row' },
    h('div', { className: 'nm-ob-row-main' },
      h('div', { className: 'nm-ob-row-title' }, title),
      h('div', { className: 'nm-ob-row-sub' }, sub)),
    granted
      ? h('span', { className: 'nm-ob-granted', 'aria-label': t('obAllowed') }, h(IconCheck, { size: 16 }))
      : h(Pill, { small: true, onClick: () => onAllow(kind) }, t('obAllow')))
}

/** macOS: Accessibility for clicking and typing, Screen Recording for the screenshots the hands look at. */
function ComputerSlide(props: SlideProps): ReactNode {
  const { t, name } = props
  const [states, setStates] = useState<Partial<Record<PermissionKind, PermissionState>>>({})
  const refresh = useCallback(() => {
    void bridge()?.permissions().then((next) => setStates(next)).catch(() => undefined)
  }, [])
  // The person flips the switch in System Settings and comes back: poll while the page shows.
  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 1500)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [refresh])
  const allow = (kind: PermissionKind) => {
    void bridge()?.requestPermission(kind).then((state) => setStates((s) => ({ ...s, [kind]: state }))).catch(() => undefined)
  }
  return h(SlideFrame, { ...props, art: ART_COMPUTER, title: t('obPermTitle', { name }), text: t('obPermSub', { name }), fine: t('obPermFine') },
    h(PermissionRow, { t, kind: 'accessibility', title: t('obAccessibility'), sub: t('obAccessibilitySub'), state: states.accessibility, onAllow: allow }),
    h(PermissionRow, { t, kind: 'screen', title: t('obScreen'), sub: t('obScreenSub'), state: states.screen, onAllow: allow }))
}

/** The working folder: the first workspace, or one picked here. */
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
  return h(SlideFrame, { ...props, art: ART_FILES, title: t('obFilesTitle', { name }), text: t('obFilesSub', { name }), fine: t('obFilesFine') },
    h('div', { className: 'nm-ob-row' },
      h('span', { className: 'nm-ob-row-icon' }, h(IconFolder, { size: 20 })),
      h('div', { className: 'nm-ob-row-main' },
        h('div', { className: 'nm-ob-row-title' }, t('obFolder')),
        h('div', { className: 'nm-ob-row-sub nm-ob-path', title: path }, path ?? t('obFolderNone'))),
      h(Pill, { small: true, ghost: path !== undefined, disabled: busy, onClick: choose }, path ? t('obChange') : t('obChoose'))))
}

/** This computer on the account's list, and the phones and computers beside it. */
function DevicesSlide(props: SlideProps & { live: ReturnType<typeof useLive> }): ReactNode {
  const { t, name, live } = props
  const others = live.hub.devices.filter((d) => d.id !== live.hub.deviceId && d.kind !== 'web')
  return h(SlideFrame, { ...props, art: ART_DEVICES, title: t('obDevicesTitle'), text: t('obDevicesSub', { name }), fine: t('obDevicesFine') },
    h('div', { className: 'nm-ob-row' },
      h('span', { className: 'nm-ob-row-icon' }, h(IconLaptop, { size: 20 })),
      h('div', { className: 'nm-ob-row-main' },
        h('div', { className: 'nm-ob-row-title' }, live.hub.deviceName || t('obThisComputer')),
        h('div', { className: 'nm-ob-row-sub' }, t('obThisComputer'))),
      h('span', { className: `nm-ob-granted${live.hub.connected ? '' : ' nm-ob-pending'}` }, h(IconCheck, { size: 16 }))),
    others.length === 0
      ? h('div', { className: 'nm-ob-row' },
          h('span', { className: 'nm-ob-row-icon' }, h(IconDevices, { size: 20 })),
          h('div', { className: 'nm-ob-row-main' },
            h('div', { className: 'nm-ob-row-title' }, t('obNoOthers')),
            h('div', { className: 'nm-ob-row-sub' }, t('obGetPhone'))),
          h(Pill, { small: true, ghost: true, onClick: () => openLink(PHONE_URL) }, t('obOpen')))
      : others.slice(0, 4).map((d) => h('div', { key: d.id, className: 'nm-ob-row' },
          h('span', { className: 'nm-ob-row-icon' }, h(d.kind === 'phone' ? IconPhone : IconLaptop, { size: 20 })),
          h('div', { className: 'nm-ob-row-main' },
            h('div', { className: 'nm-ob-row-title' }, d.name),
            h('div', { className: 'nm-ob-row-sub' }, d.online ? t('online') : t('offline'))),
          h('span', { className: `nm-ob-granted${d.online ? '' : ' nm-ob-pending'}` }, h(IconCheck, { size: 16 })))))
}
