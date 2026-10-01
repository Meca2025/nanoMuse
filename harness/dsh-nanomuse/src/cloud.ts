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
 * The browser half (`client/CloudSection.tsx`) drives this through a small
 * loopback HTTP API under `/nanomuse/cloud/*`, registered when the web server
 * is present; the headless and SDK profiles get the service without routes.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { Relay, RelayError, type Account, type RelayModel } from './relay.ts'

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
  baseURL: string
  account?: Account
  models: RelayModel[]
  /** The last relay failure, for the card to show. */
  error?: { code: string; message: string }
}

interface State {
  account?: Account
  models?: RelayModel[]
}

export default class NanomuseCloud extends Service {
  static inject = ['credentials', 'settings']
  static Config = Config

  private readonly relay: Relay
  private state: State = {}
  private busy: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'nanomuseCloud')
    this.relay = new Relay(config.baseURL)
  }

  async [Service.init](): Promise<void> {
    this.state = await this.readState()
    this.ctx.inject(['webServer'], (ctx) => {
      ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: this.handle }), 'nanomuse cloud: api')
    })
    if (this.state.account && (await this.token())) {
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

  async status(): Promise<CloudStatus> {
    const token = await this.token()
    return {
      signedIn: Boolean(token && this.state.account),
      baseURL: this.relay.origin,
      ...(this.state.account ? { account: this.state.account } : {}),
      models: this.state.models ?? [],
    }
  }

  /** Step one: a code to the phone or the mailbox. */
  async requestCode(identifier: string): Promise<void> {
    await this.relay.requestCode(identifier.trim())
  }

  /** Step two: the code for the key; wires the provider and remembers the account. */
  verify(identifier: string, code: string): Promise<CloudStatus> {
    return this.serialize(async () => {
      const signIn = await this.relay.verify(identifier.trim(), code, this.deviceName())
      await this.ctx.credentials.set(credentialRef(TOKEN_REF), signIn.apiKey)
      const models = await this.relay.models(signIn.apiKey)
      await this.writeProvider(models)
      this.state = { account: signIn.account, models }
      await this.writeState()
      this.ctx.logger.info('nanomuse cloud: signed in as %s (%s)', signIn.account.hint, signIn.account.channel)
      return this.status()
    })
  }

  /** Pull the account and the model list again; a retired key signs out. */
  refresh(): Promise<CloudStatus> {
    return this.serialize(async () => {
      const token = await this.token()
      if (!token) return this.status()
      try {
        const [account, models] = await Promise.all([this.relay.me(token), this.relay.models(token)])
        if (!sameModels(models, this.state.models ?? [])) await this.writeProvider(models)
        this.state = { account, models }
        await this.writeState()
      } catch (error: unknown) {
        if (error instanceof RelayError && error.status === 401) {
          await this.forget()
          return { ...(await this.status()), error: { code: error.code, message: error.message } }
        }
        throw error
      }
      return this.status()
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

  private async forget(): Promise<void> {
    await this.ctx.credentials.unset(credentialRef(TOKEN_REF))
    try {
      await this.ctx.settings.mutate(LLM_ROW, [{ op: 'unset', path: ['providers', PROVIDER_ID] }])
    } catch (error: unknown) {
      // The row may never have had the provider (a sign-in that failed half-way).
      this.ctx.logger.debug('nanomuse cloud: provider row not removed: %s', message(error))
    }
    this.state = {}
    await this.writeState()
  }

  // -- state ----------------------------------------------------------------------------

  private async token(): Promise<string | undefined> {
    return (await this.ctx.credentials.resolve(credentialRef(TOKEN_REF)))?.value
  }

  private deviceName(): string {
    return this.config.deviceName || hostname() || 'desktop'
  }

  private statePath(): string {
    return this.config.statePath || join(dshHome(), 'nanomuse', 'cloud.json')
  }

  private async readState(): Promise<State> {
    try {
      const raw = JSON.parse(await readFile(this.statePath(), 'utf8')) as State
      return { ...(raw.account ? { account: raw.account } : {}), ...(raw.models ? { models: raw.models } : {}) }
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

  private readonly handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    if (!sameOrigin(req)) return send(res, 403, { error: { code: 'forbidden', message: 'Same-origin requests only' } })
    try {
      if (req.method === 'GET' && route === '/status') return send(res, 200, await this.status())
      if (req.method === 'POST' && route === '/code') {
        const body = await json(req)
        await this.requestCode(String(body.identifier ?? ''))
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/verify') {
        const body = await json(req)
        return send(res, 200, await this.verify(String(body.identifier ?? ''), String(body.code ?? '')))
      }
      if (req.method === 'POST' && route === '/refresh') return send(res, 200, await this.refresh())
      if (req.method === 'POST' && route === '/sign-out') return send(res, 200, await this.signOut())
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
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false
  if (typeof origin !== 'string') return true
  const host = req.headers.host
  return typeof host === 'string' && (origin === `http://${host}` || origin === `https://${host}`)
}

async function json(req: IncomingMessage): Promise<Record<string, unknown>> {
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

function send(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status, { 'cache-control': 'no-store' }).end()
    return
  }
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
