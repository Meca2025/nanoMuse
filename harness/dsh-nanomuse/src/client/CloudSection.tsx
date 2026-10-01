/**
 * Settings → nanoMuse Cloud: sign in with a code, see the account, sign out.
 * Talks to the host half over the loopback API (`/nanomuse/cloud/*`).
 */
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Avatar } from './Avatar.tsx'
import { fill, type Words } from './locales.ts'

export type Translate = (key: Words, values?: Record<string, string | number>) => string

interface Account {
  id: string
  channel: string
  hint: string
  member: boolean
  tokens: { unlimited: boolean; granted: number; used: number; remaining: number }
}

interface Model {
  id: string
  name: string
  kind: string
}

export interface CloudStatus {
  signedIn: boolean
  baseURL: string
  account?: Account
  models: Model[]
  error?: { code: string; message: string }
}

type Phase = 'loading' | 'identifier' | 'code' | 'signedIn'

const API = 'nanomuse/cloud'

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: body === undefined && path === 'status' ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-nanomuse': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (res.status === 204) return undefined as T
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message ?? `${res.status}`)
  return json as T
}

const column: Record<string, string | number> = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 440 }
const row: Record<string, string | number> = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }
const muted: Record<string, string | number> = { color: 'var(--dsw-alias-text-secondary, #6b6b6b)', fontSize: 13, lineHeight: 1.5 }
const errorStyle: Record<string, string | number> = { color: 'var(--dsw-alias-text-danger, #b42318)', fontSize: 13 }

/** Build the section component around the translator the plugin bound. */
export function makeCloudSection(t: Translate) {
  return function CloudSection(): ReactNode {
    const [phase, setPhase] = useState<Phase>('loading')
    const [status, setStatus] = useState<CloudStatus | undefined>()
    const [identifier, setIdentifier] = useState('')
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | undefined>()

    const apply = useCallback((next: CloudStatus) => {
      setStatus(next)
      setPhase(next.signedIn ? 'signedIn' : 'identifier')
      if (next.error) setError(t('failed', { message: next.error.message }))
    }, [])

    useEffect(() => {
      let live = true
      call<CloudStatus>('status')
        .then((next) => { if (live) apply(next) })
        .catch((err: unknown) => { if (live) { setPhase('identifier'); setError(t('failed', { message: String((err as Error).message) })) } })
      return () => { live = false }
    }, [apply])

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
        setPhase('code')
      })
    }

    const signIn = (event: FormEvent) => {
      event.preventDefault()
      void run(async () => {
        apply(await call<CloudStatus>('verify', { identifier, code }))
        setCode('')
      })
    }

    const signOut = () => void run(async () => apply(await call<CloudStatus>('sign-out', {})))
    const refresh = () => void run(async () => apply(await call<CloudStatus>('refresh', {})))

    const header = h('div', { style: row },
      h(Avatar, { size: 40, mood: phase === 'signedIn' ? 'happy' : 'idle' }),
      h('div', null,
        h('div', { style: { fontWeight: 600 } }, t('title')),
        h('div', { style: muted }, t('intro'))))

    if (phase === 'loading') {
      return h('section', { style: column }, header, h('div', { style: muted }, t('loading')))
    }

    if (phase === 'signedIn' && status?.account) {
      const a = status.account
      const chat = status.models.filter((m) => m.kind === 'chat')
      return h('section', { style: column },
        header,
        h('div', null, t('signedInAs', { hint: a.hint, channel: t(a.channel === 'phone' ? 'phone' : 'email') }), a.member ? ` · ${t('member')}` : ''),
        h('div', { style: muted }, a.tokens.unlimited ? t('tokensUnlimited') : t('tokensLeft', { remaining: a.tokens.remaining, granted: a.tokens.granted })),
        h('div', { style: muted }, chat.length ? t('models', { models: chat.map((m) => m.name).join(', ') }) : t('modelsNone')),
        chat.length ? h('div', { style: muted }, t('pickerNote')) : null,
        error ? h('div', { style: errorStyle }, error) : null,
        h('div', { style: row },
          h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: refresh }, t('refresh')),
          h(Button, { variant: 'ghost', size: 'sm', disabled: busy, onClick: signOut }, busy ? t('signingOut') : t('signOut'))),
        h('div', { style: muted }, t('relay', { baseURL: status.baseURL })))
    }

    if (phase === 'code') {
      return h('form', { style: column, onSubmit: signIn },
        header,
        h('div', { style: muted }, t('codeSentTo', { identifier })),
        h(Input, { value: code, onChange: (e: FormEvent<HTMLInputElement>) => setCode(e.currentTarget.value), placeholder: t('code'), inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6, autoFocus: true, 'aria-label': t('code') }),
        error ? h('div', { style: errorStyle }, error) : null,
        h('div', { style: row },
          h(Button, { variant: 'primary', size: 'md', type: 'submit', disabled: busy || code.trim().length !== 6 }, busy ? t('signingIn') : t('signIn')),
          h(Button, { variant: 'ghost', size: 'md', type: 'button', disabled: busy, onClick: () => { setPhase('identifier'); setError(undefined) } }, t('back'))))
    }

    return h('form', { style: column, onSubmit: sendCode },
      header,
      h(Input, { value: identifier, onChange: (e: FormEvent<HTMLInputElement>) => setIdentifier(e.currentTarget.value), placeholder: t('identifier'), autoComplete: 'username', 'aria-label': t('identifier') }),
      h('div', { style: muted }, t('identifierHint')),
      error ? h('div', { style: errorStyle }, error) : null,
      h('div', { style: row },
        h(Button, { variant: 'primary', size: 'md', type: 'submit', disabled: busy || identifier.trim().length < 3 }, busy ? t('sending') : t('sendCode'))),
      status ? h('div', { style: muted }, t('relay', { baseURL: status.baseURL })) : null)
  }
}
