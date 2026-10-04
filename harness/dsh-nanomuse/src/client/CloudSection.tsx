/**
 * Settings → nanoMuse Cloud: sign in with a code, see the account, the look it
 * gives the agent, this computer and the other devices on the hub, sign out.
 * Talks to the host half over the loopback API (`/nanomuse/cloud/*`) and reads
 * the live state the host streams.
 */
import { Button, Input, StateDot, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { call, column, errorStyle, muted, row, type CloudStatus, type Model, type Translate } from './api.ts'
import { AccountPage } from './AccountPage.tsx'
import { Avatar } from './Avatar.tsx'
import { settingsBus } from './bus.ts'
import { useLive, type LiveHub } from './live.ts'
import { DEVICES_PANEL } from './panels.ts'
import { DataRows } from './Memory.tsx'
import { useRooms } from './rooms.ts'
import { SignIn } from './SignIn.tsx'

type Phase = 'loading' | 'signedOut' | 'signedIn'

/** Where the privacy policy is when the relay did not name one. */
const PRIVACY_URL = 'https://nanomuse.cn/privacy/'

/** Build the section component around the translator the plugin bound. */
/**
 * @param part - `account`: the account page (who is signed in, the models, the look, the
 * devices); `data`: the Data controls page alone — Muse keeps the two apart in its nav.
 */
export function makeCloudSection(t: Translate, part: 'account' | 'data' = 'account') {
  return function CloudSection(): ReactNode {
    const live = useLive()
    const rooms = useRooms()
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
    const [notice, setNotice] = useState<string | undefined>()
    const setContribute = (on: boolean) => void run(async () => { setNotice(undefined); apply(await call<CloudStatus>('data/contribute', { on })) })
    const deleteSamples = () => {
      if (!window.confirm(t('dataDeleteConfirm'))) return
      void run(async () => {
        const next = await call<CloudStatus & { deleted: number }>('data/delete-samples', {})
        apply(next)
        setNotice(t('dataDeleted', { n: next.deleted }))
      })
    }

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
      const look = profile ?? status.profile
      const lookWord = look.avatar === 'face' ? t('lookFace') : look.avatar === 'emoji' ? t('lookEmoji', { emoji: look.emoji }) : t('lookDragon')
      const dataControls = a.contribute
        ? h('div', null,
            h('div', { style: { ...row, justifyContent: 'space-between' } },
              h('span', null, t('dataImprove')),
              h(Switch, { checked: a.contribute.on, onChange: setContribute, disabled: busy, label: t('dataImprove') })),
            h('div', { style: muted },
              t('dataWhy'), ' ',
              a.contribute.defaultOn === undefined ? '' : t(a.contribute.defaultOn ? 'dataDefaultOn' : 'dataDefaultOff'), ' ',
              a.contribute.samples > 0 ? t('dataKept', { n: a.contribute.samples }) : '', ' ',
              h('a', { href: a.contribute.privacyUrl || PRIVACY_URL, target: '_blank', rel: 'noopener noreferrer' }, t('dataPrivacy'))),
            a.contribute.samples > 0
              ? h('div', { style: { marginTop: 6 } }, h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: deleteSamples }, t('dataDelete')))
              : null,
            notice ? h('div', { style: muted }, notice) : null)
        : h('div', { style: muted }, t('dataOlderRelay'))
      if (part === 'data') {
        return h('section', { style: { ...column, maxWidth: 560 } },
          h('div', { className: 'nm-card', style: { padding: '14px 16px' } },
            h('div', { style: { fontWeight: 600, marginBottom: 4 } }, t('dataPrivacyTitle')),
            h('div', { style: muted }, t('dataPrivacyText'), ' ',
              h('a', { href: a.contribute?.privacyUrl || PRIVACY_URL, target: '_blank', rel: 'noopener noreferrer' }, t('dataPrivacy')))),
          dataControls,
          error ? h('div', { style: errorStyle }, error) : null,
          h('h3', { style: heading }, t('dataLocalTitle')),
          h(DataRows, { t }))
      }
      return h('section', { style: { ...column, maxWidth: 560 } },
        header,
        h('div', null, t('signedInAs', { hint: a.hint, channel: t(a.channel === 'phone' ? 'phone' : 'email') }), a.member ? ` · ${t('member')}` : ''),
        h(ModelRows, { t, status, onChanged: () => void call<CloudStatus>('status').then(apply).catch(() => undefined) }),
        // The account as the phone shows it — the pool in yuan, the ways on, invite, usage,
        // password, devices holding a key, the timeline, deletion — read live from the relay.
        h(AccountPage, { t, status, locale: rooms.lang, onEnded: apply }),
        h('h3', { style: heading }, t('lookTitle')),
        h('div', { style: muted }, look.rev > 0 ? t('lookFrom', { name: look.name, look: lookWord }) : t('lookDefault')),
        h('h3', { style: heading }, t('devicesTitle')),
        h('div', { style: muted }, t('devicesSummary', { n: (live.streaming ? live.hub : status.hub).devices.filter((d) => d.kind !== 'web').length }), ' ',
          h(Button, { variant: 'ghost', size: 'sm', onClick: () => { settingsBus.openSection?.(DEVICES_PANEL) } }, t('devicesOpen'))),
        // Data controls: the one switch over what the relay keeps, the shape of Muse's own.
        h('h3', { style: heading }, t('dataTitle')),
        dataControls,
        error ? h('div', { style: errorStyle }, error) : null,
        h('div', { style: row },
          h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: refresh }, t('refresh')),
          h(Button, { variant: 'ghost', size: 'sm', disabled: busy, onClick: signOut }, busy ? t('signingOut') : t('signOut'))),
        h('div', { style: muted }, t('relay', { baseURL: status.baseURL })))
    }

    if (part === 'data') return h('section', { style: { ...column, maxWidth: 560 } }, h('div', { style: muted }, t('dataSignedOut')), h('h3', { style: heading }, t('dataLocalTitle')), h(DataRows, { t }))
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
  hub: LiveHub
}

/** This computer on the account, and the others, with online dots. */
export function Devices({ t, hub }: DevicesProps): ReactNode {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(hub.deviceName)
  const [switching, setSwitching] = useState(false)
  const others = hub.devices.filter((d) => d.id !== hub.deviceId && d.kind !== 'web')

  const rename = (event: FormEvent) => {
    event.preventDefault()
    void call('devices/rename', { name }).then(() => setRenaming(false)).catch(() => undefined)
  }
  const setRemote = (on: boolean) => {
    setSwitching(true)
    void call('devices/remote-control', { on }).catch(() => undefined).finally(() => setSwitching(false))
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
    h('div', { style: { ...deviceRow, paddingLeft: 20 } },
      h('span', { style: { flex: 1 } },
        h('div', null, t('remoteControl')),
        h('div', { style: muted }, hub.remoteControl ? t('remoteControlOn') : t('remoteControlOff'))),
      h(Switch, { checked: hub.remoteControl, onChange: setRemote, disabled: switching, label: t('remoteControl') })),
    others.length === 0
      ? h('div', { style: muted }, t('devicesNone'))
      : others.map((d) =>
          h('div', { key: d.id, style: deviceRow },
            h(StateDot, { state: d.online ? 'done' : 'idle', size: 10 }),
            h('span', { style: { flex: 1 } }, h('strong', null, d.name), ' · ', t(d.kind === 'phone' ? 'kindPhone' : 'kindComputer'), d.os ? ` · ${d.os}` : '', ' · ', d.online ? t('online') : t('offline')),
            d.online ? null : h(Button, { variant: 'ghost', size: 'sm', onClick: () => void call('devices/forget', { device_id: d.id }).catch(() => undefined) }, t('forget')))),
    h('div', { style: { ...muted, marginTop: 6 } }, t('devicesHint')))
}


/** What the relay says a model is for; an older relay says nothing, which means chat. */
function modelFor(m: Model): string[] {
  return m.for?.length ? m.for : m.kind === 'chat' ? ['chat'] : []
}

/**
 * The two model rows of the account (C4): the chat model new chats answer through
 * (`deepseek-v4.1-flash` unless the person picks another) and the hands model the
 * bundled runtime sees the screen with (`qwen3.8-27b` by default). The hands model
 * reaches the runtime when it next starts, so the row says so.
 */
function ModelRows({ t, status, onChanged }: { t: Translate; status: CloudStatus; onChanged(): void }): ReactNode {
  const chat = status.models.filter((m) => modelFor(m).includes('chat'))
  const gui = status.models.filter((m) => modelFor(m).includes('gui'))
  const [busy, setBusy] = useState<'chat' | 'hands' | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [handsNote, setHandsNote] = useState(false)
  const set = (kind: 'chat' | 'hands', model: string) => {
    setBusy(kind)
    setError(undefined)
    call(kind === 'chat' ? 'chat-model' : 'hands-model', { model })
      .then(() => { if (kind === 'hands') setHandsNote(true); onChanged() })
      .catch((err: unknown) => setError(t('failed', { message: (err as Error).message })))
      .finally(() => setBusy(null))
  }
  if (!chat.length && !gui.length) return h('div', { style: muted }, t('modelsNone'))
  const select = (kind: 'chat' | 'hands', list: Model[], value: string) => h('select', {
    className: 'nm-field nm-select',
    value: list.some((m) => m.id === value) ? value : '',
    disabled: busy !== null,
    'aria-label': kind === 'chat' ? t('mdChat') : t('mdHands'),
    onChange: (e: { currentTarget: HTMLSelectElement }) => set(kind, e.currentTarget.value),
  },
    list.some((m) => m.id === value) ? null : h('option', { value: '' }, kind === 'chat' ? t('mdOther') : t('mdPick')),
    list.map((m) => h('option', { key: m.id, value: m.id }, `${m.name}${m.recommended ? ` · ${t('mdRecommended')}` : ''}`)))
  return h('div', { className: 'nm-card', style: { marginTop: 4 } },
    chat.length ? h('div', { className: 'nm-row' },
      h('div', { className: 'nm-row-main' },
        h('span', { className: 'nm-row-title' }, t('mdChat')),
        h('span', { className: 'nm-row-sub nm-wrap' }, t('mdChatSub'))),
      select('chat', chat, status.chatModel ?? '')) : null,
    gui.length ? h('div', { className: 'nm-row' },
      h('div', { className: 'nm-row-main' },
        h('span', { className: 'nm-row-title' }, t('mdHands')),
        h('span', { className: 'nm-row-sub nm-wrap' }, handsNote ? t('mdHandsRestart') : t('mdHandsSub'))),
      select('hands', gui, status.handsModel ?? '')) : null,
    error ? h('div', { style: { ...errorStyle, padding: '0 14px 10px' } }, error) : null)
}
