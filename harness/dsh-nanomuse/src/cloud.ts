/**
 * nanoMuse Cloud for the harness: `ctx.nanomuseCloud`.
 *
 * One account, every device. A person signs in with a mainland phone number or
 * an e-mail and a six-digit code; the relay answers with this device's key.
 * The key goes to the harness credential store (`NANOMUSE_CLOUD_TOKEN`), and the
 * account's models are written into the profile's `llm-pi-ai` row as the
 * `nanomuse` provider — the same two writes the Models page makes for any
 * OpenAI-compatible gateway — so the harness's own adapter talks to the relay
 * and the models appear in the picker. Nothing of ours sits in the model path.
 *
 * Signed in, this computer is also a device of the account:
 *
 * - the **profile** (`profile.ts`): the agent's name and face come from the
 *   account and follow the phone's avatar studio;
 * - the **hub** (`hub.ts`): one socket to `/v1/hub`, so the phone lists this
 *   computer, this computer's Muse reaches the phone (`reach.ts`), a `notify`
 *   from another device shows here, and — with *remote control* on, as it is
 *   by default — the phone runs things here (`actions.ts`);
 * - the **hands tracker**: every Hands or Reach tool call in flight, so the
 *   browser half can draw the capsule the Android app draws while it works.
 *
 * The browser half (`client/`) drives all of this through a small loopback HTTP
 * API under `/nanomuse/cloud/*` — plain JSON plus one server-sent-events stream
 * (`/events`) carrying the live state — registered when the web server is
 * present; the headless and SDK profiles get the service without routes.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { arch, homedir, hostname, release, type, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { brief, REMOTE_ACTIONS, run as runAction, type RemoteAction } from './actions.ts'
import { HubClient, HubError, type HubDevice } from './hub.ts'
import { ProfileStore, type Profile } from './profile.ts'
import { Relay, RelayError, type Account, type Invite, type ProfileWrite, type RelayModel, type SignIn } from './relay.ts'
import { TaskRunner } from './task.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    nanomuseCloud: NanomuseCloud
  }
}

/** The credential reference the `nanomuse` provider row names. */
export const TOKEN_REF = 'NANOMUSE_CLOUD_TOKEN'
/** The provider id inside `llm-pi-ai`; permanent, sessions record it. */
export const PROVIDER_ID = 'nanomuse'
/** The profile row the Models page edits too. */
export const LLM_ROW = 'llm-pi-ai'
/** Where the browser half talks to us. */
export const API_PREFIX = '/nanomuse/cloud'
/** What this device reports as its software. */
export const VERSION = `dsh-nanomuse ${process.env.NANOMUSE_VERSION ?? '0.0.0'}`
/** The hub actions this computer answers whatever the remote-control switch says (`docs/hub.md`). */
export const ACTIONS = ['info', 'notify']
/** Incoming actions worth a toast — the ones that act or look, not a folder listing. */
const TOAST_ACTIONS = new Set(['shell', 'file.get', 'file.put', 'open', 'screen'])

export interface Config {
  /** The relay origin. */
  baseURL: string
  /** How this device introduces itself to the account's device list. */
  deviceName: string
  /** Where the account snapshot lives (`$DSH_HOME/nanomuse/cloud.json` by default). */
  statePath: string
}

export const Config: z<Config> = z.object({
  baseURL: z.string().default('https://cloud.nanomuse.cn').description('The nanoMuse Cloud relay.'),
  deviceName: z.string().default('').description('This device in the account\'s device list; empty means the host name.'),
  statePath: z.string().default('').description('Account snapshot file; empty means $DSH_HOME/nanomuse/cloud.json.'),
})

/** What the UI shows; never the key. */
export interface CloudStatus {
  signedIn: boolean
  /** A model can answer: the account's, or a key the person entered in Models. */
  ready: boolean
  baseURL: string
  account?: Account
  models: RelayModel[]
  profile: Profile
  hub: HubState
  /** The last relay failure, for the card to show. */
  error?: { code: string; message: string }
}

export interface HubState {
  connected: boolean
  deviceId: string
  deviceName: string
  /** Whether other devices may run things here (`shell`, `files`, `open`, `screen`…); `info` and `notify` always work. */
  remoteControl: boolean
  lastError?: string
  devices: HubDevice[]
}

/** One Hands or Reach tool call in flight. */
export interface HandsCall {
  id: string
  name: string
  /** The few arguments the capsule reads: action, label, text, device, command, task. */
  args: Record<string, string>
  sessionId: string
  since: number
}

/** A `notify` from another device, or something another device did here — shown as a toast. */
export interface Notice {
  id: number
  /** `notify`: words for the person; `call`: `action` ran here on `from`'s behalf. */
  kind: 'notify' | 'call'
  from: string
  title: string
  text: string
  action?: string
  at: number
}

/** The live state the browser half mirrors over `/events`. */
export interface LiveState {
  cloud: { signedIn: boolean; hint: string }
  profile: Profile
  hub: HubState
  hands: { calls: HandsCall[]; steps: number }
  notices: Notice[]
}

interface State {
  account?: Account
  models?: RelayModel[]
  deviceId?: string
  deviceName?: string
  /** Absent means on — the runtime's default too. */
  remoteControl?: boolean
  /** The session each other device's conversation lives in (`<device id>\n<conversation>` → session id). */
  taskSessions?: Record<string, string>
}

/** Tool names whose calls the capsule follows. */
export function isHandsTool(name: string): boolean {
  return name.startsWith('mcp__nanomuse__') || name === 'devices' || name.startsWith('device_') || name === 'delegate'
}

const ARG_KEYS = ['action', 'label', 'text', 'device', 'command', 'task', 'path', 'url'] as const

export default class NanomuseCloud extends Service {
  static inject = ['credentials', 'settings']
  static Config = Config

  readonly relay: Relay
  readonly profile: ProfileStore
  readonly hub: HubClient
  private state: State = {}
  private busy: Promise<unknown> = Promise.resolve()
  private readonly streams = new Set<ServerResponse>()
  private readonly changeListeners = new Set<() => void>()
  private readonly calls = new Map<string, HandsCall>()
  private steps = 0
  private lastCallAt = 0
  private notices: Notice[] = []
  private noticeSeq = 0
  private signedInCache = false
  /** Tasks from other devices, once the session API is up. */
  private tasks: TaskRunner | undefined

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'nanomuseCloud')
    this.relay = new Relay(config.baseURL)
    this.profile = new ProfileStore(this.dir(), this.relay)
    this.hub = new HubClient({
      url: this.relay.hubURL,
      key: () => this.token(),
      device: () => ({
        id: this.state.deviceId ?? '',
        name: this.deviceName(),
        kind: 'computer',
        os: `${type()} ${release()}`.trim(),
        version: VERSION,
        actions: this.actions(),
      }),
      log: (level, text) => this.ctx.logger[level](text),
    })
  }

  async [Service.init](): Promise<void> {
    this.state = await this.readState()
    if (!this.state.deviceId) {
      this.state.deviceId = `pc-dsh-${randomBytes(6).toString('hex')}`
      await this.writeState()
    }
    await this.profile.load()
    this.profile.onChange(() => this.broadcast())
    this.hub.onState(() => this.broadcast())
    this.hub.onDevices(() => this.broadcast())
    this.hub.onProfile(() => void this.pullProfile().catch((error: unknown) => this.ctx.logger.warn('nanomuse: profile pull failed: %s', message(error))))
    this.hub.onUnauthorized(() => void this.serialize(() => this.forget()).catch(() => undefined))
    this.hub.handle('info', async () => ({
      name: this.deviceName(),
      kind: 'computer',
      os: type(),
      os_version: release(),
      arch: arch(),
      user: userInfo().username,
      home: homedir(),
      cwd: process.cwd(),
      runtime: VERSION,
      actions: this.actions(),
    }))
    this.hub.handle('notify', async (args, call) => {
      this.notice('notify', call.from.name || 'a device', String(args.title ?? ''), String(args.text ?? ''))
      return { ok: true, shown: true }
    })
    for (const action of REMOTE_ACTIONS) {
      this.hub.handle(action, (args, call) => this.remote(action, args, call.from.name || 'a device'))
    }
    // A task from another device runs in a dsh session here; needs the session API, so only once it is up.
    this.ctx.inject(['sessionController', 'approval'], (ctx) => {
      const runner = new TaskRunner(ctx, {
        deviceName: () => this.deviceName(),
        log: (level, text) => this.ctx.logger[level](text),
        notice: (from, text) => this.notice('call', from, '', text, 'task'),
        recall: (key) => this.state.taskSessions?.[key],
        remember: (key, sessionId) => {
          this.state.taskSessions = { ...this.state.taskSessions, [key]: sessionId }
          void this.writeState().catch((error: unknown) => this.ctx.logger.warn('nanomuse: state write failed: %s', message(error)))
        },
      })
      this.tasks = runner
      ctx.effect(() => runner.attach(), 'nanomuse cloud: tasks')
      ctx.effect(
        () =>
          this.hub.handle('task', (args, call) => {
            if (!this.remoteControl) throw new HubError('not_allowed', `${this.deviceName()} is set not to be operated from other devices`)
            return runner.task(args, call)
          }),
        'nanomuse cloud: task',
      )
      ctx.effect(() => this.hub.handle('stop', (args, call) => runner.stop(args, call)), 'nanomuse cloud: stop')
      ctx.effect(() => this.hub.handle('approve', (args) => runner.approve(args)), 'nanomuse cloud: approve')
      ctx.effect(() => () => {
        this.tasks = undefined
      }, 'nanomuse cloud: tasks off')
      if (this.hub.connected) this.hub.restart()
    })

    this.ctx.inject(['webServer'], (ctx) => {
      ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: this.handle }), 'nanomuse cloud: api')
    })
    this.ctx.inject(['tools'], (ctx) => {
      ctx.on('tools/execute', async (exec, next) => {
        if (!isHandsTool(exec.name)) return next()
        this.began(exec.callId, exec.name, exec.arguments, exec.agent?.session.id ?? '')
        try {
          return await next()
        } finally {
          this.ended(exec.callId)
        }
      })
    })
    this.ctx.effect(() => () => {
      this.hub.stop('shutting down')
      for (const res of this.streams) res.end()
      this.streams.clear()
    }, 'nanomuse cloud: hub')

    if (this.state.account && (await this.token())) {
      this.signedInCache = true
      this.hub.start()
      // Refresh what the account looks like, quietly; the key may have been retired elsewhere.
      void this.refresh().catch((error: unknown) => {
        this.ctx.logger.warn('nanomuse cloud: could not refresh the account: %s', message(error))
      })
    }
  }

  /** The relay this service talks to. */
  get baseURL(): string {
    return this.relay.origin
  }

  /** Signed in, as far as the last check went (no credential read). */
  get signedIn(): boolean {
    return this.signedInCache
  }

  async status(): Promise<CloudStatus> {
    const token = await this.token()
    const signedIn = Boolean(token && this.state.account)
    this.signedInCache = signedIn
    return {
      signedIn,
      ready: signedIn || (await this.otherProviderReady()),
      baseURL: this.relay.origin,
      ...(this.state.account ? { account: this.state.account } : {}),
      models: this.state.models ?? [],
      profile: this.profile.current(),
      hub: this.hubState(),
    }
  }

  /** The live state, as `/events` streams it. */
  live(): LiveState {
    const account = this.state.account
    return {
      cloud: { signedIn: this.signedInCache && Boolean(account), hint: account?.hint ?? '' },
      profile: this.profile.current(),
      hub: this.hubState(),
      hands: { calls: [...this.calls.values()], steps: this.steps },
      notices: this.notices,
    }
  }

  /** Step one: a code to the phone or the mailbox. */
  async requestCode(identifier: string): Promise<void> {
    await this.serialize(() => this.relay.requestCode(identifier.trim()))
  }

  /** Step two: the code for the key; wires the provider and remembers the account. */
  verify(identifier: string, code: string): Promise<CloudStatus> {
    return this.serialize(async () => this.adopt(await this.relay.verify(identifier.trim(), code, this.deviceName())))
  }

  /** The other way in: the account's password instead of a code. */
  login(identifier: string, password: string): Promise<CloudStatus> {
    return this.serialize(async () => this.adopt(await this.relay.login(identifier.trim(), password, this.deviceName())))
  }

  /** A fresh key from either way in: wire the provider, remember the account, wear its look. */
  private async adopt(signIn: SignIn): Promise<CloudStatus> {
    await this.ctx.credentials.set(credentialRef(TOKEN_REF), signIn.apiKey)
    const models = await this.relay.models(signIn.apiKey)
    await this.writeProvider(models)
    await this.adoptDefaultModel(models)
    this.state = { ...this.state, account: signIn.account, models }
    await this.writeState()
    this.signedInCache = true
    this.ctx.logger.info('nanomuse cloud: signed in as %s (%s)', signIn.account.hint, signIn.account.channel)
    await this.profile.pull(signIn.apiKey, true).catch((error: unknown) => this.ctx.logger.warn('nanomuse: profile pull failed: %s', message(error)))
    this.hub.restart()
    this.broadcast()
    return this.status()
  }

  /** The account's invite code and link; nothing without an account. */
  async invite(): Promise<Invite | undefined> {
    const token = await this.token()
    if (!token || !this.state.account) return undefined
    return this.relay.invite(token)
  }

  /**
   * Rename the agent, or give it an emoji face, for every device of the account:
   * written to the relay, worn here at once (the other devices hear the hub's
   * `profile` frame and pull). A drawn face keeps its pictures when only the
   * name moves.
   */
  writeProfile(patch: { name?: string; avatar?: 'dragon' | 'emoji'; emoji?: string; color?: string }): Promise<Profile> {
    return this.serialize(async () => {
      const token = await this.token()
      const current = this.profile.current()
      const name = (patch.name ?? current.name).trim().slice(0, 60) || current.name || 'nanoMuse'
      const avatar = patch.avatar ?? current.avatar
      const write: ProfileWrite = {
        name,
        avatar,
        emoji: avatar === 'emoji' ? (patch.emoji ?? current.emoji ?? '').slice(0, 16) || '✨' : '',
        color: avatar === 'emoji' ? (patch.color ?? current.color) || '#0064d4' : '',
        style: current.style,
        description: current.description,
      }
      if (token && this.state.account) {
        const rev = await this.relay.putProfile(token, write, this.deviceName())
        await this.profile.pull(token, true).catch(() => this.profile.wearLocal({ ...current, ...write, rev }))
      } else {
        await this.profile.wearLocal({ ...current, ...write, rev: current.rev })
      }
      this.broadcast()
      return this.profile.current()
    })
  }

  /** Pull the account and the model list again; a retired key signs out. */
  refresh(): Promise<CloudStatus> {
    return this.serialize(async () => {
      const token = await this.token()
      if (!token) return this.status()
      try {
        const [account, models] = await Promise.all([this.relay.me(token), this.relay.models(token)])
        // The row is rewritten when the menu changed — and when it is simply not there: a profile
        // made again around an account that is still signed in has the credential but no row.
        if (!sameModels(models, this.state.models ?? []) || !this.providerPresent()) await this.writeProvider(models)
        await this.adoptDefaultModel(models)
        this.state = { ...this.state, account, models }
        await this.writeState()
        await this.profile.pull(token).catch((error: unknown) => this.ctx.logger.warn('nanomuse: profile pull failed: %s', message(error)))
        if (!this.hub.connected) this.hub.start()
      } catch (error: unknown) {
        if (error instanceof RelayError && error.status === 401) {
          await this.forget()
          return { ...(await this.status()), error: { code: error.code, message: error.message } }
        }
        throw error
      }
      this.broadcast()
      return this.status()
    })
  }

  /** Data controls: flip the switch on the relay and keep the account row current. */
  setContribute(on: boolean): Promise<CloudStatus> {
    return this.serialize(async () => {
      const token = await this.token()
      if (!token || !this.state.account) return this.status()
      const contribute = await this.relay.setContribute(token, on)
      this.state = { ...this.state, account: { ...this.state.account, contribute } }
      await this.writeState()
      return this.status()
    })
  }

  /** Data controls: delete what the relay kept; the count goes to zero. */
  deleteSamples(): Promise<CloudStatus & { deleted: number }> {
    return this.serialize(async () => {
      const token = await this.token()
      if (!token || !this.state.account) return { ...(await this.status()), deleted: 0 }
      const deleted = await this.relay.deleteSamples(token)
      const previous = this.state.account.contribute
      if (previous) {
        this.state = { ...this.state, account: { ...this.state.account, contribute: { ...previous, samples: 0 } } }
        await this.writeState()
      }
      return { ...(await this.status()), deleted }
    })
  }

  /** Retire this device's key and take the provider out of the picker. */
  signOut(): Promise<CloudStatus> {
    return this.serialize(async () => {
      const token = await this.token()
      if (token) {
        try {
          await this.relay.signOut(token)
        } catch (error: unknown) {
          this.ctx.logger.warn('nanomuse cloud: the relay did not take the sign-out: %s', message(error))
        }
      }
      await this.forget()
      return this.status()
    })
  }

  /** Fetch the account's look now (a `profile` frame, or the person asked). */
  async pullProfile(force = false): Promise<Profile> {
    const token = await this.token()
    if (token) await this.profile.pull(token, force)
    return this.profile.current()
  }

  /** Rename this computer on the account's list (kept locally too, for the next hello). */
  async renameDevice(name: string): Promise<void> {
    const clean = name.trim().slice(0, 60)
    if (!clean) return
    this.state = { ...this.state, deviceName: clean }
    await this.writeState()
    this.hub.rename(clean)
    this.broadcast()
  }

  /** Whether other devices may run things here; `info` and `notify` always work. */
  get remoteControl(): boolean {
    return this.state.remoteControl !== false
  }

  /** Flip remote control; the hub hears the new action list in the next `hello`. */
  async setRemoteControl(on: boolean): Promise<void> {
    if (this.remoteControl === on) return
    this.state = { ...this.state, remoteControl: on }
    await this.writeState()
    this.ctx.logger.info('nanomuse: remote control %s', on ? 'on' : 'off')
    if (this.hub.connected) this.hub.restart()
    this.broadcast()
  }

  /** The current account key, for a plugin that speaks to the relay itself. */
  token(): Promise<string | undefined> {
    return this.ctx.credentials.resolve(credentialRef(TOKEN_REF)).then((r) => r?.value)
  }

  // -- the provider row -----------------------------------------------------------

  /** The `nanomuse` provider as the Models page would have written it. */
  providerRow(models: RelayModel[]): Record<string, unknown> {
    const chat = models.filter((m) => m.kind === 'chat')
    return {
      displayName: 'nanoMuse Cloud',
      api: 'openai-completions',
      baseURL: this.relay.openaiBase,
      apiKeyEnv: TOKEN_REF,
      models: chat.map((m) => ({
        id: m.id,
        displayName: m.name,
        input: m.inputModalities.includes('image') ? ['text', 'image'] : ['text'],
      })),
    }
  }

  private async writeProvider(models: RelayModel[]): Promise<void> {
    await this.ctx.settings.update(LLM_ROW, { providers: { [PROVIDER_ID]: this.providerRow(models) } })
  }

  /**
   * New sessions answer through the account when nothing else would: dsh's stock default is
   * DeepSeek's own provider, which has no key on a computer that signed in here instead. A
   * choice the person made (any other provider, or a DeepSeek key) is left alone.
   */
  private async adoptDefaultModel(models: RelayModel[]): Promise<void> {
    const chat = models.filter((m) => m.kind === 'chat')
    const pick = chat.find((m) => m.recommended) ?? chat[0]
    if (!pick) return
    const svc = (this.ctx as unknown as { get(name: string): unknown }).get('agentDefaultModel') as
      | { currentSelection(): { provider: string; model: string }; saveSelection(next: { provider: string; model: string }): Promise<void> }
      | undefined
    if (!svc) return
    try {
      const current = svc.currentSelection()
      if (current.provider === PROVIDER_ID) return
      if (current.provider !== 'deepseek-official' && current.provider !== 'deepseek-account') return
      if (await this.otherProviderReady()) return
      await svc.saveSelection({ provider: PROVIDER_ID, model: pick.id })
      this.ctx.logger.info('nanomuse cloud: new sessions answer through %s/%s', PROVIDER_ID, pick.id)
    } catch (error: unknown) {
      this.ctx.logger.warn('nanomuse cloud: could not make the account model the default: %s', message(error))
    }
  }

  private async forget(): Promise<void> {
    this.hub.stop('signed out')
    await this.ctx.credentials.unset(credentialRef(TOKEN_REF))
    try {
      await this.ctx.settings.mutate(LLM_ROW, [{ op: 'unset', path: ['providers', PROVIDER_ID] }])
    } catch (error: unknown) {
      // The row may never have had the provider (a sign-in that failed half-way).
      this.ctx.logger.debug('nanomuse cloud: provider row not removed: %s', message(error))
    }
    const { deviceId, deviceName, remoteControl } = this.state
    this.state = { ...(deviceId ? { deviceId } : {}), ...(deviceName ? { deviceName } : {}), ...(remoteControl === false ? { remoteControl } : {}) }
    this.signedInCache = false
    await this.writeState()
    await this.profile.reset()
    this.broadcast()
  }

  /** The providers the model layer knows right now. */
  private providers(): { id: string }[] {
    const llm = (this.ctx as unknown as { get(name: string): unknown }).get('llm') as { listProviders?: () => { id: string }[] } | undefined
    return llm?.listProviders?.() ?? []
  }

  /** Whether the `nanomuse` provider row is in the model layer (it lives in the profile's patch file). */
  private providerPresent(): boolean {
    return this.providers().some((p) => p.id === PROVIDER_ID)
  }

  /** Another model can answer without the account: a DeepSeek key, or a provider the person added. */
  private async otherProviderReady(): Promise<boolean> {
    try {
      if ((await this.ctx.credentials.resolve(credentialRef('DEEPSEEK_API_KEY')))?.value) return true
    } catch {
      // no credential store answer: assume nothing
    }
    return this.providers().some((p) => p.id !== 'deepseek-official' && p.id !== 'deepseek-account' && p.id !== PROVIDER_ID)
  }

  // -- hands and notices ----------------------------------------------------------------

  private began(callId: string, name: string, args: unknown, sessionId: string): void {
    const now = Date.now()
    if (now - this.lastCallAt > 60_000 && this.calls.size === 0) this.steps = 0
    this.lastCallAt = now
    this.steps += 1
    this.calls.set(callId, { id: callId, name, args: pickArgs(args), sessionId, since: now })
    this.broadcast()
  }

  private ended(callId: string): void {
    if (this.calls.delete(callId)) {
      this.lastCallAt = Date.now()
      this.broadcast()
    }
  }

  private notice(kind: Notice['kind'], from: string, title: string, text: string, action?: string): void {
    this.noticeSeq += 1
    this.notices = [
      ...this.notices.slice(-7),
      { id: this.noticeSeq, kind, from, title: title.slice(0, 80), text: text.slice(0, 500), ...(action ? { action } : {}), at: Date.now() },
    ]
    if (kind === 'notify') this.ctx.logger.info('nanomuse: notice from %s: %s', from, text.slice(0, 80))
    this.broadcast()
  }

  /** The actions this computer announces: always `info` and `notify`, the rest with remote control on. */
  private actions(): string[] {
    const out = [...ACTIONS]
    if (this.tasks) out.push('approve')
    if (this.remoteControl) {
      out.push(...REMOTE_ACTIONS)
      if (this.tasks) out.push('task', 'stop')
    }
    return out
  }

  /** Another device running something here (`docs/hub.md`: the asker judged it; here the switch decides). */
  private async remote(action: RemoteAction, args: Record<string, unknown>, from: string): Promise<Record<string, unknown>> {
    if (!this.remoteControl) throw new HubError('not_allowed', `${this.deviceName()} is set not to be operated from other devices`)
    const summary = brief(action, args)
    this.ctx.logger.info('nanomuse: %s asked %s here%s', from, action, summary ? `: ${summary}` : '')
    const body = await runAction(action, args)
    // Only what actually happened is worth a toast; a refused path is the asker's error to see.
    if (TOAST_ACTIONS.has(action)) this.notice('call', from, '', summary, action)
    return body
  }

  // -- state ----------------------------------------------------------------------------

  private hubState(): HubState {
    return {
      connected: this.hub.connected,
      deviceId: this.state.deviceId ?? '',
      deviceName: this.deviceName(),
      remoteControl: this.remoteControl,
      ...(this.hub.lastError ? { lastError: this.hub.lastError } : {}),
      devices: this.hub.devices,
    }
  }

  private deviceName(): string {
    return this.state.deviceName || this.config.deviceName || hostname() || 'desktop'
  }

  private dir(): string {
    return this.config.statePath ? dirname(this.config.statePath) : join(dshHome(), 'nanomuse')
  }

  private statePath(): string {
    return this.config.statePath || join(this.dir(), 'cloud.json')
  }

  private async readState(): Promise<State> {
    try {
      const raw = JSON.parse(await readFile(this.statePath(), 'utf8')) as State
      return {
        ...(raw.account ? { account: raw.account } : {}),
        ...(raw.models ? { models: raw.models } : {}),
        ...(typeof raw.deviceId === 'string' && raw.deviceId ? { deviceId: raw.deviceId } : {}),
        ...(typeof raw.deviceName === 'string' && raw.deviceName ? { deviceName: raw.deviceName } : {}),
        ...(raw.remoteControl === false ? { remoteControl: false } : {}),
        ...(raw.taskSessions && typeof raw.taskSessions === 'object' ? { taskSessions: raw.taskSessions } : {}),
      }
    } catch {
      return {}
    }
  }

  private async writeState(): Promise<void> {
    const path = this.statePath()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(this.state, null, 2) + '\n', { mode: 0o600 })
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.busy.then(work, work)
    this.busy = next.catch(() => undefined)
    return next
  }

  // -- the loopback API -------------------------------------------------------------

  /** Called whenever the live state changes (sign-in, profile, hub, devices); for other services. */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener)
    return () => {
      this.changeListeners.delete(listener)
    }
  }

  private broadcast(): void {
    for (const listener of this.changeListeners) {
      try {
        listener()
      } catch {
        // a listener's problem is not ours
      }
    }
    if (this.streams.size === 0) return
    const data = `data: ${JSON.stringify(this.live())}\n\n`
    for (const res of this.streams) {
      try {
        res.write(data)
      } catch {
        this.streams.delete(res)
      }
    }
  }

  private stream(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    res.write(`retry: 2000\ndata: ${JSON.stringify(this.live())}\n\n`)
    this.streams.add(res)
    const beat = setInterval(() => {
      try {
        res.write(': beat\n\n')
      } catch {
        // closed below
      }
    }, 20_000)
    const done = () => {
      clearInterval(beat)
      this.streams.delete(res)
    }
    req.on('close', done)
    res.on('close', done)
  }

  private readonly handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    if (!sameOrigin(req)) return send(res, 403, { error: { code: 'forbidden', message: 'Same-origin requests only' } })
    try {
      if (req.method === 'GET' && route === '/status') return send(res, 200, await this.status())
      if (req.method === 'GET' && route === '/events') return this.stream(req, res)
      if (req.method === 'GET' && route === '/live') return send(res, 200, this.live())
      if (req.method === 'POST' && route === '/code') {
        const body = await json(req)
        await this.requestCode(String(body.identifier ?? ''))
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/verify') {
        const body = await json(req)
        return send(res, 200, await this.verify(String(body.identifier ?? ''), String(body.code ?? '')))
      }
      if (req.method === 'POST' && route === '/login') {
        const body = await json(req)
        return send(res, 200, await this.login(String(body.identifier ?? ''), String(body.password ?? '')))
      }
      if (req.method === 'GET' && route === '/invite') {
        const invite = await this.invite()
        return invite ? send(res, 200, invite) : send(res, 404, { error: { code: 'signed_out', message: 'Sign in first' } })
      }
      if (req.method === 'POST' && route === '/profile') {
        const body = await json(req)
        const patch: Parameters<typeof this.writeProfile>[0] = {}
        if (typeof body.name === 'string') patch.name = body.name
        if (body.avatar === 'dragon' || body.avatar === 'emoji') patch.avatar = body.avatar
        if (typeof body.emoji === 'string') patch.emoji = body.emoji
        if (typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)) patch.color = body.color
        return send(res, 200, await this.writeProfile(patch))
      }
      if (req.method === 'POST' && route === '/refresh') return send(res, 200, await this.refresh())
      if (req.method === 'POST' && route === '/sign-out') return send(res, 200, await this.signOut())
      if (req.method === 'POST' && route === '/data/contribute') {
        const body = await json(req)
        return send(res, 200, await this.setContribute(body.on !== false))
      }
      if (req.method === 'POST' && route === '/data/delete-samples') return send(res, 200, await this.deleteSamples())
      if (req.method === 'POST' && route === '/profile/refresh') return send(res, 200, await this.pullProfile(true))
      if (req.method === 'POST' && route === '/devices/refresh') {
        this.hub.refreshDevices()
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/devices/rename') {
        const body = await json(req)
        await this.renameDevice(String(body.name ?? ''))
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/devices/forget') {
        const body = await json(req)
        this.hub.forget(String(body.device_id ?? ''))
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/devices/remote-control') {
        const body = await json(req)
        await this.setRemoteControl(body.on !== false)
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/notices/clear') {
        this.notices = []
        this.broadcast()
        return send(res, 204)
      }
      return send(res, 404, { error: { code: 'not_found', message: `No ${req.method ?? ''} ${route}` } })
    } catch (error: unknown) {
      if (error instanceof RelayError) {
        return send(res, error.status >= 500 ? 502 : error.status, { error: { code: error.code, message: error.message } })
      }
      this.ctx.logger.warn('nanomuse cloud: %s %s failed: %s', req.method, route, message(error))
      return send(res, 500, { error: { code: 'internal', message: message(error) } })
    }
  }
}

/** `$DSH_HOME`, or `~/.dsh` — the same rule the launcher applies. */
export function dshHome(): string {
  const configured = process.env.DSH_HOME
  if (configured) return configured
  return join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.dsh')
}

/** The few arguments the capsule shows, as short strings. */
export function pickArgs(args: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!args || typeof args !== 'object') return out
  const record = args as Record<string, unknown>
  for (const key of ARG_KEYS) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) out[key] = value.replace(/\s+/g, ' ').trim().slice(0, 80)
    else if (typeof value === 'number') out[key] = String(value)
  }
  return out
}

function sameModels(a: RelayModel[], b: RelayModel[]): boolean {
  const key = (models: RelayModel[]) =>
    models
      .filter((m) => m.kind === 'chat')
      .map((m) => `${m.id}:${m.name}:${m.inputModalities.join(',')}`)
      .sort()
      .join('|')
  return key(a) === key(b)
}

/** A browser on another origin cannot sign this device in or out. */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false
  if (typeof origin !== 'string') return true
  const host = req.headers.host
  return typeof host === 'string' && (origin === `http://${host}` || origin === `https://${host}`)
}

/** The request body as an object; empty when there is none. */
export async function json(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > 64 * 1024) throw new RelayError(413, 'too_large', 'Request body too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    throw new RelayError(400, 'bad_json', 'The request body is not JSON')
  }
}

/** A JSON reply, or an empty one for 204. */
export function send(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status, { 'cache-control': 'no-store' }).end()
    return
  }
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
