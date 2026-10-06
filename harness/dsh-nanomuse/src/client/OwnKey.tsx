/**
 * Own keys with capabilities (contract C11), the browser half.
 *
 * One catalogue (`assets/providers.json`, read through the host's `GET /providers`) drives
 * three places: the onboarding's own-key step, Settings → Account's "ways on", and the model
 * pickers. Rows are grouped — the person's region first (mainland China: Bailian, one key for
 * chat, hands, pictures and clips; elsewhere: OpenRouter, then OpenAI), then the subscriptions
 * one can sign in with, then the rest ordered by how much they cover, then servers on this
 * computer, then any OpenAI-compatible endpoint by hand. Each row says what it covers (`chat ·
 * screen operation · pictures · clips`), links to where the key is handed out, and takes the
 * key inline; *Sign in with ChatGPT* runs the runtime's flow through the host.
 *
 * The gate: the pickers list only models of providers that have the capability; a
 * capability nobody has is one sentence naming the catalogue's providers for the region
 * (`ownKeyNoImage`, `ownKeyNoVideo`, `ownKeyNoVision`; with only the ChatGPT sign-in,
 * `ownKeyChatGptNoMedia`), never a raw error. Mounted in `CloudSection.tsx` (Settings →
 * Account, signed in or out), `Onboarding.tsx` (the own-key step), `AvatarStudio.tsx` and
 * `MediaSection.tsx` (the sentences for pictures and clips).
 */
import { createElement as h, Fragment, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { baseUrlFor, isLocal, keyUrlFor, ownKeyStepDone, providersWith, unavailableKey, waysOn, type Capability, type ProviderEntry, type Region, type WaysOn } from '../catalogue.ts'
import { call, errorStyle, muted, row, type Translate } from './api.ts'
import { openLink } from './bridge.ts'
import { settingsBus } from './bus.ts'
import { IconCheck, IconGlobe, IconKey } from './icons.tsx'
import { useLive } from './live.ts'

export type { Capability, ProviderEntry, Region }

/** The settings section the "ways on" live in (Settings → Account). */
export const ACCOUNT_SECTION = 'nanomuse-cloud'

/** An own-key row as the host keeps it in `cloud.json` (`src/providers.ts` `OwnProvider`): never a key. */
export interface OwnProvider {
  provider: string
  label: string
  protocol: string
  baseURL: string
  keyRef: string
  capabilities: Capability[]
  models: { id: string; name: string; vision: boolean; kind: 'chat' | 'image' | 'video' }[]
  at: number
}

export interface LoginView { status: 'idle' | 'waiting' | 'done' | 'error'; url: string; label: string; error: string }

/** `GET /providers`. */
export interface ProvidersView {
  region: Region
  catalogue: ProviderEntry[]
  configured: OwnProvider[]
  capabilities: Capability[]
  cloud: { signedIn: boolean; capabilities: Capability[] }
  chatgpt: { signedIn: boolean; label: string; proxy: boolean; login: LoginView; runtime: boolean }
  hands: { provider: string; model: string }
  chat: { provider: string; model: string }
}

export interface ModelOption { provider: string; providerLabel: string; id: string; name: string }

const CAPS: Capability[] = ['chat', 'vision', 'image', 'video']

/** The catalogue in the groups the rows are shown in: the host's `waysOn` (`src/catalogue.ts`), so both halves order them alike. */
export function groupsOf(catalogue: ProviderEntry[], region: Region): WaysOn {
  return waysOn(catalogue, region)
}

/** `GET /providers`, again whenever the host's live state says the rows or the sign-in moved. */
export function useProviders(t: Translate): { view: ProvidersView | undefined; error: string | undefined; reload(): void } {
  const live = useLive()
  const [view, setView] = useState<ProvidersView | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])
  const own = live.ownKeys
  const key = own ? `${own.count}|${own.chatgpt.signedIn}|${own.chatgpt.proxy}|${own.chatgpt.login.status}|${own.capabilities.join(',')}` : ''
  const signedIn = live.cloud.signedIn
  useEffect(() => {
    let alive = true
    call<ProvidersView>(`providers?lang=${encodeURIComponent(t('langTag'))}`)
      .then((v) => { if (alive) { setView(v); setError(undefined) } })
      .catch((err: unknown) => { if (alive) setError((err as Error).message) })
    return () => { alive = false }
  }, [t, tick, key, signedIn])
  return { view, error, reload }
}

const nameOf = (t: Translate, p: ProviderEntry): string => (t('langTag') === 'zh' ? p.name_zh : p.name)
const noteOf = (t: Translate, p: ProviderEntry): string => (t('langTag') === 'zh' ? p.note_zh : p.note)

/** `chat · screen operation · pictures · clips`, the ones a row covers. */
export function coverage(t: Translate, caps: Capability[]): string {
  const word: Record<Capability, string> = { chat: t('ownKeyCovChat'), vision: t('ownKeyCovVision'), image: t('ownKeyCovImage'), video: t('ownKeyCovVideo') }
  return CAPS.filter((c) => caps.includes(c)).map((c) => word[c]).join(' · ')
}

/** The providers of the catalogue that have a capability where the person is, named in one list. */
export function providersNamed(t: Translate, view: Pick<ProvidersView, 'catalogue' | 'region'>, capability: Capability): string {
  const names = providersWith(view.catalogue, capability, view.region).map((p) => nameOf(t, p))
  return names.length ? names.join(t('langTag') === 'zh' ? '、' : ', ') : t('ownKeyNone')
}

/**
 * The one sentence for a capability nothing configured has (C11): who could, where the person
 * is; with only the ChatGPT sign-in, that pictures and clips are not covered by it (the key is
 * `unavailableKey`'s, in `src/catalogue.ts`). Nothing when something configured has the
 * capability. `link` adds the way to Settings → Account's rows.
 */
export function unavailableText(t: Translate, view: Pick<ProvidersView, 'catalogue' | 'region' | 'capabilities' | 'configured' | 'cloud' | 'chatgpt'>, capability: Capability): string | null {
  const key = unavailableKey(view, capability)
  return key === null ? null : t(key, { providers: providersNamed(t, view, capability) })
}

export function UnavailableLine({ t, view, capability, link = false, className = 'nm-way-sub nm-wrap', tag = 'div' }: { t: Translate; view: ProvidersView; capability: Capability; link?: boolean; className?: string; tag?: 'div' | 'span' }): ReactNode {
  const text = unavailableText(t, view, capability)
  if (text === null) return null
  return h(tag, { className, style: muted, 'data-testid': `nm-unavailable-${capability}` },
    text,
    link ? h(Fragment, null, ' ', h('button', { type: 'button', className: 'nm-ob-link nm-inline', onClick: () => { settingsBus.openSection?.(ACCOUNT_SECTION) } }, t('ownKeyOpenWays'))) : null)
}

// ---- one row -----------------------------------------------------------------------------------

function KeyForm({ t, entry, region, configured, onSaved, onCancel }: { t: Translate; entry: ProviderEntry; region: Region; configured: OwnProvider | undefined; onSaved(said: string): void; onCancel(): void }): ReactNode {
  const base = baseUrlFor(entry, region)
  const [apiKey, setApiKey] = useState('')
  const [baseURL, setBaseURL] = useState(configured?.baseURL ?? base)
  const [label, setLabel] = useState(configured?.label ?? '')
  const [caps, setCaps] = useState<Capability[]>(configured?.capabilities ?? ['chat'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const needsKey = !entry.auth.includes('none')
  const editable = entry.user_capabilities || isLocal(entry) || !entry.base_url
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    const body: Record<string, unknown> = { id: entry.id, apiKey, lang: t('langTag') }
    if (editable) body.baseURL = baseURL
    if (entry.user_capabilities) { body.capabilities = caps; body.label = label }
    call<OwnProvider>('providers/save', body)
      .then((saved) => onSaved(saved.models.length ? t('ownKeySaved', { n: saved.models.length }) : t('ownKeySavedNone')))
      .catch((err: unknown) => setError(t('failed', { message: (err as Error).message })))
      .finally(() => setBusy(false))
  }
  const capWord: Record<Capability, string> = { chat: t('ownKeyCovChat'), vision: t('ownKeyCovVision'), image: t('ownKeyCovImage'), video: t('ownKeyCovVideo') }
  return h('form', { className: 'nm-ownkey-form', style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }, onSubmit: submit },
    editable
      ? h('input', { className: 'nm-field', value: baseURL, placeholder: t('ownKeyBaseField'), 'aria-label': t('ownKeyBaseField'), autoComplete: 'off', spellCheck: false, onChange: (e: FormEvent<HTMLInputElement>) => setBaseURL(e.currentTarget.value) })
      : null,
    entry.user_capabilities
      ? h('input', { className: 'nm-field', value: label, placeholder: t('ownKeyLabelField'), 'aria-label': t('ownKeyLabelField'), onChange: (e: FormEvent<HTMLInputElement>) => setLabel(e.currentTarget.value) })
      : null,
    h('input', { className: 'nm-field', type: 'password', value: apiKey, placeholder: entry.key_hint || t('ownKeyKeyField'), 'aria-label': t('ownKeyKeyField'), autoComplete: 'off', spellCheck: false, autoFocus: true, onChange: (e: FormEvent<HTMLInputElement>) => setApiKey(e.currentTarget.value) }),
    entry.user_capabilities
      ? h('div', { style: row },
          h('span', { style: muted }, t('ownKeyCapsField')),
          CAPS.map((c) => h('label', { key: c, style: { display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 13 } },
            h('input', { type: 'checkbox', checked: caps.includes(c), disabled: c === 'chat', onChange: () => setCaps((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])) }),
            capWord[c])))
      : null,
    error ? h('div', { style: errorStyle }, error) : null,
    h('div', { style: row },
      h('button', { type: 'submit', className: 'nm-pill nm-pill-sm', disabled: busy || (needsKey && !apiKey.trim()) || (editable && !/^https?:\/\//.test(baseURL.trim())) }, busy ? t('sending') : configured ? t('ownKeyChange') : needsKey ? t('ownKeyAdd') : t('ownKeyConnect')),
      h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', disabled: busy, onClick: onCancel }, t('cancel'))))
}

/** The ChatGPT sign-in: the row under OpenAI (or on its own in the sign-in group), with the honesty line. */
function ChatGptRow({ t, view, onChanged }: { t: Translate; view: ProvidersView; onChanged(said?: string): void }): ReactNode {
  const live = useLive()
  const cg = live.ownKeys?.chatgpt ?? view.chatgpt
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const signIn = () => {
    setBusy(true)
    setError(undefined)
    call<{ url: string }>('chatgpt/login')
      .then((r) => { if (r.url) openLink(r.url) })
      // `no_runtime` reaches the row through the live state's `login.error` already
      .catch((err: unknown) => { if ((err as Error).message !== 'no_runtime') setError(t('failed', { message: (err as Error).message })) })
      .finally(() => setBusy(false))
  }
  const signOut = () => {
    setBusy(true)
    call('chatgpt/logout').then(() => onChanged()).catch((err: unknown) => setError(t('failed', { message: (err as Error).message }))).finally(() => setBusy(false))
  }
  const cancel = () => { void call('chatgpt/cancel').catch(() => undefined) }
  const login = cg.login
  let state: ReactNode
  if (cg.signedIn) {
    state = h('div', { className: 'nm-way-sub' }, h(IconCheck, { size: 13 }), ' ', cg.proxy ? t('ownKeyChatGptDone', { label: cg.label || 'ChatGPT' }) : t('ownKeyChatGptProxyDown', { label: cg.label || 'ChatGPT' }))
  } else if (login.status === 'waiting') {
    state = h('div', { className: 'nm-way-sub nm-wrap' }, t('ownKeyChatGptWaiting'))
  } else if (login.status === 'error') {
    state = h('div', { style: errorStyle }, t('ownKeyChatGptFailed', { error: login.error === 'no_runtime' ? t('ownKeyNoRuntime') : login.error }))
  } else if (!view.chatgpt.runtime) {
    state = h('div', { className: 'nm-way-sub nm-wrap' }, t('ownKeyNoRuntime'))
  }
  return h('div', { className: 'nm-way' },
    h('span', { className: 'nm-way-icon' }, h(IconKey, { size: 15 })),
    h('div', { className: 'nm-way-main' },
      h('div', { className: 'nm-way-title' }, t('ownKeyChatGptRow'), h('span', { style: { ...muted, marginLeft: 8 } }, coverage(t, ['chat', 'vision']))),
      h('div', { className: 'nm-way-sub nm-wrap' }, t('ownKeyChatGptSub')),
      h('div', { className: 'nm-way-sub nm-wrap', style: muted }, t('ownKeyChatGptHonesty')),
      state,
      error ? h('div', { style: errorStyle }, error) : null,
      h('div', { style: row },
        cg.signedIn
          ? h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', disabled: busy, onClick: signOut }, t('ownKeySignOut'))
          : login.status === 'waiting'
            ? h(Fragment, null,
                login.url ? h('button', { type: 'button', className: 'nm-pill nm-pill-sm', onClick: () => openLink(login.url) }, t('ownKeyChatGptOpen')) : null,
                h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: cancel }, t('ownKeyChatGptCancel')))
            : h('button', { type: 'button', className: 'nm-pill nm-pill-sm', disabled: busy || !view.chatgpt.runtime, onClick: signIn }, t('ownKeySignIn')))))
}

function ProviderRow({ t, entry, view, onChanged }: { t: Translate; entry: ProviderEntry; view: ProvidersView; onChanged(said?: string): void }): ReactNode {
  const configured = view.configured.find((p) => p.provider === entry.id)
  const [open, setOpen] = useState(false)
  const [said, setSaid] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const keyUrl = keyUrlFor(entry, view.region)
  const needsKey = !entry.auth.includes('none')
  const remove = () => {
    setBusy(true)
    setError(undefined)
    call('providers/remove', { id: entry.id }).then(() => { setSaid(undefined); onChanged() }).catch((err: unknown) => setError(t('failed', { message: (err as Error).message }))).finally(() => setBusy(false))
  }
  return h('div', { className: 'nm-way' },
    h('span', { className: 'nm-way-icon' }, configured ? h(IconCheck, { size: 15 }) : h(IconKey, { size: 15 })),
    h('div', { className: 'nm-way-main' },
      h('div', { className: 'nm-way-title' }, nameOf(t, entry), h('span', { style: { ...muted, marginLeft: 8 } }, coverage(t, configured?.capabilities ?? entry.capabilities))),
      open ? h('div', { className: 'nm-way-sub nm-wrap', style: muted }, noteOf(t, entry), entry.verified ? ` · ${t('ownKeyVerified', { month: entry.verified })}` : '') : null,
      configured ? h('div', { className: 'nm-way-sub' }, `${t('ownKeyConfigured')} · ${configured.models.length ? t('ownKeySaved', { n: configured.models.length }) : t('ownKeySavedNone')}`) : null,
      said ? h('div', { className: 'nm-way-sub' }, said) : null,
      error ? h('div', { style: errorStyle }, error) : null,
      open
        ? h(KeyForm, { t, entry, region: view.region, configured, onSaved: (text) => { setOpen(false); setSaid(text); onChanged(text) }, onCancel: () => setOpen(false) })
        : h('div', { style: row },
            h('button', { type: 'button', className: `nm-pill nm-pill-sm${configured ? ' nm-pill-ghost' : ''}`, disabled: busy, onClick: () => setOpen(true) }, configured ? t('ownKeyChange') : needsKey ? t('ownKeyAdd') : t('ownKeyConnect')),
            keyUrl && needsKey ? h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: () => openLink(keyUrl) }, t('ownKeyGetKey')) : null,
            configured ? h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', disabled: busy, onClick: remove }, t('ownKeyRemove')) : null)))
}

// ---- the groups ----------------------------------------------------------------------------------

export type Group = 'account' | 'first' | 'signIn' | 'rest' | 'local' | 'custom'
export const ALL_GROUPS: Group[] = ['account', 'first', 'signIn', 'rest', 'local', 'custom']

/** The account's row, first while signed in: what nanoMuse Cloud covers right now (the relay's model list). */
function AccountRow({ t, view }: { t: Translate; view: ProvidersView }): ReactNode {
  return h('div', { className: 'nm-way', 'data-testid': 'nm-way-account' },
    h('span', { className: 'nm-way-icon' }, h(IconGlobe, { size: 15 })),
    h('div', { className: 'nm-way-main' },
      h('div', { className: 'nm-way-title' }, 'nanoMuse Cloud', h('span', { style: { ...muted, marginLeft: 8 } }, coverage(t, view.cloud.capabilities))),
      h('div', { className: 'nm-way-sub nm-wrap' }, t('ownKeyAccountSub'))))
}

/**
 * The rows, grouped. `groups` picks which to show: Settings → Account shows them all, the
 * account's row first while signed in; the own-key step shows the region's first group and the
 * sign-in row, the rest behind *More ways*.
 */
export function WaysOnRows({ t, view, groups = ALL_GROUPS, onChanged }: { t: Translate; view: ProvidersView; groups?: Group[]; onChanged(said?: string): void }): ReactNode {
  const g = useMemo(() => groupsOf(view.catalogue, view.region), [view.catalogue, view.region])
  const rowOf = (entry: ProviderEntry) => h(ProviderRow, { key: entry.id, t, entry, view, onChanged })
  const heading = (text: string) => h('div', { className: 'nm-ways-lead', style: { marginTop: 6 } }, text)
  // the ChatGPT sign-in sits with OpenAI: under it when OpenAI is in the first group, else in the sign-in group
  const chatgptEntry = view.catalogue.find((p) => p.auth.includes('oauth-chatgpt'))
  const chatgptInFirst = Boolean(chatgptEntry && g.first.some((p) => p.id === chatgptEntry.id))
  const out: ReactNode[] = []
  if (groups.includes('account') && view.cloud.signedIn) {
    out.push(heading(t('ownKeyAccountGroup')))
    out.push(h(AccountRow, { key: 'account', t, view }))
  }
  if (groups.includes('first') && g.first.length) {
    out.push(heading(view.region === 'cn' ? t('ownKeyRegionCn') : t('ownKeyRegionGlobal')))
    for (const p of g.first) {
      out.push(rowOf(p))
      if (chatgptEntry && p.id === chatgptEntry.id) out.push(h(ChatGptRow, { key: 'chatgpt', t, view, onChanged }))
    }
  }
  if (groups.includes('signIn') && (g.signIn.length || (chatgptEntry && !chatgptInFirst))) {
    out.push(heading(t('ownKeySignInGroup')))
    if (chatgptEntry && !chatgptInFirst) out.push(h(ChatGptRow, { key: 'chatgpt', t, view, onChanged }))
    for (const p of g.signIn) if (!chatgptEntry || p.id !== chatgptEntry.id) out.push(rowOf(p))
  }
  if (groups.includes('rest') && g.rest.length) {
    out.push(heading(t('ownKeyRestGroup')))
    for (const p of g.rest) out.push(rowOf(p))
  }
  if (groups.includes('local') && g.local.length) {
    out.push(heading(t('ownKeyLocalGroup')))
    for (const p of g.local) out.push(rowOf(p))
  }
  if (groups.includes('custom') && g.custom) {
    out.push(heading(t('ownKeyCustomGroup')))
    out.push(rowOf(g.custom))
  }
  return h('div', { className: 'nm-ways' }, out)
}

// ---- the pickers ----------------------------------------------------------------------------------

const SEP = '\u0000'

/**
 * The chat and hands pickers (C4, C11): the account's models and the own rows' together, each
 * list only the models of providers with the capability; a list with nothing in it is the
 * gate's one sentence instead.
 */
export function ModelPickers({ t, view, onChanged }: { t: Translate; view: ProvidersView; onChanged(): void }): ReactNode {
  const [chat, setChat] = useState<ModelOption[] | undefined>()
  const [hands, setHands] = useState<ModelOption[] | undefined>()
  const [busy, setBusy] = useState<'chat' | 'hands' | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [handsNote, setHandsNote] = useState(false)
  const key = `${view.configured.map((p) => p.provider + p.at).join(',')}|${view.cloud.signedIn}`
  useEffect(() => {
    let alive = true
    void Promise.all([call<{ options: ModelOption[] }>('providers/models?cap=chat'), call<{ options: ModelOption[] }>('providers/models?cap=vision')])
      .then(([c, v]) => { if (alive) { setChat(c.options); setHands(v.options) } })
      .catch(() => { if (alive) { setChat([]); setHands([]) } })
    return () => { alive = false }
  }, [key])
  const set = (kind: 'chat' | 'hands', value: string) => {
    const [provider, model] = value.split(SEP)
    if (!provider || !model) return
    setBusy(kind)
    setError(undefined)
    call(kind === 'chat' ? 'chat-model' : 'hands-model', { model, provider })
      .then(() => { if (kind === 'hands') setHandsNote(true); onChanged() })
      .catch((err: unknown) => setError(t('failed', { message: (err as Error).message })))
      .finally(() => setBusy(null))
  }
  if (!chat || !hands) return h('div', { style: muted }, t('loading'))
  // a configured source with chat but no sighted model (DeepSeek's key, a local server): the hands row says so rather than listing nothing
  const handsSub = hands.length
    ? (handsNote ? t('mdHandsRestart') : t('mdHandsSub'))
    : view.capabilities.includes('vision') ? t('ownKeyHandsNoneSub') : t('ownKeyNoVision', { providers: providersNamed(t, view, 'vision') })
  const select = (kind: 'chat' | 'hands', list: ModelOption[], current: { provider: string; model: string }) => {
    const value = `${current.provider}${SEP}${current.model}`
    const known = list.some((o) => `${o.provider}${SEP}${o.id}` === value)
    const byProvider = new Map<string, ModelOption[]>()
    for (const o of list) byProvider.set(o.providerLabel, [...(byProvider.get(o.providerLabel) ?? []), o])
    return h('select', {
      className: 'nm-field nm-select',
      value: known ? value : '',
      disabled: busy !== null,
      'aria-label': kind === 'chat' ? t('mdChat') : t('mdHands'),
      onChange: (e: { currentTarget: HTMLSelectElement }) => set(kind, e.currentTarget.value),
    },
      known ? null : h('option', { value: '' }, kind === 'chat' && current.provider ? t('mdOther') : t('mdPick')),
      [...byProvider.entries()].map(([label, options]) => h('optgroup', { key: label, label }, options.map((o) => h('option', { key: `${o.provider}${SEP}${o.id}`, value: `${o.provider}${SEP}${o.id}` }, o.name)))))
  }
  return h('div', { className: 'nm-card', style: { marginTop: 4 } },
    h('div', { className: 'nm-row' },
      h('div', { className: 'nm-row-main' },
        h('span', { className: 'nm-row-title' }, t('mdChat')),
        h('span', { className: 'nm-row-sub nm-wrap' }, chat.length ? t('mdChatSub') : t('ownKeyNoChat'))),
      chat.length ? select('chat', chat, view.chat) : null),
    h('div', { className: 'nm-row' },
      h('div', { className: 'nm-row-main' },
        h('span', { className: 'nm-row-title' }, t('mdHands')),
        h('span', { className: 'nm-row-sub nm-wrap' }, handsSub)),
      hands.length ? select('hands', hands, view.hands) : null),
    error ? h('div', { style: { ...errorStyle, padding: '0 14px 10px' } }, error) : null)
}

const heading: Record<string, string | number> = { fontSize: 14, fontWeight: 600, margin: '8px 0 0' }

/**
 * Settings → Account: *Ways on* — the account's row first while signed in, then the catalogue
 * in its groups — and the two pickers, with the gate's sentences for what nothing covers yet.
 */
export function OwnKeyPanel({ t, onChanged }: { t: Translate; onChanged?(): void }): ReactNode {
  const { view, error, reload } = useProviders(t)
  const changed = useCallback(() => { reload(); onChanged?.() }, [reload, onChanged])
  if (error) return h('div', { style: errorStyle }, error)
  if (!view) return h('div', { style: muted }, t('loading'))
  return h('div', { 'data-testid': 'nm-ownkey-panel', style: { display: 'flex', flexDirection: 'column', gap: 12 } },
    h('h3', { style: heading }, t('ownKeyPickers')),
    h('div', { style: muted }, t('ownKeyPickersSub')),
    h(ModelPickers, { t, view, onChanged: changed }),
    h(UnavailableLine, { t, view, capability: 'image' }),
    h(UnavailableLine, { t, view, capability: 'video' }),
    h('h3', { style: heading }, t('ownKeyWaysTitle')),
    h('div', { style: muted }, t('ownKeySub')),
    h(WaysOnRows, { t, view, onChanged: changed }))
}

/**
 * The first run's own-key step (step 4, *Choose models*): the region's first group with the
 * ChatGPT row, *More ways* for the rest; the caller draws *Continue* once `onDone` says the
 * step is done and keeps *Skip for now* until then.
 */
export function OwnKeyStep({ t, onDone }: { t: Translate; onDone(done: boolean): void }): ReactNode {
  const { view, error, reload } = useProviders(t)
  const [more, setMore] = useState(false)
  const done = view ? ownKeyStepDone(view) : false
  useEffect(() => { onDone(done) }, [done, onDone])
  if (error) return h('div', { style: errorStyle }, error)
  if (!view) return h('div', { style: muted }, t('loading'))
  const groups: Group[] = more ? ['first', 'signIn', 'rest', 'local', 'custom'] : ['first', 'signIn']
  return h('div', { className: 'nm-ob-card nm-ownkey-step', 'data-testid': 'nm-ownkey-step', style: { textAlign: 'left', width: '100%', padding: '4px 14px 12px' } },
    h(WaysOnRows, { t, view, groups, onChanged: reload }),
    more ? null : h('div', { style: { marginTop: 10 } }, h('button', { type: 'button', className: 'nm-ob-link nm-inline', onClick: () => setMore(true) }, t('ownKeyMoreWays'))))
}
