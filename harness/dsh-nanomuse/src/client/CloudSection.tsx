/**
 * Settings → nanoMuse Cloud: sign in with a code, see the account, the look it
 * gives the agent, this computer and the other devices on the hub, sign out.
 * Talks to the host half over the loopback API (`/nanomuse/cloud/*`) and reads
 * the live state the host streams.
 */
import { Button, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { call, column, errorStyle, muted, row, type CloudStatus, type Translate } from './api.ts'
import { Avatar } from './Avatar.tsx'
import { useLive, type LiveDevice } from './live.ts'
import { SignIn } from './SignIn.tsx'

type Phase = 'loading' | 'signedOut' | 'signedIn'

/** Build the section component around the translator the plugin bound. */
export function makeCloudSection(t: Translate) {
  return function CloudSection(): ReactNode {
    const live = useLive()
    const [phase, setPhase] = useState<Phase>('loading')
    const [status, setStatus] = useState<CloudStatus | undefined>()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | undefined>()

    const apply = useCallback((next: CloudStatus) => {
      setStatus(next)
      setPhase(next.signedIn ? 'signedIn' : 'signedOut')
      setError(next.error ? t('failed', { message: next.error.message }) : undefined)
    }, [])

    useEffect(() => {
      let alive = true
      call<CloudStatus>('status')
        .then((next) => { if (alive) apply(next) })
        .catch((err: unknown) => { if (alive) { setPhase('signedOut'); setError(t('failed', { message: String((err as Error).message) })) } })
      return () => { alive = false }
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
    const signOut = () => void run(async () => apply(await call<CloudStatus>('sign-out', {})))
    const refresh = () => void run(async () => apply(await call<CloudStatus>('refresh', {})))

    const profile = live.streaming ? live.profile : status?.profile
    const header = h('div', { style: row },
      h(Avatar, { size: 44, profile, mood: phase === 'signedIn' ? 'happy' : 'idle' }),
      h('div', null,
        h('div', { style: { fontWeight: 600 } }, t('title')),
        h('div', { style: muted }, t('intro'))))

    if (phase === 'loading') {
      return h('section', { style: column }, header, h('div', { style: muted }, t('loading')))
    }

    if (phase === 'signedIn' && status?.account) {
      const a = status.account
      const chat = status.models.filter((m) => m.kind === 'chat')
      const look = profile ?? status.profile
      const lookWord = look.avatar === 'face' ? t('lookFace') : look.avatar === 'emoji' ? t('lookEmoji', { emoji: look.emoji }) : t('lookDragon')
      return h('section', { style: { ...column, maxWidth: 560 } },
        header,
        h('div', null, t('signedInAs', { hint: a.hint, channel: t(a.channel === 'phone' ? 'phone' : 'email') }), a.member ? ` · ${t('member')}` : ''),
        h('div', { style: muted }, a.tokens.unlimited ? t('tokensUnlimited') : t('tokensLeft', { remaining: a.tokens.remaining, granted: a.tokens.granted })),
        h('div', { style: muted }, chat.length ? t('models', { models: chat.map((m) => m.name).join(', ') }) : t('modelsNone')),
        chat.length ? h('div', { style: muted }, t('pickerNote')) : null,
        h('h3', { style: heading }, t('lookTitle')),
        h('div', { style: muted }, look.rev > 0 ? t('lookFrom', { name: look.name, look: lookWord }) : t('lookDefault')),
        h('h3', { style: heading }, t('devicesTitle')),
        h(Devices, { t, hub: live.streaming ? live.hub : status.hub }),
        error ? h('div', { style: errorStyle }, error) : null,
        h('div', { style: row },
          h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: refresh }, t('refresh')),
          h(Button, { variant: 'ghost', size: 'sm', disabled: busy, onClick: signOut }, busy ? t('signingOut') : t('signOut'))),
        h('div', { style: muted }, t('relay', { baseURL: status.baseURL })))
    }

    return h('section', { style: column },
      header,
      error ? h('div', { style: errorStyle }, error) : null,
      h(SignIn, { t, onSignedIn: apply, footer: status ? h('div', { style: muted }, t('relay', { baseURL: status.baseURL })) : null }))
  }
}

const heading: Record<string, string | number> = { fontSize: 14, fontWeight: 600, margin: '8px 0 0' }
const deviceRow: Record<string, string | number> = { display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 13 }

interface DevicesProps {
  t: Translate
  hub: { connected: boolean; deviceId: string; deviceName: string; lastError?: string | undefined; devices: LiveDevice[] }
}

/** This computer on the account, and the others, with online dots. */
export function Devices({ t, hub }: DevicesProps): ReactNode {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(hub.deviceName)
  const others = hub.devices.filter((d) => d.id !== hub.deviceId && d.kind !== 'web')

  const rename = (event: FormEvent) => {
    event.preventDefault()
    void call('devices/rename', { name }).then(() => setRenaming(false)).catch(() => undefined)
  }

  return h('div', null,
    h('div', { style: deviceRow },
      h(StateDot, { state: hub.connected ? 'done' : 'idle', size: 10 }),
      renaming
        ? h('form', { style: { ...row, flex: 1 }, onSubmit: rename },
            h(Input, { value: name, onChange: (e: FormEvent<HTMLInputElement>) => setName(e.currentTarget.value), maxLength: 60, autoFocus: true, 'aria-label': t('deviceName') }),
            h(Button, { variant: 'primary', size: 'sm', type: 'submit', disabled: !name.trim() }, t('save')),
            h(Button, { variant: 'ghost', size: 'sm', type: 'button', onClick: () => setRenaming(false) }, t('cancel')))
        : h('span', { style: { flex: 1 } }, h('strong', null, hub.deviceName), ' · ', t('thisComputer'), ' · ', hub.connected ? t('hubConnected') : (hub.lastError ? t('hubOffline', { reason: hub.lastError }) : t('hubConnecting'))),
      renaming ? null : h(Button, { variant: 'ghost', size: 'sm', onClick: () => { setName(hub.deviceName); setRenaming(true) } }, t('rename'))),
    others.length === 0
      ? h('div', { style: muted }, t('devicesNone'))
      : others.map((d) =>
          h('div', { key: d.id, style: deviceRow },
            h(StateDot, { state: d.online ? 'done' : 'idle', size: 10 }),
            h('span', { style: { flex: 1 } }, h('strong', null, d.name), ' · ', t(d.kind === 'phone' ? 'kindPhone' : 'kindComputer'), d.os ? ` · ${d.os}` : '', ' · ', d.online ? t('online') : t('offline')),
            d.online ? null : h(Button, { variant: 'ghost', size: 'sm', onClick: () => void call('devices/forget', { device_id: d.id }).catch(() => undefined) }, t('forget')))),
    h('div', { style: { ...muted, marginTop: 6 } }, t('devicesHint')))
}
