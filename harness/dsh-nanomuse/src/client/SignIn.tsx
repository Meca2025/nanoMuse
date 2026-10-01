/**
 * The two-step sign-in (phone number or e-mail → six-digit code), shared by
 * Settings → nanoMuse Cloud and the first-run welcome. The host does the
 * talking to the relay; this only holds the form.
 */
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useState, type FormEvent, type ReactNode } from 'react'
import { call, column, errorStyle, muted, row, type CloudStatus, type Translate } from './api.ts'

export interface SignInProps {
  t: Translate
  onSignedIn(status: CloudStatus): void
  /** Rendered under the form (the relay line, a "later" button…). */
  footer?: ReactNode
  /** The primary button takes the whole row (the welcome dialog). */
  wide?: boolean
}

export function SignIn({ t, onSignedIn, footer, wide = false }: SignInProps): ReactNode {
  const [step, setStep] = useState<'identifier' | 'code'>('identifier')
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

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

  const sendCode = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await call('code', { identifier })
      setStep('code')
    })
  }

  const signIn = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const status = await call<CloudStatus>('verify', { identifier, code })
      setCode('')
      onSignedIn(status)
    })
  }

  const primary = { variant: 'primary' as const, size: 'md' as const, type: 'submit' as const, style: wide ? { width: '100%' } : undefined }

  if (step === 'code') {
    return h('form', { style: column, onSubmit: signIn },
      h('div', { style: muted }, t('codeSentTo', { identifier })),
      h(Input, { value: code, onChange: (e: FormEvent<HTMLInputElement>) => setCode(e.currentTarget.value), placeholder: t('code'), inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6, autoFocus: true, 'aria-label': t('code') }),
      error ? h('div', { style: errorStyle }, error) : null,
      h('div', { style: row },
        h(Button, { ...primary, disabled: busy || code.trim().length !== 6 }, busy ? t('signingIn') : t('signIn')),
        h(Button, { variant: 'ghost', size: 'md', type: 'button', disabled: busy, onClick: () => { setStep('identifier'); setError(undefined) } }, t('back'))),
      footer)
  }

  return h('form', { style: column, onSubmit: sendCode },
    h(Input, { value: identifier, onChange: (e: FormEvent<HTMLInputElement>) => setIdentifier(e.currentTarget.value), placeholder: t('identifier'), autoComplete: 'username', 'aria-label': t('identifier') }),
    h('div', { style: muted }, t('identifierHint')),
    error ? h('div', { style: errorStyle }, error) : null,
    h('div', { style: row },
      h(Button, { ...primary, disabled: busy || identifier.trim().length < 3 }, busy ? t('sending') : t('sendCode'))),
    footer)
}
