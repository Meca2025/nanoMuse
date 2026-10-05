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
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ApprovalDesk, appOf, checkForUpdate, HoldDesk, modelFor, pickChatModel, pickHandsModel, sharedConnectors, takesImages, type Grant, type Hold, type HoldTool, type PendingApproval, type UpdateInfo } from './desk.ts'
import { arch, homedir, hostname, release, type, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import type { ToolDispatchExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { createUserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionCreateRequest } from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-user-approval'
import z from '@deepseek-ai/schemastery'
import { mountGuarded } from './admit.ts'
import { brief, REMOTE_ACTIONS, run as runAction, type RemoteAction } from './actions.ts'
import { HubClient, HubError, type Caller, type HubDevice } from './hub.ts'
import { ProfileStore, type Profile } from './profile.ts'
import { Relay, RelayError, type Account, type Estimate, type Invite, type ProfileWrite, type RelayModel, type SignIn } from './relay.ts'
import { TaskRunner, textOf } from './task.ts'
import { RemoteStore, SyncEngine, SyncRelay, type RemoteLine, type SessionInfo, type SessionLine, type SyncState } from './sync.ts'
import { AvatarMotion, ANIMATED, type MotionMood, type MotionView } from './motion.ts'
import { DEFAULT_VIDEO_MODEL, hostOf, KNOWN_DASHSCOPE_MODELS, looksLikeVideoModel, probe as probeVideoModel, speaksDashScope, type VideoEndpoint } from './video.ts'
import { checkMove, checkScreenshot, displayInfo, isBlack, runtimeInfo, type MoveCheck, type RuntimeInfo, type ScreenshotCheck } from './hands-check.ts'

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
/**
 * The image budget of one request through the relay (`dsh-llm-pi-ai` profile keys): the relay
 * refuses a body past 6 MiB (413 `too_large`), so the base64 images of a request are held to
 * 5 MiB — the oldest offloaded — and each image is scaled to 2 Mpx before it is encoded.
 * `requestImageMaxBytes` keeps dsh's default (1 MiB a picture).
 */
export const IMAGE_BUDGET = { maxRequestImageBytes: 5 * 1024 * 1024, requestImagePixelBudget: 2 * 1024 * 1024 } as const
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
  /** The account chat model new chats use; empty when another provider is the default. */
  chatModel: string
  /** The model the hands see the screen with; empty when the account has none. */
  handsModel: string
  profile: Profile
  hub: HubState
  /** The last relay failure, for the card to show. */
  error?: { code: string; message: string }
}

export interface HubState {
  connected: boolean
  deviceId: string
  deviceName: string
  /**
   * On: every device of the account may run things here (`shell`, `files`, `open`, `screen`, a task) without
   * asking. Off (the default): a device asks the person at this computer first — a card on this screen,
   * allowed once or always for that device. `info` and `notify` always work.
   */
  remoteControl: boolean
  /** Devices the person allowed without asking, while remote control is off. */
  trusted: TrustedDevice[]
  /** Questions from other devices waiting for an answer on this screen. */
  asks: Ask[]
  lastError?: string
  devices: HubDevice[]
}

export interface TrustedDevice {
  id: string
  name: string
  at: number
}

/** Another device wants to run something here; the person answers on this screen. */
export interface Ask {
  id: string
  from: string
  fromId: string
  action: string
  text: string
  at: number
}

export type AskAnswer = 'once' | 'always' | 'deny'

/** How long a question from another device waits on this screen (the hub call itself waits about as long). */
export const ASK_TIMEOUT_MS = 110_000

/**
 * The questions other devices are waiting on, and the person's answers. `ask` settles with the answer, or
 * `'timeout'` when nobody answered in time; `onChange` fires whenever the list changes (for the live state).
 */
export class AskDesk {
  private readonly pending = new Map<string, { ask: Ask; finish(answer: AskAnswer | 'timeout'): void }>()

  constructor(private readonly onChange: () => void = () => undefined) {}

  get list(): Ask[] {
    return [...this.pending.values()].map((p) => p.ask)
  }

  ask(from: Caller, action: string, text: string, timeoutMs = ASK_TIMEOUT_MS): Promise<AskAnswer | 'timeout'> {
    const ask: Ask = { id: `ask_${randomUUID().slice(0, 8)}`, from: from.name || 'a device', fromId: from.id, action, text, at: Date.now() }
    return new Promise((resolve) => {
      const finish = (answer: AskAnswer | 'timeout') => {
        clearTimeout(timer)
        this.pending.delete(ask.id)
        this.onChange()
        resolve(answer)
      }
      const timer = setTimeout(() => finish('timeout'), timeoutMs)
      this.pending.set(ask.id, { ask, finish })
      this.onChange()
    })
  }

  /** The person's answer; false when the question is no longer waiting. */
  answer(id: string, answer: AskAnswer): boolean {
    const p = this.pending.get(id)
    if (!p) return false
    p.finish(answer)
    return true
  }
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

/** The last thing the hands did, for the stage's caption and cursor marker. */
export interface StageAction {
  /** `click`, `type`, `key`, `scroll`, `drag`, `open_app`, `wait`, `look`… */
  kind: string
  label: string
  text: string
  /** Pixels of the frame the action was aimed at; -1 when it had no point. */
  x: number
  y: number
  at: number
}

/**
 * The Live stage: the latest screenshot the agent took while using a screen —
 * this computer's through the hands, or another device's through Reach — so
 * the person can watch it work. The bytes are served separately (`/stage/frame`).
 */
export interface StageState {
  /** 0 before any frame; grows with each new one (the frame URL's cache key). */
  seq: number
  at: number
  source: 'computer' | 'device'
  /** The other device's name; empty for this computer. */
  device: string
  width: number
  height: number
  /** What is in front on that screen, as the hands reported it. */
  title: string
  /** `window`: the hands drive one app's window and the pointer stays with the person (runtime 0.1.34); `screen` otherwise. */
  mode: 'screen' | 'window'
  action: StageAction | null
  sessionId: string
}

/** The live state the browser half mirrors over `/events`. */
export interface LiveState {
  cloud: { signedIn: boolean; hint: string }
  profile: Profile
  hub: HubState
  hands: { calls: HandsCall[]; steps: number }
  stage: StageState
  notices: Notice[]
  /** Questions the agent asked before a step, open right now (C2); the stage answers them too. */
  approvals: PendingApproval[]
  /** Pauses of the hands that are on (C1). */
  holds: Hold[]
  /** Standing "always allow" grants for the hands, per app. */
  grants: Grant[]
  /** The model the hands see the screen with (`[gui]` of the bundled runtime); empty when the account has none. */
  handsModel: string
  /** The last update check, when one ran. */
  update: UpdateInfo | null
  /** The face's clips: which exist (with a cache key) and how the drawing goes (desk-b). */
  motion: MotionView
  /** When the hands last saw an all-black screen (macOS: Screen Recording missing, or granted after the app started); 0 when they have not. */
  blackScreenAt: number
  /** Conversation sync (C8): `rev` moves with every change pulled or pushed; the session that is the account's main conversation. */
  sync: { rev: number; mainSession: string }
}

/** How long after the last hands call the stage keeps its frame. */
const STAGE_REST_MS = 10 * 60_000
/** Four candidates and four poses (the idle still is the candidate itself): what a new face costs. */
const STUDIO_PICTURES = 8

const NO_STAGE: StageState = { seq: 0, at: 0, source: 'computer', device: '', width: 0, height: 0, title: '', mode: 'screen', action: null, sessionId: '' }

interface State {
  account?: Account
  models?: RelayModel[]
  deviceId?: string
  deviceName?: string
  /** `true` lets every device of the account run things here without asking; absent or `false` means ask. */
  remoteControl?: boolean
  /** Devices allowed without asking (device id → name and when), while remote control is off. */
  trusted?: Record<string, { name: string; at: number }>
  /** The session each other device's conversation lives in (`<device id>\n<conversation>` → session id). */
  taskSessions?: Record<string, string>
  /** Conversations synced between the account's devices (C7, C8): the cursor, the ids, what the relay knows. */
  sync?: SyncState
  /** The hands model the person chose; absent means the account's default. */
  handsModel?: string
  /** "Always allow" given on the stage, per app. */
  grants?: Grant[]
  /** The last update check and when it ran, so the badge survives a restart and the check runs once a day. */
  update?: UpdateInfo
  /** Settings → Media (desk-b): the video model and whether a new face is animated. */
  media?: MediaState
}

/** The Media settings as stored. `videoModel` empty means the endpoint's default; `off` means no clips. */
export interface MediaState {
  videoModel?: string
  /** Absent means on. */
  animate?: boolean
  /** The last check of which video models the own key reaches: by host, with the models and when. */
  checked?: Record<string, { models: string[]; at: number }>
}

/** The `videoModel` value that means "no clips" (the phone's `VIDEO_OFF`). */
export const VIDEO_OFF = 'off'
/** How long a video-model check against a provider is trusted. */
const VIDEO_CHECK_TTL_MS = 24 * 60 * 60_000

/** What Settings → Media shows. */
export interface MediaView {
  /** The image model the account would draw with (Cloud), empty when signed out or none. */
  imageModel: string
  /** The video source: `cloud`, an own-key provider, or none. */
  video: { source: 'cloud' | 'provider' | 'none'; label: string; model: string; models: { id: string; name: string }[]; off: boolean; reason: string }
  animate: boolean
  motion: MotionView
}

/** One check a day, at most, by itself; the About row may ask any time. */
const UPDATE_EVERY_MS = 24 * 60 * 60_000

/** Tool names whose calls the capsule follows. */
export function isHandsTool(name: string): boolean {
  return name.startsWith('mcp__nanomuse__') || name === 'devices' || name.startsWith('device_') || name === 'delegate'
}

/** The trusted-device map as stored, dropping anything malformed. */
function trustedOf(raw: Record<string, unknown>): Record<string, { name: string; at: number }> {
  const out: Record<string, { name: string; at: number }> = {}
  for (const [id, v] of Object.entries(raw)) {
    if (!id || !v || typeof v !== 'object') continue
    const { name, at } = v as { name?: unknown; at?: unknown }
    out[id] = { name: typeof name === 'string' && name ? name : id, at: typeof at === 'number' ? at : 0 }
  }
  return out
}

/** The `confirmed` field of a hands call, when it is one (a ticket or the legacy `true`). */
export function confirmationOf(args: unknown): string | true | undefined {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined
  const value = (args as Record<string, unknown>).confirmed
  return value === true || typeof value === 'string' ? value : undefined
}

/** The confirmation ticket `nanomuse mcp` checks: HMAC-SHA256 over the compact, key-sorted arguments without `confirmed`. */
export function confirmTicket(secret: string, args: Record<string, unknown>): string {
  const clean = Object.fromEntries(Object.entries(args).filter(([k]) => k !== 'confirmed'))
  return createHmac('sha256', secret).update(canonical(clean)).digest('hex').slice(0, 32)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** The runtime's "Not done — …" refusal in an MCP error result, or `undefined` for any other failure. */
export function refusalOf(result: ToolExecutionResult): string | undefined {
  const texts: string[] = []
  for (const block of result.content ?? []) {
    const b = block as { type?: unknown; text?: unknown }
    if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
  }
  const message = (result.error as { message?: unknown } | undefined)?.message
  if (typeof message === 'string') texts.push(message)
  const hit = texts.find((t) => t.includes('Not done — '))
  if (!hit) return undefined
  const start = hit.indexOf('Not done — ')
  return hit.slice(start + 'Not done — '.length).trim()
}

/** Every text of a tool result's error, joined: what the runtime said went wrong. */
function errorText(result: ToolExecutionResult): string {
  const texts: string[] = []
  for (const block of result.content ?? []) {
    const b = block as { type?: unknown; text?: unknown }
    if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
  }
  const m = (result.error as { message?: unknown } | undefined)?.message
  if (typeof m === 'string') texts.push(m)
  return texts.join('\n')
}

function declined(step: string, why: string): ToolExecutionResult {
  const text = `Not done — ${step}. The person did not approve this step on their permission card (${why}); do not retry it. Ask them what to do instead, or carry on without it.`
  return { isError: true, error: { message: text, info: { name: 'HandsDeclined', code: 'REJECTED' } }, content: [{ type: 'text', text }] }
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
  /** Questions from other devices waiting on this screen. */
  private readonly asks = new AskDesk(() => this.broadcast())
  private noticeSeq = 0
  private stage: StageState = NO_STAGE
  private frame: { seq: number; bytes: Buffer; mime: string } | undefined
  private stageTimer: NodeJS.Timeout | undefined
  private signedInCache = false
  /** Tasks from other devices, once the session API is up. */
  private tasks: TaskRunner | undefined
  /** Conversations synced between the account's devices (contract C7), once the session API is up. */
  private sync: SyncEngine | undefined
  /** The other devices' turns kept for the transcript (C8), by session. */
  private kept: RemoteStore | undefined
  /**
   * What the sync needs of a session's log, read once per change: a session's log is read
   * in full (and decompressed) by `inspect`, so the title, the lines and the prompts'
   * positions are kept here until the session's next event (`session/event`) drops them.
   */
  private readonly logCache = new Map<string, { title?: { at: number; title: string }; lines?: SessionLine[]; prompts?: Array<{ key: string; time: number }> }>()
  /** Approvals the stage may answer (C2) and holds of the hands (C1). */
  private readonly approvalDesk = new ApprovalDesk(() => this.broadcast(), (req) => this.granted(req.toolName))
  private readonly holdDesk = new HoldDesk(() => this.broadcast())
  private updateCheck: Promise<UpdateInfo> | undefined
  private lastSharedConnectors = ''
  /** The face's clips (desk-b). */
  readonly motion: AvatarMotion
  private blackScreenAt = 0

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'nanomuseCloud')
    this.relay = new Relay(config.baseURL)
    this.profile = new ProfileStore(this.dir(), this.relay)
    this.motion = new AvatarMotion({
      dir: join(this.dir(), 'avatar', 'motion'),
      endpoint: () => this.videoEndpoint(),
      animate: () => this.state.media?.animate !== false,
      faceId: () => this.faceId(),
      still: (mood) => this.faceStill(mood),
      onChange: () => this.broadcast(),
      log: (level, text) => this.ctx.logger[level](text),
    })
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
    // The face's clips follow the face (C3): a face drawn here or pulled from the account drops the
    // old clips and, with the Media setting on and a video model at hand, is animated again.
    await this.motion.init().catch((error: unknown) => this.ctx.logger.warn('nanomuse: avatar clips not read: %s', message(error)))
    this.profile.onChange(() => void this.animateNewFace().catch((error: unknown) => this.ctx.logger.warn('nanomuse: avatar motion: %s', message(error))))
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
      this.hub.handle(action, (args, call) => this.remote(action, args, call.from))
    }
    // A task from another device runs in a dsh session here; needs the session API, so only once it is up.
    this.ctx.inject(['sessionController', 'approval'], (ctx) => {
      // The stage answers approvals too; registered before the task runner so a task from another
      // device (answered on that device) never reaches this desk.
      ctx.effect(() => ctx.on('approval/request', (req, next) => this.approvalDesk.handle(req, next), true), 'nanomuse cloud: approvals on the stage')
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
          this.hub.handle('task', async (args, call) => {
            await this.permit(call.from, 'task', brief('task', args))
            return runner.task(args, call)
          }),
        'nanomuse cloud: task',
      )
      ctx.effect(() => this.hub.handle('stop', (args, call) => runner.stop(args, call)), 'nanomuse cloud: stop')
      ctx.effect(() => this.hub.handle('approve', (args) => runner.approve(args)), 'nanomuse cloud: approve')
      ctx.effect(() => () => {
        this.tasks = undefined
      }, 'nanomuse cloud: tasks off')
      // The account's conversations, the same on every device (C7, C8): the person's words go up as
      // they are sent and the model's when the turn ends; the other devices' conversations are chats
      // here, their turns kept in the host's own store for the transcript and handed to the model as context.
      const kept = new RemoteStore(join(dshHome(), 'nanomuse', 'sync-remote.json'), (error) => this.ctx.logger.warn('nanomuse cloud: remote turns not saved: %s', message(error)))
      this.kept = kept
      const sync = new SyncEngine({
        relay: new SyncRelay(this.config.baseURL),
        sessions: {
          list: async () => {
            const { items } = await ctx.sessionController.list({}, new AbortController().signal)
            // The title comes from the list's own `title` projection when the host has one; only a
            // session without it (no title landed yet) is read, and that once per change: reading
            // every log on every push kept the host busy for seconds on a big account.
            const rows: SessionInfo[] = []
            for (const s of items) {
              if (s.parentSessionId || s.origin === 'subagent') continue
              const id = String(s.sessionId)
              const hint = s.projections?.values?.title
              const title = typeof hint === 'string' && hint ? hint : await this.sessionTitle(ctx, s.sessionId, s.updatedAt)
              rows.push({ id, title, blank: s.blank, createdAt: s.updatedAt, updatedAt: s.updatedAt })
            }
            return rows
          },
          lines: (sessionId) => this.sessionLines(ctx, sessionId),
          create: async (title) => {
            // In the home workspace (`~/nanoMuse`), as the first conversation is: a session the
            // browser cannot place in a workspace shows a disabled composer and no transcript.
            const folder = join(homedir(), 'nanoMuse')
            await mkdir(folder, { recursive: true }).catch(() => undefined)
            const registry = ctx.get('workspaceRegistry') as { create(path: string, title?: string): Promise<{ id: string }> } | undefined
            const workspaceId = await registry?.create(folder, 'nanoMuse').then((w) => w.id).catch(() => undefined)
            const created = await ctx.sessionController.create(
              workspaceId ? { agentPreset: 'nanomuse', workspaceId: workspaceId as NonNullable<SessionCreateRequest['workspaceId']> } : { agentPreset: 'nanomuse', cwd: folder },
            )
            await ctx.sessionController.rename({ sessionId: created.sessionId, title }).catch(() => undefined)
            return String(created.sessionId)
          },
          rename: async (sessionId, title) => {
            await ctx.sessionController.rename({ sessionId: sessionId as SessionId, title })
          },
          keep: async (sessionId, line) => kept.add(sessionId, line),
          forget: async (sessionId, mid) => kept.remove(sessionId, mid),
          inject: async (sessionId, text) => {
            const resolved = await ctx.sessionController.resolveAgent(sessionId as SessionId)
            if ('error' in resolved) throw new Error(String(resolved.error))
            // model-facing: a `nanomuse-sync` source, so the push (`sessionLines`, `user` sources only) never sends it back
            resolved.agent.inject(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'nanomuse-sync', role: 'user', mid: '', device: '', deviceName: '', at: Date.now() } }))
          },
        },
        token: () => this.token(),
        deviceId: () => this.state.deviceId ?? '',
        isTaskSession: (sessionId) => Object.values(this.state.taskSessions ?? {}).includes(sessionId),
        load: () => this.state.sync,
        save: async (state) => {
          this.state.sync = state
          await this.writeState()
        },
        onChange: () => this.broadcast(),
        log: (level, text) => this.ctx.logger[level](text),
      })
      this.sync = sync
      ctx.effect(
        () =>
          ctx.on('session/event', (session: Session, event: SessionEvent) => {
            // `session/title` is dsh-session-title's event (not a dependency here): matched by name
            const id = String(session.id)
            this.logChanged(id)
            if (event.type === 'turn/end') sync.turnEnded(id)
            else if (event.type === 'user/message' && (event.data as { source?: { kind?: string } }).source?.kind === 'user') sync.messageSent(id)
            else if ((event as { type: string }).type === 'session/title') sync.sessionRenamed(String(session.id))
          }),
        'nanomuse cloud: sync turns',
      )
      ctx.effect(() => this.hub.onSync((cursor, from) => sync.onFrame({ cursor, from })), 'nanomuse cloud: sync frame')
      ctx.effect(() => this.hub.onWorking((frame) => sync.onWorking(frame)), 'nanomuse cloud: working frame')
      if (this.state.account) sync.start()
      ctx.effect(() => () => {
        sync.stop()
        this.sync = undefined
        this.kept = undefined
        void kept.flush()
      }, 'nanomuse cloud: sync off')
      if (this.hub.connected) this.hub.restart()
    })

    mountGuarded(this.ctx, API_PREFIX, this.handle, 'nanomuse cloud: api')
    // The account's other devices see what is connected here (C3): on every change and at start.
    this.ctx.inject(['nanomuseConnectors'], (ctx) => {
      ctx.effect(() => ctx.nanomuseConnectors.onChange(() => void this.publishConnectors().catch((error: unknown) => this.ctx.logger.warn('nanomuse cloud: connectors not shared: %s', message(error)))), 'nanomuse cloud: share connectors')
      void this.publishConnectors().catch((error: unknown) => this.ctx.logger.warn('nanomuse cloud: connectors not shared: %s', message(error)))
    })
    this.ctx.inject(['tools'], (ctx) => {
      ctx.on('tools/execute', async (exec, next) => {
        if (!isHandsTool(exec.name)) return next()
        // Our own re-dispatch of a step the person just agreed to: the stage already follows the outer call.
        if (exec.parent !== undefined && confirmationOf(exec.arguments) !== undefined) return next()
        const sessionId = exec.agent?.session.id ?? ''
        // The agent hands the screen to the person (C1): a hold until they say Done, then a fresh look.
        if (exec.name === 'mcp__nanomuse__computer_act' && handOverOf(exec.arguments)) {
          const reason = handOverOf(exec.arguments) ?? ''
          this.began(exec.callId, exec.name, exec.arguments, sessionId)
          this.acted({ kind: 'hold', label: reason, text: reason, x: -1, y: -1, at: Date.now() }, sessionId)
          try {
            const hold = this.holdDesk.begin(sessionId, 'computer', 'agent', reason)
            const how = await this.holdDesk.wait(sessionId)
            if (how !== 'done') this.holdDesk.done(hold.id)
            const text = how === 'done' ? 'The person finished and handed the screen back.' : how === 'timeout' ? 'Nobody came back within ten minutes; the screen is yours again.' : 'The hand-over was cancelled.'
            return { isError: false, value: text, content: [{ type: 'text', text }] } as Awaited<ReturnType<typeof next>>
          } finally {
            this.ended(exec.callId)
          }
        }
        // While the person has the screen, the hands wait rather than fail.
        if (this.holdDesk.on(sessionId)) await this.holdDesk.wait(sessionId)
        this.began(exec.callId, exec.name, exec.arguments, sessionId)
        if (exec.name === 'mcp__nanomuse__computer_act') this.acted(stageAction(exec.arguments), sessionId)
        else if (exec.name === 'mcp__nanomuse__computer_screen') this.acted({ kind: 'look', label: '', text: '', x: -1, y: -1, at: Date.now() }, sessionId)
        try {
          let result = await next()
          if (exec.name === 'mcp__nanomuse__computer_act' && result.isError) {
            const refused = refusalOf(result)
            if (refused) result = await this.confirmStep(ctx, exec, refused, next)
          }
          if (exec.name.startsWith('mcp__nanomuse__computer_') && !result.isError) this.frameFromMcp(result.value, sessionId)
          // A black capture (macOS: Screen Recording missing for the app, or granted after it started) puts a relaunch notice up.
          if (exec.name.startsWith('mcp__nanomuse__computer_') && result.isError && isBlack(errorText(result))) this.sawBlackScreen()
          return result
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
    // Once a day, quietly: a newer release puts a badge on Settings and a row in the ••• menu.
    if (!this.state.update || Date.now() - this.state.update.checkedAt > UPDATE_EVERY_MS) {
      setTimeout(() => void this.update(false).catch(() => undefined), 15_000).unref?.()
    }
  }

  // ---- the update check (B5) -------------------------------------------------------

  /** The newest release against what runs here; cached a day unless `force`. */
  update(force: boolean): Promise<UpdateInfo> {
    const cached = this.state.update
    if (!force && cached && Date.now() - cached.checkedAt < UPDATE_EVERY_MS) return Promise.resolve(cached)
    if (this.updateCheck) return this.updateCheck
    this.updateCheck = checkForUpdate(VERSION)
      .then(async (info) => {
        this.state = { ...this.state, update: info }
        await this.writeState().catch(() => undefined)
        this.broadcast()
        return info
      })
      .finally(() => {
        this.updateCheck = undefined
      })
    return this.updateCheck
  }

  // ---- approvals and holds on the stage (C1, C2) -----------------------------------

  /** The stage's answer to a question the agent asked; false when it was answered already. */
  decideApproval(id: string, approved: boolean, scope: 'once' | 'conversation' | 'always'): boolean {
    const row = this.approvalDesk.list().find((a) => a.id === id)
    const ok = this.approvalDesk.decide(id, approved, scope)
    // "Always" on a hands step: the app in front is allowed from now on, until revoked on the Permissions page.
    if (ok && approved && scope === 'always' && row && isHandsTool(row.toolName)) {
      const app = appOf(this.stage.title)
      if (app) void this.grant(`computer_app:${app}`).catch((error: unknown) => this.ctx.logger.warn('nanomuse cloud: grant not kept: %s', message(error)))
    }
    return ok
  }

  /** Whether a standing grant covers a request right now: a hands step while the granted app is in front. */
  private granted(toolName: string): boolean {
    if (!isHandsTool(toolName) || !toolName.startsWith('mcp__nanomuse__')) return false
    const app = appOf(this.stage.title)
    return Boolean(app) && (this.state.grants ?? []).some((g) => g.target === `computer_app:${app}`)
  }

  private async grant(target: string): Promise<void> {
    const grants = (this.state.grants ?? []).filter((g) => g.target !== target)
    grants.push({ id: `g-${randomBytes(4).toString('hex')}`, target, at: Date.now() })
    this.state = { ...this.state, grants: grants.slice(-64) }
    await this.writeState()
    this.broadcast()
  }

  async revokeGrant(id: string): Promise<boolean> {
    const before = this.state.grants?.length ?? 0
    const grants = (this.state.grants ?? []).filter((g) => g.id !== id)
    if (grants.length === before) return false
    this.state = { ...this.state, grants }
    await this.writeState()
    this.broadcast()
    return true
  }

  /** The person takes the screen (`by: user`); the hands wait until `holdDone`. */
  takeHold(thread: string, tool: HoldTool, reason: string): Hold {
    return this.holdDesk.begin(thread, tool, 'user', reason)
  }

  holdDone(id: string): boolean {
    return this.holdDesk.done(id)
  }

  // ---- the hands model (C4) ----------------------------------------------------------

  /** The model the hands see the screen with: the person's choice, else the account's `gui` default. */
  handsModel(): string {
    const models = this.state.models ?? []
    const chosen = this.state.handsModel
    if (chosen && models.some((m) => m.id === chosen && modelFor(m).includes('gui'))) return chosen
    return pickHandsModel(models)?.id ?? ''
  }

  /** Choose the hands model; the bundled runtime reads it at its next start. */
  async setHandsModel(id: string): Promise<void> {
    const models = this.state.models ?? []
    if (id && !models.some((m) => m.id === id && modelFor(m).includes('gui'))) throw new RelayError(400, 'bad_model', 'Not a hands model of this account')
    this.state = { ...this.state, ...(id ? { handsModel: id } : {}) }
    if (!id) delete this.state.handsModel
    await this.writeState()
    await this.writeHands()
    this.broadcast()
  }

  /**
   * What the bundled runtime's `[gui]` gets: `$DSH_HOME/nanomuse/hands.json` with the relay's
   * OpenAI-style base, the hands model and the account key (0600, next to `cloud.json`, which
   * holds the same key). The preset reads it when it starts `nanomuse mcp`.
   */
  private async writeHands(): Promise<void> {
    const path = join(this.dir(), 'hands.json')
    const token = await this.token()
    const model = this.handsModel()
    if (!token || !this.state.account || !model) {
      await rm(path, { force: true }).catch(() => undefined)
      return
    }
    await mkdir(this.dir(), { recursive: true })
    await writeFile(path, JSON.stringify({ provider: 'openai', model, base_url: this.relay.openaiBase, api_key: token }, null, 2) + '\n', { mode: 0o600 })
  }

  // ---- connectors shared across devices (C3) ---------------------------------------

  /**
   * The `device` of a profile write: this device's stable id, as the hub's hello says it
   * (contract C3) — the relay replaces only the connectors whose `device_id` is the writer's
   * and refuses entries naming another device, so the two must be the same string.
   */
  private writerId(): string {
    return this.state.deviceId || this.deviceName()
  }

  /** Write this device's connections to the account's profile (ids, labels, where; never a credential). */
  private async publishConnectors(): Promise<void> {
    const connectors = (this.ctx as unknown as { get(name: string): unknown }).get('nanomuseConnectors') as { view(): { connections: Parameters<typeof sharedConnectors>[0] } } | undefined
    const token = await this.token()
    if (!connectors || !token || !this.state.account) return
    const rows = sharedConnectors(connectors.view().connections, this.deviceName(), this.state.deviceId ?? '')
    const key = JSON.stringify(rows.map(({ at: _at, ...rest }) => rest))
    if (key === this.lastSharedConnectors) return
    // Only the connectors: the relay keeps the look as it is for a write that carries nothing
    // else. (0.1.36 sent the look this device wore too, so a desktop that had just signed in,
    // still wearing the default, renamed the account's muse back to "nanoMuse" and took a drawn
    // face off every device before its first pull landed.)
    await this.relay.putConnectors(token, rows, this.state.deviceId ?? '', this.writerId())
    this.lastSharedConnectors = key
    await this.profile.pull(token, true).catch(() => undefined)
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
      chatModel: this.chatModel(),
      handsModel: this.handsModel(),
      profile: this.profile.current(),
      hub: this.hubState(),
    }
  }

  private defaultModelService(): { currentSelection(): { provider: string; model: string }; saveSelection(next: { provider: string; model: string }): Promise<void> } | undefined {
    return (this.ctx as unknown as { get(name: string): unknown }).get('agentDefaultModel') as ReturnType<NanomuseCloud['defaultModelService']>
  }

  /** The account model new chats answer through, when the default is ours; empty when another provider is chosen. */
  chatModel(): string {
    try {
      const current = this.defaultModelService()?.currentSelection()
      return current?.provider === PROVIDER_ID ? current.model : ''
    } catch {
      return ''
    }
  }

  /** Make an account chat model the default for new chats (Settings → Account → Chat model). */
  async setChatModel(id: string): Promise<void> {
    const models = this.state.models ?? []
    if (!models.some((m) => m.id === id && modelFor(m).includes('chat'))) throw new RelayError(400, 'bad_model', 'Not a chat model of this account')
    const svc = this.defaultModelService()
    if (!svc) throw new RelayError(503, 'no_models', 'Not available yet')
    await svc.saveSelection({ provider: PROVIDER_ID, model: id })
    this.broadcast()
  }

  /** The live state, as `/events` streams it. */
  live(): LiveState {
    const account = this.state.account
    return {
      cloud: { signedIn: this.signedInCache && Boolean(account), hint: account?.hint ?? '' },
      profile: this.profile.current(),
      hub: this.hubState(),
      hands: { calls: [...this.calls.values()], steps: this.steps },
      stage: this.stage,
      notices: this.notices,
      approvals: this.approvalDesk.list(),
      holds: this.holdDesk.list(),
      grants: this.state.grants ?? [],
      handsModel: this.handsModel(),
      update: this.state.update ?? null,
      motion: this.motion.view(),
      blackScreenAt: this.blackScreenAt,
      sync: this.sync ? { rev: this.sync.view().rev, mainSession: this.sync.state.mainSession } : { rev: 0, mainSession: '' },
    }
  }

  /** The session that holds the account's main conversation (C8), '' before one is known. */
  syncMainSession(): string {
    return this.sync?.state.mainSession ?? ''
  }

  /** How many turns from the account's other devices a session here shows (C8). */
  syncRemoteLines(sessionId: string): number {
    return this.kept?.linesOf(sessionId).length ?? 0
  }

  /** The main chat named by the host (the first conversation): the session it ends up in. */
  async setSyncMain(sessionId: string): Promise<string> {
    return this.sync ? this.sync.setMain(sessionId) : sessionId
  }

  /** Step one: a code to the phone or the mailbox. */
  async requestCode(identifier: string): Promise<void> {
    await this.serialize(() => this.relay.requestCode(identifier.trim()))
  }

  /** Step two: the code for the key; wires the provider and remembers the account. A friend's invite code counts for a new account. */
  verify(identifier: string, code: string, invite = ''): Promise<CloudStatus> {
    return this.serialize(async () => this.adopt(await this.relay.verify(identifier.trim(), code, this.deviceName(), undefined, invite)))
  }

  /** The account page's calls that only pass through: nothing of them is kept here. */
  private async withToken<T>(work: (token: string) => Promise<T>): Promise<T> {
    const token = await this.token()
    if (!token || !this.state.account) throw new RelayError(401, 'signed_out', 'Sign in first')
    return work(token)
  }

  /** Every key of the account retired (this one too), or the account deleted: the local side forgets as on a sign-out. */
  private endAll(how: 'sign-out-all' | 'delete'): Promise<CloudStatus> {
    return this.serialize(async () => {
      const token = await this.token()
      if (token) {
        if (how === 'delete') await this.relay.deleteAccount(token)
        else await this.relay.signOutAll(token)
      }
      await this.forget()
      return this.status()
    })
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
    await this.writeHands().catch((error: unknown) => this.ctx.logger.warn('nanomuse cloud: hands model not written: %s', message(error)))
    this.lastSharedConnectors = ''
    void this.publishConnectors().catch(() => undefined)
    this.signedInCache = true
    this.ctx.logger.info('nanomuse cloud: signed in as %s (%s)', signIn.account.hint, signIn.account.channel)
    await this.profile.pull(signIn.apiKey, true).catch((error: unknown) => this.ctx.logger.warn('nanomuse: profile pull failed: %s', message(error)))
    this.hub.restart()
    if (this.sync) {
      this.sync.start()
      await this.sync.accountChanged(signIn.account.id)
    }
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
        const rev = await this.relay.putProfile(token, write, this.writerId())
        await this.profile.pull(token, true).catch(() => this.profile.wearLocal({ ...current, ...write, rev }))
      } else {
        await this.profile.wearLocal({ ...current, ...write, rev: current.rev })
      }
      this.broadcast()
      return this.profile.current()
    })
  }

  // ---- the avatar studio: the pictures through the relay, the face onto the account ------

  /** The account's image model, as the relay lists it (the recommended one first). */
  private imageModel(): string {
    const models = (this.state.models ?? []).filter((m) => m.kind === 'image')
    const pick = models.find((m) => m.recommended) ?? models[0]
    return pick ? pick.id : ''
  }

  private async studioToken(): Promise<string> {
    const token = await this.token()
    if (!token || !this.state.account) throw new RelayError(401, 'signed_out', 'Sign in to draw a face')
    if (!this.imageModel()) throw new RelayError(409, 'no_image_model', 'The account has no image model to draw with')
    return token
  }

  /** What four candidates and four poses would cost today — and the four clips, when the account would draw them (C3). */
  async studioEstimate(): Promise<Estimate> {
    const token = await this.studioToken()
    const ep = await this.videoEndpoint()
    const clips = ep && ep.instanceId === PROVIDER_ID && this.state.media?.animate !== false ? ANIMATED.length : 0
    return this.relay.estimate(token, STUDIO_PICTURES, clips)
  }

  // ---- Settings → Media: the video model and the face's clips (desk-b) -------------------

  /** A face arrived (drawn here or on another device): its clips, when the setting and a video model allow; one line in the log when not. */
  private async animateNewFace(): Promise<void> {
    const face = this.faceId()
    const before = this.motion.view().faceId
    const started = await this.motion.faceChanged()
    if (started) this.ctx.logger.info('nanomuse: avatar motion: drawing the clips of the new face')
    else if (face && face !== before && this.state.media?.animate !== false && !(await this.videoEndpoint())) {
      this.ctx.logger.info('nanomuse: avatar motion: no video model (the account lists none and no Model Studio key is set; OpenRouter and the like have no video) — the face keeps still')
    }
  }

  /** The id of the face worn now; empty for the dragon or an emoji. */
  private faceId(): string {
    const p = this.profile.current()
    return p.avatar === 'face' ? p.faceId : ''
  }

  /** A mood's still of the worn face, as the video model's first frame (the account's 512 px WebP). */
  private async faceStill(mood: MotionMood): Promise<{ bytes: Uint8Array; mime: string; name: string } | undefined> {
    const id = this.faceId()
    const path = id ? this.profile.stillPath(id, mood, 'webp') : undefined
    if (!path) return undefined
    try {
      const bytes = await readFile(path)
      return bytes.length ? { bytes: new Uint8Array(bytes), mime: 'image/webp', name: `${mood}.webp` } : undefined
    } catch {
      return undefined
    }
  }

  /** The account's video models, as the relay lists them. */
  private cloudVideoModels(): RelayModel[] {
    return (this.state.models ?? []).filter((m) => m.kind === 'video')
  }

  /**
   * Where a clip would be drawn: the account when signed in and it lists a video model (the
   * relay mirrors Model Studio's `/api/v1` paths), else an own Model Studio key among the
   * providers the person added. Nothing when the setting says off, or no key speaks DashScope
   * (OpenRouter and the like have no video API).
   */
  async videoEndpoint(): Promise<VideoEndpoint | undefined> {
    const media = this.state.media ?? {}
    if (media.videoModel === VIDEO_OFF) return undefined
    const token = this.signedInCache ? await this.token() : undefined
    const cloud = this.cloudVideoModels()
    if (token && cloud.length) {
      const wanted = media.videoModel && cloud.some((m) => m.id === media.videoModel) ? media.videoModel : (cloud.find((m) => m.recommended) ?? cloud[0])?.id
      if (wanted) return { host: this.relay.origin, apiKey: token, model: wanted, label: 'nanoMuse Cloud', instanceId: PROVIDER_ID }
    }
    const own = await this.dashScopeProvider()
    if (!own) return undefined
    const known = this.state.media?.checked?.[own.host]
    const models = known && Date.now() - known.at < VIDEO_CHECK_TTL_MS ? known.models : []
    let model = media.videoModel && (!models.length || models.includes(media.videoModel)) ? media.videoModel : ''
    if (!model) model = models[0] ?? DEFAULT_VIDEO_MODEL
    return { host: own.host, apiKey: own.apiKey, model, label: own.label, instanceId: own.id }
  }

  /** The first provider row the person added that points at Model Studio, with its key. */
  private async dashScopeProvider(): Promise<{ id: string; host: string; apiKey: string; label: string } | undefined> {
    let rows: Record<string, unknown> = {}
    try {
      const row = this.ctx.settings.describe().find((d) => d.ns === LLM_ROW)
      const value = row?.value as { providers?: Record<string, unknown> } | undefined
      rows = value?.providers ?? {}
    } catch {
      return undefined
    }
    for (const [id, raw] of Object.entries(rows)) {
      if (id === PROVIDER_ID || !raw || typeof raw !== 'object') continue
      const p = raw as { displayName?: unknown; baseURL?: unknown; apiKeyEnv?: unknown; apiKey?: unknown }
      const baseURL = typeof p.baseURL === 'string' ? p.baseURL : ''
      if (!baseURL || !speaksDashScope(baseURL)) continue
      let apiKey = ''
      if (typeof p.apiKeyEnv === 'string' && p.apiKeyEnv) {
        try {
          apiKey = (await this.ctx.credentials.resolve(credentialRef(p.apiKeyEnv)))?.value ?? ''
        } catch {
          apiKey = ''
        }
      }
      if (!apiKey && typeof p.apiKey === 'string') apiKey = p.apiKey
      if (!apiKey) continue
      return { id, host: hostOf(baseURL), apiKey, label: typeof p.displayName === 'string' && p.displayName ? p.displayName : id }
    }
    return undefined
  }

  /** The Media page: models, the switch, the clips. */
  async media(): Promise<MediaView> {
    const media = this.state.media ?? {}
    const off = media.videoModel === VIDEO_OFF
    const cloud = this.cloudVideoModels()
    const signedIn = this.signedInCache && Boolean(this.state.account)
    const view: MediaView = {
      imageModel: signedIn ? this.imageModel() : '',
      video: { source: 'none', label: '', model: '', models: [], off, reason: '' },
      animate: media.animate !== false,
      motion: this.motion.view(),
    }
    if (signedIn && cloud.length) {
      const ep = off ? undefined : await this.videoEndpoint()
      view.video = { source: 'cloud', label: 'nanoMuse Cloud', model: ep?.model ?? '', models: cloud.map((m) => ({ id: m.id, name: m.name || m.id })), off, reason: '' }
      return view
    }
    const own = await this.dashScopeProvider()
    if (own) {
      const known = media.checked?.[own.host]
      const ids = known && Date.now() - known.at < VIDEO_CHECK_TTL_MS ? known.models : KNOWN_DASHSCOPE_MODELS
      const ep = off ? undefined : await this.videoEndpoint()
      view.video = { source: 'provider', label: own.label, model: ep?.model ?? '', models: ids.map((id) => ({ id, name: id })), off, reason: known ? '' : 'unchecked' }
      return view
    }
    view.video.reason = signedIn ? 'no_cloud_video' : 'no_provider'
    return view
  }

  /** Settings → Media: the video model (`off` for none) and the animate switch. */
  async setMedia(patch: { videoModel?: string; animate?: boolean }): Promise<MediaView> {
    const next: MediaState = { ...this.state.media }
    if (patch.videoModel !== undefined) {
      const id = patch.videoModel.trim()
      if (id && id !== VIDEO_OFF && !looksLikeVideoModel(id) && !KNOWN_DASHSCOPE_MODELS.includes(id) && !this.cloudVideoModels().some((m) => m.id === id)) {
        throw new RelayError(400, 'bad_model', 'Not a video model')
      }
      if (id) next.videoModel = id
      else delete next.videoModel
    }
    if (patch.animate !== undefined) {
      if (patch.animate) delete next.animate
      else next.animate = false
    }
    this.state = { ...this.state, media: next }
    await this.writeState()
    this.broadcast()
    return this.media()
  }

  /** Which of the known Model Studio video models the own key reaches (one empty task each; nothing is billed). */
  async checkVideoModels(): Promise<string[]> {
    const own = await this.dashScopeProvider()
    if (!own) throw new RelayError(409, 'no_provider', 'No Model Studio key among the providers')
    const found: string[] = []
    for (const id of KNOWN_DASHSCOPE_MODELS) {
      if ((await probeVideoModel(own.host, own.apiKey, id)) === true) found.push(id)
    }
    const checked = { ...this.state.media?.checked, [own.host]: { models: found, at: Date.now() } }
    this.state = { ...this.state, media: { ...this.state.media, checked } }
    await this.writeState()
    this.broadcast()
    return found
  }

  /** Settings → Computer use: a test screenshot or a small mouse move through a fresh `nanomuse mcp`. */
  async handsCheck(kind: 'screenshot' | 'move'): Promise<ScreenshotCheck | MoveCheck> {
    const runtime = await runtimeInfo()
    if (!runtime.ok) {
      const error = runtime.problem === 'not-found' ? 'No nanomuse runtime: NANOMUSE_PY is not set and `nanomuse` is not on PATH' : `NANOMUSE_PY points at ${runtime.path}, which ${runtime.problem === 'missing' ? 'does not exist' : 'is not executable'}`
      return kind === 'screenshot' ? { ok: false, black: false, error } : { ok: false, accessibility: false, error }
    }
    const options = { command: runtime.path, args: ['mcp'], env: { NANOMUSE_MCP_CONFIRM: process.env.NANOMUSE_MCP_CONFIRM ?? '' }, timeoutMs: 45_000 }
    const result = kind === 'screenshot' ? await checkScreenshot(options) : await checkMove(options)
    if (kind === 'screenshot') {
      const shot = result as ScreenshotCheck
      if (shot.black) this.sawBlackScreen()
      else if (shot.ok && this.blackScreenAt) {
        this.blackScreenAt = 0
        this.broadcast()
      }
    }
    return result
  }

  /** Which binary the hands run — and on Linux the display session they would work on (Settings → Computer use). */
  async runtime(): Promise<RuntimeInfo> {
    const info = await runtimeInfo()
    const display = displayInfo()
    return display ? { ...info, display } : info
  }

  private sawBlackScreen(): void {
    this.blackScreenAt = Date.now()
    this.broadcast()
  }

  /** One candidate, drawn from the words; PNG bytes as the model gave them. */
  async studioDraw(prompt: string): Promise<Buffer> {
    const token = await this.studioToken()
    return this.relay.generateImage(token, this.imageModel(), prompt)
  }

  /** One pose of the chosen candidate. */
  async studioPose(image: Buffer, prompt: string): Promise<Buffer> {
    const token = await this.studioToken()
    return this.relay.editImage(token, this.imageModel(), image, prompt)
  }

  /**
   * Wear a face drawn here: the stills go to the account (`PUT /v1/me/profile` with the
   * `face` map), then the profile is pulled so the pictures land under `faces/<id>/`
   * and every device of the account hears the hub's `profile` frame.
   */
  wearFace(description: string, style: string, face: Record<string, string>): Promise<Profile> {
    return this.serialize(async () => {
      const token = await this.token()
      if (!token || !this.state.account) throw new RelayError(401, 'signed_out', 'Sign in to wear a drawn face')
      const current = this.profile.current()
      const write: ProfileWrite = {
        name: current.name || 'nanoMuse',
        avatar: 'face',
        emoji: '',
        color: current.color,
        style: style.slice(0, 20),
        description: description.slice(0, 200),
        face,
      }
      await this.relay.putProfile(token, write, this.writerId())
      await this.profile.pull(token, true)
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
        if (!sameModels(models, this.state.models ?? []) || !this.providerPresent() || !this.providerBudgetCurrent()) await this.writeProvider(models)
        await this.adoptDefaultModel(models)
        this.state = { ...this.state, account, models }
        await this.writeState()
        await this.writeHands().catch((error: unknown) => this.ctx.logger.warn('nanomuse cloud: hands model not written: %s', message(error)))
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

  /** Whether every device of the account may run things here without asking; off (the default) means each one asks. */
  get remoteControl(): boolean {
    return this.state.remoteControl === true
  }

  /** Flip remote control. */
  async setRemoteControl(on: boolean): Promise<void> {
    if (this.remoteControl === on) return
    this.state = { ...this.state, remoteControl: on }
    await this.writeState()
    this.ctx.logger.info('nanomuse: remote control %s', on ? 'on (no questions)' : 'off (each device asks)')
    this.broadcast()
  }

  /** The devices allowed without asking. */
  get trusted(): TrustedDevice[] {
    return Object.entries(this.state.trusted ?? {}).map(([id, v]) => ({ id, name: v.name, at: v.at })).sort((a, b) => a.at - b.at)
  }

  /** Allow, or stop allowing, one device without asking. */
  async setTrusted(id: string, name: string, on: boolean): Promise<void> {
    const trusted = { ...this.state.trusted }
    if (on) trusted[id] = { name: name || trusted[id]?.name || id, at: Date.now() }
    else if (id in trusted) delete trusted[id]
    else return
    this.state = { ...this.state, trusted }
    await this.writeState()
    this.ctx.logger.info('nanomuse: %s %s without asking', name || id, on ? 'allowed' : 'no longer allowed')
    this.broadcast()
  }

  /**
   * Whether `from` may do `action` here now. Remote control on, or a device allowed without asking: yes.
   * Otherwise a card on this screen asks the person; *always* remembers the device. No answer in time, or
   * a no, and the asker hears `not_allowed`.
   */
  private async permit(from: Caller, action: string, text: string): Promise<void> {
    if (this.remoteControl || this.state.trusted?.[from.id]) return
    this.ctx.logger.info('nanomuse: %s asks to %s here%s', from.name || 'a device', action, text ? `: ${text}` : '')
    const answer = await this.asks.ask(from, action, text)
    if (answer === 'always') await this.setTrusted(from.id, from.name, true)
    if (answer === 'once' || answer === 'always') return
    throw new HubError(
      'not_allowed',
      answer === 'timeout' ? `nobody at ${this.deviceName()} answered in time` : `the person at ${this.deviceName()} did not allow it`,
    )
  }

  /** The current account key, for a plugin that speaks to the relay itself. */
  token(): Promise<string | undefined> {
    return this.ctx.credentials.resolve(credentialRef(TOKEN_REF)).then((r) => r?.value)
  }

  // -- the provider row -----------------------------------------------------------

  /**
   * The `nanomuse` provider as the Models page would have written it — with the image budget
   * of a request that goes through the relay: the relay refuses a body past its cap (413
   * `too_large`), and a computer-use turn accumulates screenshots, so the base64 images of one
   * request are held to `IMAGE_BUDGET` (the oldest offloaded, as `dsh-llm-pi-ai` does past the
   * budget) and each is scaled to the pixel budget before it is encoded.
   */
  providerRow(models: RelayModel[]): Record<string, unknown> {
    return providerRowFor(this.relay.openaiBase, models)
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
    const pick = pickChatModel(models)
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
    this.state = { ...(deviceId ? { deviceId } : {}), ...(deviceName ? { deviceName } : {}), ...(remoteControl === true ? { remoteControl } : {}) }
    this.sync?.stop()
    this.sync?.signedOut()
    this.signedInCache = false
    this.lastSharedConnectors = ''
    await this.writeState()
    await rm(join(this.dir(), 'hands.json'), { force: true }).catch(() => undefined)
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

  /** Whether the row written earlier carries today's image budget: a budget change counts as a changed menu. */
  private providerBudgetCurrent(): boolean {
    try {
      const row = this.ctx.settings.describe().find((d) => d.ns === LLM_ROW)
      const providers = (row?.value as { providers?: Record<string, unknown> } | undefined)?.providers ?? {}
      const ours = providers[PROVIDER_ID]
      if (!ours || typeof ours !== 'object') return false
      return Object.entries(IMAGE_BUDGET).every(([key, value]) => (ours as Record<string, unknown>)[key] === value)
    } catch {
      return true
    }
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
    // the stage empties itself a while after the hands rest
    if (this.stageTimer) clearTimeout(this.stageTimer)
    this.stageTimer = setTimeout(() => {
      this.stageTimer = undefined
      if (this.calls.size === 0 && Date.now() - this.lastCallAt >= STAGE_REST_MS - 1000) this.clearStage()
    }, STAGE_REST_MS)
    this.stageTimer.unref?.()
  }

  // -- the Live stage -------------------------------------------------------------------

  /** A frame of a screen the agent is working on; `meta.device` names another device, else it is this computer's. */
  stageFrame(bytes: Buffer, mime: string, meta: { device?: string; width?: number; height?: number; title?: string; mode?: 'screen' | 'window'; sessionId: string }): void {
    if (bytes.length === 0 || bytes.length > 12 * 1024 * 1024) return
    const seq = (this.frame?.seq ?? 0) + 1
    this.frame = { seq, bytes, mime }
    const sameScreen = this.stage.source === (meta.device ? 'device' : 'computer') && this.stage.device === (meta.device ?? '')
    this.stage = {
      seq,
      at: Date.now(),
      source: meta.device ? 'device' : 'computer',
      device: meta.device ?? '',
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      title: (meta.title ?? '').slice(0, 120),
      mode: meta.mode ?? 'screen',
      // an action aimed at another screen does not belong on this frame
      action: sameScreen ? this.stage.action : null,
      sessionId: meta.sessionId,
    }
    this.broadcast()
  }

  /** What the hands are about to do on this computer's screen. */
  private acted(action: StageAction, sessionId: string): void {
    this.stage = { ...this.stage, action, sessionId: sessionId || this.stage.sessionId }
    this.broadcast()
  }

  /**
   * A step the runtime's hands refused without the person's word (Enter, a submit, a click
   * on "pay", …): ask them on the permission card, and if they agree, run the same call
   * again carrying the confirmation ticket the `nanomuse mcp` server checks — an HMAC of
   * the arguments under the secret the desktop shell gave both of us (NANOMUSE_MCP_CONFIRM).
   * Without the secret (a hand-made dsh profile) the server takes `confirmed: true`, so
   * that is what the re-dispatch carries; either way the model never confirms on its own.
   *
   * The second run goes through the *same* execution (`exec` with the ticket added to its
   * arguments, then `next()` once more) rather than a nested `tools.execute`: the registry
   * re-renders a wrapper-authored result from its value through the tool's text projection,
   * and the MCP bridge keeps the admitted screenshot of a result keyed by the execution it
   * ran for — a nested call's picture never reached the model (0.1.37: "Image didn't come
   * through" after every approved step). The arguments the model wrote are put back after.
   */
  private async confirmStep(ctx: Context, exec: ToolDispatchExecution, refused: string, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult> {
    const approval = ctx.get('approval')
    if (!approval || !exec.agent) return declined(refused, 'approval is not available here')
    const step = refused.replace(/\.\s+(The person has to agree|Ask the person)[\s\S]*$/, '').trim()
    const outcome = await approval.request({
      agent: exec.agent,
      toolName: exec.name,
      callId: exec.callId,
      reason: step,
      displayReason: { en: `On this computer's screen: ${step}`, zh: `在这台电脑的屏幕上：${step}` },
      signal: exec.signal,
    })
    if (outcome !== 'allowed-once') return declined(step, outcome)
    const args = exec.arguments && typeof exec.arguments === 'object' && !Array.isArray(exec.arguments) ? (exec.arguments as Record<string, unknown>) : {}
    const secret = process.env.NANOMUSE_MCP_CONFIRM?.trim()
    const confirmed: string | true = secret ? confirmTicket(secret, args) : true
    const mutable = exec as { arguments: unknown }
    const written = mutable.arguments
    mutable.arguments = Object.freeze({ ...args, confirmed })
    try {
      return await next()
    } finally {
      mutable.arguments = written
    }
  }

  /** The screenshot and the words that came back from `computer_screen` / `computer_act` (an MCP result). */
  private frameFromMcp(value: unknown, sessionId: string): void {
    const content = (value as { content?: unknown[] } | undefined)?.content
    if (!Array.isArray(content)) return
    let image: { data: string; mime: string } | undefined
    let text = ''
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const b = block as { type?: unknown; data?: unknown; mimeType?: unknown; text?: unknown }
      if (b.type === 'image' && typeof b.data === 'string' && !image) image = { data: b.data, mime: typeof b.mimeType === 'string' ? b.mimeType : 'image/png' }
      else if (b.type === 'text' && typeof b.text === 'string') text += (text ? '\n' : '') + b.text
    }
    if (!image) return
    const head = screenHead(text)
    this.stageFrame(Buffer.from(image.data, 'base64'), image.mime, { ...head, sessionId })
  }

  /** The agent has stopped using that screen for a while: the stage can go. */
  private clearStage(): void {
    if (this.stage.seq === 0) return
    this.stage = NO_STAGE
    this.frame = undefined
    this.broadcast()
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

  /** The actions this computer announces: `info` and `notify`, the remote ones (the person here agrees to each unless remote control is on), a task once sessions are up. */
  private actions(): string[] {
    const out = [...ACTIONS, ...REMOTE_ACTIONS]
    if (this.tasks) out.push('approve', 'task', 'stop')
    return out
  }

  /** Another device running something here (`docs/hub.md`: the asker judged it; here the person — or the switch — decides). */
  private async remote(action: RemoteAction, args: Record<string, unknown>, from: Caller): Promise<Record<string, unknown>> {
    const summary = brief(action, args)
    await this.permit(from, action, summary)
    const who = from.name || 'a device'
    this.ctx.logger.info('nanomuse: %s asked %s here%s', who, action, summary ? `: ${summary}` : '')
    const body = await runAction(action, args)
    // Only what actually happened is worth a toast; a refused path is the asker's error to see.
    if (TOAST_ACTIONS.has(action)) this.notice('call', who, '', summary, action)
    return body
  }

  // -- state ----------------------------------------------------------------------------

  private hubState(): HubState {
    return {
      connected: this.hub.connected,
      deviceId: this.state.deviceId ?? '',
      deviceName: this.deviceName(),
      remoteControl: this.remoteControl,
      trusted: this.trusted,
      asks: this.asks.list,
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
        ...(typeof raw.handsModel === 'string' && raw.handsModel ? { handsModel: raw.handsModel } : {}),
        // a grant 0.1.37 kept for the "app" "Done. Screen now:" (the mis-read head line) names nothing — dropped
        ...(Array.isArray(raw.grants) ? { grants: (raw.grants as Grant[]).filter((g) => g && typeof g.id === 'string' && typeof g.target === 'string' && !MISREAD_GRANT.test(g.target)).map((g) => ({ id: g.id, target: g.target, at: Number(g.at) || 0 })) } : {}),
        ...(raw.update && typeof raw.update === 'object' && typeof (raw.update as UpdateInfo).checkedAt === 'number' ? { update: raw.update as UpdateInfo } : {}),
        ...(raw.remoteControl === true ? { remoteControl: true } : {}),
        ...(raw.trusted && typeof raw.trusted === 'object' ? { trusted: trustedOf(raw.trusted) } : {}),
        ...(raw.taskSessions && typeof raw.taskSessions === 'object' ? { taskSessions: raw.taskSessions } : {}),
        ...(raw.sync && typeof raw.sync === 'object' ? { sync: raw.sync } : {}),
      }
    } catch {
      return {}
    }
  }

  /** A session's cached log facts, dropped: its log changed. */
  private logChanged(sessionId: string): void {
    this.logCache.delete(sessionId)
  }

  private cached(sessionId: string): { title?: { at: number; title: string }; lines?: SessionLine[]; prompts?: Array<{ key: string; time: number }> } {
    let entry = this.logCache.get(sessionId)
    if (!entry) {
      entry = {}
      this.logCache.set(sessionId, entry)
    }
    return entry
  }

  /** The session's title as the chats column shows it: the latest `session/title` event, else its first prompt. */
  private async sessionTitle(ctx: Context, sessionId: SessionId, updatedAt: number): Promise<string> {
    const entry = this.cached(String(sessionId))
    if (entry.title && entry.title.at === updatedAt) return entry.title.title
    try {
      const inspection = await ctx.sessionController.inspect(sessionId)
      let title = ''
      let first = ''
      for (const event of inspection.events as ReadonlyArray<{ type: string; data: unknown }>) {
        if (event.type === 'session/title') title = String((event.data as { title?: string }).title ?? '')
        else if (!first && event.type === 'user/message' && (event.data as { source?: { kind?: string } }).source?.kind === 'user') first = textOf((event.data as { content?: readonly ContentBlock[] }).content)
      }
      const out = (title || first).replace(/\s+/g, ' ').trim().slice(0, 120)
      entry.title = { at: updatedAt, title: out }
      return out
    } catch {
      return ''
    }
  }

  /** The person's prompts and the model's final texts of one session, for the sync engine. */
  private async sessionLines(ctx: Context, sessionId: string): Promise<SessionLine[]> {
    const entry = this.cached(sessionId)
    if (entry.lines) return entry.lines
    try {
      const inspection = await ctx.sessionController.inspect(sessionId as SessionId)
      const lines: SessionLine[] = []
      // the final assistant text of a turn is the last `assistant/message` before its `turn/end`
      let lastAssistant: SessionLine | undefined
      for (const event of inspection.events) {
        if (event.type === 'user/message') {
          const data = event.data as unknown as { id?: string; content?: readonly ContentBlock[]; source?: { kind?: string } }
          if (data.source?.kind !== 'user') continue
          const text = textOf(data.content)
          if (text && !text.startsWith('[Asked from ')) lines.push({ id: String(data.id ?? `u${event.seq}`), role: 'user', text, at: event.time })
        } else if (event.type === 'assistant/message') {
          const data = event.data as unknown as { message?: { id?: string; content?: readonly ContentBlock[] }; interrupted?: true }
          const text = textOf(data.message?.content)
          if (text && data.interrupted !== true) lastAssistant = { id: String(data.message?.id ?? `a${event.seq}`), role: 'assistant', text, at: event.time }
        } else if (event.type === 'turn/end') {
          if (lastAssistant) lines.push(lastAssistant)
          lastAssistant = undefined
        }
      }
      entry.lines = lines
      return lines
    } catch {
      return []
    }
  }

  /**
   * The turns from the account's other devices kept for one session (C8), for the browser
   * half's bubbles: in time order, each with the key of the first prompt typed here that is
   * younger than it (`before`, the row's `data-chat-node-key`), so the bubble is shown
   * before that prompt; none when the turn is the newest thing in the chat.
   */
  private async remoteLines(ctx: Context, sessionId: string): Promise<Array<RemoteLine & { id: string; before: string | null }>> {
    const lines = this.kept?.linesOf(sessionId) ?? []
    if (lines.length === 0) return []
    const entry = this.cached(sessionId)
    let prompts = entry.prompts
    if (!prompts) {
      prompts = []
      const sc = ctx.get('sessionController')
      if (sc) {
        try {
          const inspection = await sc.inspect(sessionId as SessionId)
          for (const event of inspection.events) {
            if (event.type !== 'user/message') continue
            const data = event.data as unknown as { id?: string; source?: { kind?: string } }
            if (data.source?.kind === 'user') prompts.push({ key: `13:input-message${String(data.id ?? '')}`, time: event.time })
          }
          entry.prompts = prompts
        } catch {
          // a session that cannot be read: the bubbles go after whatever is shown
        }
      }
    }
    return lines.map((line) => ({ ...line, id: line.mid, before: prompts.find((p) => p.time > line.at)?.key ?? null }))
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
      if (req.method === 'GET' && route === '/stage/frame') {
        const frame = this.frame
        if (!frame) return send(res, 404, { error: { code: 'no_frame', message: 'Nothing on the stage' } })
        res.writeHead(200, { 'content-type': frame.mime, 'content-length': frame.bytes.length, 'cache-control': 'private, max-age=600' })
        res.end(frame.bytes)
        return
      }
      if (req.method === 'POST' && route === '/stage/clear') {
        this.clearStage()
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/code') {
        const body = await json(req)
        await this.requestCode(String(body.identifier ?? ''))
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/verify') {
        const body = await json(req)
        return send(res, 200, await this.verify(String(body.identifier ?? ''), String(body.code ?? ''), String(body.invite ?? '')))
      }
      // the account page, passed through: the sheet, the devices holding keys, the timeline, the password
      if (req.method === 'GET' && route === '/config') return send(res, 200, await this.relay.config())
      if (req.method === 'GET' && route === '/me') return send(res, 200, await this.withToken((token) => this.relay.meSheet(token)))
      if (req.method === 'GET' && route === '/sessions') return send(res, 200, await this.withToken((token) => this.relay.sessions(token)))
      if (req.method === 'POST' && route === '/sessions/revoke') {
        const body = await json(req)
        await this.withToken((token) => this.relay.revokeSession(token, String(body.prefix ?? '')))
        return send(res, 204)
      }
      if (req.method === 'GET' && route === '/account-events') {
        const limit = Number(url.searchParams.get('limit') ?? '40')
        return send(res, 200, await this.withToken((token) => this.relay.events(token, Number.isFinite(limit) ? limit : 40)))
      }
      if (req.method === 'POST' && route === '/password') {
        const body = await json(req)
        await this.withToken((token) => this.relay.setPassword(token, String(body.password ?? ''), typeof body.current === 'string' ? body.current : undefined))
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/sign-out-all') return send(res, 200, await this.endAll('sign-out-all'))
      if (req.method === 'POST' && route === '/delete-account') return send(res, 200, await this.endAll('delete'))
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
      if (req.method === 'GET' && route === '/studio/estimate') return send(res, 200, await this.studioEstimate())
      if (req.method === 'POST' && route === '/studio/draw') {
        const body = await json(req)
        const png = await this.studioDraw(String(body.prompt ?? '').slice(0, 2000))
        return send(res, 200, { image: png.toString('base64') })
      }
      if (req.method === 'POST' && route === '/studio/pose') {
        const body = await json(req, 8 * 1024 * 1024)
        const image = Buffer.from(String(body.image ?? ''), 'base64')
        if (!image.length) return send(res, 400, { error: { code: 'bad_request', message: 'image is the base64 PNG to pose' } })
        const png = await this.studioPose(image, String(body.prompt ?? '').slice(0, 2000))
        return send(res, 200, { image: png.toString('base64') })
      }
      if (req.method === 'POST' && route === '/studio/wear') {
        const body = await json(req, 4 * 1024 * 1024)
        const face = body.face as Record<string, string> | undefined
        if (!face || typeof face !== 'object' || typeof face.idle !== 'string') return send(res, 400, { error: { code: 'bad_request', message: 'face is a {mood: base64 WebP} map with idle' } })
        return send(res, 200, await this.wearFace(String(body.description ?? ''), String(body.style ?? 'muse'), face))
      }
      if (req.method === 'POST' && route === '/sign-out') return send(res, 200, await this.signOut())
      if (req.method === 'POST' && route === '/data/contribute') {
        const body = await json(req)
        return send(res, 200, await this.setContribute(body.on !== false))
      }
      if (req.method === 'POST' && route === '/data/delete-samples') return send(res, 200, await this.deleteSamples())
      // Conversations synced between the account's devices (C7, C8): the switch, the delete, the main chat, the rows from elsewhere.
      if (route === '/sync/state' || route.startsWith('/sync/')) {
        const sync = this.sync
        if (!sync) return send(res, 503, { error: { code: 'not_ready', message: 'The session API is not up yet' } })
        if (req.method === 'GET' && route === '/sync/state') {
          await sync.relayStatus()
          return send(res, 200, sync.view())
        }
        if (req.method === 'POST' && route === '/sync/state') {
          // the account-wide switch (`enabled`), or this device's "Also sync side chats" (`sideChats`, C9)
          const body = await json(req)
          if (typeof body.sideChats === 'boolean') return send(res, 200, await sync.setSideChats(body.sideChats))
          return send(res, 200, await sync.setEnabled(body.enabled !== false))
        }
        if (req.method === 'POST' && route === '/sync/delete') return send(res, 200, await sync.deleteRemote())
        if (req.method === 'POST' && route === '/sync/pull') return send(res, 200, { applied: await sync.pull(), ...sync.view() })
        if (req.method === 'POST' && route === '/sync/main') {
          // the session the column named, or the one the account's main conversation already lives in
          const body = await json(req)
          return send(res, 200, { sessionId: await sync.setMain(String(body.sessionId ?? '')) })
        }
        if (req.method === 'GET' && route === '/sync/remote') {
          const sessionId = url.searchParams.get('session') ?? ''
          const lines = sessionId ? await this.remoteLines(this.ctx, sessionId) : []
          return send(res, 200, { lines, hidden: sync.view().hidden, working: sync.workingOf(sessionId) })
        }
        if (req.method === 'POST' && route === '/sync/archived') {
          const body = await json(req)
          await sync.archived(Array.isArray(body.sessionIds) ? body.sessionIds.map(String) : [])
          return send(res, 204)
        }
      }
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
        await this.setRemoteControl(body.on === true)
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/devices/trust') {
        const body = await json(req)
        await this.setTrusted(String(body.device_id ?? ''), String(body.name ?? ''), body.on === true)
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/devices/answer') {
        const body = await json(req)
        const answer = body.answer
        if (answer !== 'once' && answer !== 'always' && answer !== 'deny') return send(res, 400, { error: { code: 'bad_answer', message: 'answer must be once, always or deny' } })
        if (!this.asks.answer(String(body.id ?? ''), answer)) return send(res, 404, { error: { code: 'not_found', message: 'that question is no longer waiting' } })
        return send(res, 204)
      }
      if (req.method === 'GET' && route === '/update') return send(res, 200, await this.update(url.searchParams.get('force') === '1'))
      if (req.method === 'GET' && route === '/approvals') return send(res, 200, { approvals: this.approvalDesk.list() })
      if (req.method === 'POST' && route.startsWith('/approvals/')) {
        const body = await json(req)
        const scope = body.scope === 'conversation' || body.scope === 'always' ? body.scope : 'once'
        const ok = this.decideApproval(decodeURIComponent(route.slice('/approvals/'.length)), body.approved === true, scope)
        return ok ? send(res, 204) : send(res, 404, { error: { code: 'not_found', message: 'That question was answered already' } })
      }
      if (req.method === 'GET' && route === '/holds') return send(res, 200, { holds: this.holdDesk.list() })
      if (req.method === 'POST' && route === '/holds') {
        const body = await json(req)
        const thread = String(body.thread ?? '').trim()
        if (!thread) return send(res, 400, { error: { code: 'bad_request', message: 'thread is required' } })
        const tool: HoldTool = body.tool === 'browser' || body.tool === 'phone' ? body.tool : 'computer'
        return send(res, 200, this.takeHold(thread, tool, String(body.reason ?? '').slice(0, 200)))
      }
      if (req.method === 'POST' && /^\/holds\/[^/]+\/done$/.test(route)) {
        const id = decodeURIComponent(route.split('/')[2] ?? '')
        return this.holdDone(id) ? send(res, 204) : send(res, 404, { error: { code: 'not_found', message: 'No such hold' } })
      }
      if (req.method === 'POST' && route === '/grants/revoke') {
        const body = await json(req)
        return (await this.revokeGrant(String(body.id ?? ''))) ? send(res, 204) : send(res, 404, { error: { code: 'not_found', message: 'No such grant' } })
      }
      if (req.method === 'POST' && route === '/chat-model') {
        const body = await json(req)
        await this.setChatModel(String(body.model ?? ''))
        return send(res, 200, { model: this.chatModel() })
      }
      if (req.method === 'POST' && route === '/hands-model') {
        const body = await json(req)
        await this.setHandsModel(String(body.model ?? ''))
        return send(res, 200, { model: this.handsModel() })
      }
      if (req.method === 'POST' && route === '/notices/clear') {
        this.notices = []
        this.broadcast()
        return send(res, 204)
      }
      // Settings → Media and the face's clips (desk-b)
      if (req.method === 'GET' && route === '/media') return send(res, 200, await this.media())
      if (req.method === 'POST' && route === '/media') {
        const body = await json(req)
        const patch: { videoModel?: string; animate?: boolean } = {}
        if (typeof body.videoModel === 'string') patch.videoModel = body.videoModel
        if (typeof body.animate === 'boolean') patch.animate = body.animate
        return send(res, 200, await this.setMedia(patch))
      }
      if (req.method === 'POST' && route === '/media/check') return send(res, 200, { models: await this.checkVideoModels() })
      if (req.method === 'POST' && route === '/media/animate') {
        const body = await json(req)
        if (!this.faceId()) return send(res, 409, { error: { code: 'no_face', message: 'No drawn face to animate' } })
        if (!(await this.videoEndpoint())) return send(res, 409, { error: { code: 'no_video_model', message: 'No video model to draw clips with' } })
        const started = await this.motion.animateAll(body.force === true)
        return send(res, 200, { started, motion: this.motion.view() })
      }
      if (req.method === 'POST' && route === '/media/cancel') {
        this.motion.cancel()
        return send(res, 204)
      }
      if (req.method === 'POST' && route === '/media/dismiss') {
        this.motion.clearProgress()
        return send(res, 204)
      }
      // Settings → Computer use: the runtime and the "try it" checks (desk-b)
      if (req.method === 'GET' && route === '/hands/runtime') return send(res, 200, await this.runtime())
      if (req.method === 'POST' && route === '/hands/check') {
        const body = await json(req)
        const kind = body.kind === 'move' ? 'move' : 'screenshot'
        return send(res, 200, await this.handsCheck(kind))
      }
      if (req.method === 'POST' && route === '/hands/black-screen/clear') {
        this.blackScreenAt = 0
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
/** The `nanomuse` provider row for a relay's OpenAI root and its model list (see `providerRow`). */
export function providerRowFor(openaiBase: string, models: RelayModel[]): Record<string, unknown> {
  const chat = models.filter((m) => modelFor(m).includes('chat'))
  return {
    displayName: 'nanoMuse Cloud',
    api: 'openai-completions',
    baseURL: openaiBase,
    apiKeyEnv: TOKEN_REF,
    ...IMAGE_BUDGET,
    models: chat.map((m) => ({
      id: m.id,
      displayName: m.name,
      input: takesImages(m) ? ['text', 'image'] : ['text'],
    })),
  }
}

export function dshHome(): string {
  const configured = process.env.DSH_HOME
  if (configured) return configured
  return join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.dsh')
}

/** The few arguments the capsule shows, as short strings. */
/** The hands' arguments as the stage shows them: what kind of step, aimed where. */
/** The reason of a `hand_over` action (the agent gives the screen to the person), or nothing. */
export function handOverOf(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') return undefined
  const a = args as Record<string, unknown>
  if (a.action !== 'hand_over') return undefined
  return String(a.reason ?? a.label ?? a.text ?? '').trim().slice(0, 200) || 'Your turn'
}

export function stageAction(args: unknown): StageAction {
  const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : -1)
  const kind = typeof a.action === 'string' ? a.action : 'act'
  const keys = Array.isArray(a.keys) ? a.keys.filter((k): k is string => typeof k === 'string').join('+') : ''
  const text = kind === 'key' ? keys : kind === 'open_app' ? String(a.app ?? '') : typeof a.text === 'string' ? a.text : ''
  // `box: [x1, y1, x2, y2]` stands in for x, y when the model gave a box (computer_act): its centre
  const box = Array.isArray(a.box) && a.box.length === 4 ? a.box.map(num) : []
  const [bx1 = -1, by1 = -1, bx2 = -1, by2 = -1] = box
  const boxed = box.length === 4 && box.every((v) => v >= 0)
  return {
    kind,
    label: typeof a.label === 'string' ? a.label.replace(/\s+/g, ' ').trim().slice(0, 80) : '',
    text: text.replace(/\s+/g, ' ').trim().slice(0, 80),
    x: boxed && a.x === undefined ? (bx1 + bx2) / 2 : num(a.x),
    y: boxed && a.y === undefined ? (by1 + by2) / 2 : num(a.y),
    at: Date.now(),
  }
}

/** A `<WxH>` part of the screen head (`1596×1204`, `1920x1080`). */
const SIZE_PART = /^(\d{2,5})[×x](\d{2,5})$/
/** The grant target 0.1.37 wrote when it took `computer_act`'s first line for the window title. */
export const MISREAD_GRANT = /^computer_app:Done\. Screen now:?$/

/**
 * The head line of what `computer_screen` / `computer_act` say: `<window in front> · <WxH> · …`
 * → title and size. It is the line that carries the size, wherever it stands: `computer_act`
 * puts "Done. Screen now:" first, and 0.1.37 took that for the window's title (so the stage
 * was titled "Done. Screen now:" and an "always allow" was kept for that "app").
 */
export function screenHead(text: string): { title: string; width: number; height: number; mode: 'screen' | 'window' } {
  const lines = text.split('\n').filter((l) => l.trim())
  const line = lines.find((l) => l.split(' · ').some((p) => SIZE_PART.test(p.trim()))) ?? ''
  const parts = line.split(' · ').map((p) => p.trim())
  let width = 0
  let height = 0
  let mode: 'screen' | 'window' = 'screen'
  const rest: string[] = []
  for (const part of parts) {
    const m = SIZE_PART.exec(part)
    if (m) {
      width = Number(m[1])
      height = Number(m[2])
    } else if (/^window(?: mode)?$/i.test(part)) mode = 'window'
    else if (!/^keyboard (shown|hidden)$/.test(part)) rest.push(part)
  }
  return { title: (rest[0] ?? '').slice(0, 120), width, height, mode }
}

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
export async function json(req: IncomingMessage, limit = 64 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > limit) throw new RelayError(413, 'too_large', 'Request body too large')
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
