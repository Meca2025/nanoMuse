/**
 * Conversations synced between the account's devices (contracts C7 and C8), the
 * desktop's half. The relay keeps the text of every conversation under `/v1/sync/*`;
 * this computer pushes the person's words the moment they are sent and the model's
 * final text when the turn ends, and pulls what the other devices pushed — on start,
 * on the hub's `sync` frame and every minute.
 *
 * **One thread** (C8). A conversation written on another device is not a mirror
 * beside the chats here: it *is* a chat here. The account's one main conversation
 * lives in the main chat of this computer (its id adopted from the relay when the
 * relay has one), and a side conversation pulled from the relay gets a dsh session
 * at once, with its title, so it continues here like any other chat and its turns
 * go up under the same conversation id. The turns written elsewhere are *kept* by the
 * host in a store of its own (`$DSH_HOME/nanomuse/sync-remote.json`) — never written
 * into the session's log: a `user/message` appended there outside a turn makes the log
 * unreadable once a turn runs, and the chat does not render such a row anyway — and the
 * browser half (`client/RemoteBubbles.ts`) shows them as the other device's bubbles,
 * "From Pixel 8" under each, placed by their time among the local turns. The model
 * hears them as context for its next step (`agent.inject`, a note per pull: "Meanwhile,
 * in this same conversation on another device…"), model-facing, never the person's
 * words, so never pushed back; a row from this device coming back on a pull is known
 * by its device and never kept twice.
 *
 * On sign-in and when the switch goes on the pull comes first (the relay's history
 * reaches the sessions here), then the whole eligible history of this computer goes
 * up, oldest first, 200 messages a POST.
 *
 * Never a key in a log, never a file: attachments travel as names and sizes.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { RelayError } from './relay.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** A turn of this conversation written on another device of the account (C8). */
    'nanomuse-sync': { kind: 'nanomuse-sync'; role: 'user' | 'assistant'; mid: string; device: string; deviceName: string; at: number }
  }
}

/** The relay's limits (contract C7). */
export const MAX_POST_MESSAGES = 200
export const PUSH_DELAY_MS = 2000
/** The person's words go up this soon after they are sent (C8). */
export const SEND_DELAY_MS = 50
export const PULL_EVERY_MS = 60_000
export const PAGE = 500

const JSON_HEADERS = { 'content-type': 'application/json' }

export interface SyncRelayState {
  enabled: boolean
  cursor: number
  counts: { conversations: number; messages: number }
}

export interface WireConversation {
  cid: string
  kind: 'main' | 'side'
  title: string
  device: string
  device_name: string
  created_at: number
  updated_at: number
  deleted: boolean
  seq: number
}

export interface WireMessage {
  mid: string
  cid: string
  seq: number
  device: string
  device_name: string
  role: 'user' | 'assistant'
  text: string
  truncated: boolean
  created_at: number
  deleted: boolean
}

export interface SyncChanges {
  cursor: number
  more: boolean
  conversations: WireConversation[]
  messages: WireMessage[]
}

export interface PushResult {
  cursor: number
  accepted: number
  rejected: Array<{ cid?: string; mid?: string; reason: string; cid_main?: string }>
}

/** `/v1/sync/*` as the engine needs them; `fetchImpl` is swapped in tests. */
export class SyncRelay {
  readonly origin: string

  constructor(origin: string, private readonly fetchImpl: typeof fetch = fetch) {
    this.origin = origin.replace(/\/+$/, '')
  }

  async state(apiKey: string): Promise<SyncRelayState> {
    const res = await this.fetchImpl(`${this.origin}/v1/sync/state`, { headers: this.auth(apiKey) })
    if (!res.ok) await fail(res)
    return toState(await res.json())
  }

  async setEnabled(apiKey: string, enabled: boolean): Promise<SyncRelayState> {
    const res = await this.fetchImpl(`${this.origin}/v1/sync/state`, { method: 'PUT', headers: { ...this.auth(apiKey), ...JSON_HEADERS }, body: JSON.stringify({ enabled }) })
    if (!res.ok) await fail(res)
    return toState(await res.json())
  }

  async changes(apiKey: string, since: number, limit = PAGE): Promise<SyncChanges> {
    const res = await this.fetchImpl(`${this.origin}/v1/sync/changes?since=${since}&limit=${limit}`, { headers: this.auth(apiKey) })
    if (!res.ok) await fail(res)
    const body = (await res.json()) as Record<string, unknown>
    return {
      cursor: Number(body.cursor ?? since),
      more: body.more === true,
      conversations: Array.isArray(body.conversations) ? body.conversations.map(toConversation) : [],
      messages: Array.isArray(body.messages) ? body.messages.map(toMessage) : [],
    }
  }

  async push(apiKey: string, device: string, conversations: Record<string, unknown>[], messages: Record<string, unknown>[]): Promise<PushResult> {
    const res = await this.fetchImpl(`${this.origin}/v1/sync/changes`, {
      method: 'POST',
      headers: { ...this.auth(apiKey), ...JSON_HEADERS },
      body: JSON.stringify({ device, conversations, messages }),
    })
    if (!res.ok) await fail(res)
    const body = (await res.json()) as Record<string, unknown>
    return {
      cursor: Number(body.cursor ?? 0),
      accepted: Number(body.accepted ?? 0),
      rejected: Array.isArray(body.rejected) ? (body.rejected as PushResult['rejected']) : [],
    }
  }

  async deleteConversation(apiKey: string, cid: string, device: string): Promise<void> {
    const res = await this.fetchImpl(`${this.origin}/v1/sync/conversations/${encodeURIComponent(cid)}`, { method: 'DELETE', headers: { ...this.auth(apiKey), 'x-nanomuse-device': device } })
    if (!res.ok && res.status !== 404) await fail(res)
  }

  /** "Delete synced conversations": the store emptied, the switch kept. */
  async wipe(apiKey: string): Promise<SyncRelayState> {
    const res = await this.fetchImpl(`${this.origin}/v1/sync/changes`, { method: 'DELETE', headers: this.auth(apiKey) })
    if (!res.ok) await fail(res)
    return toState(await res.json())
  }

  private auth(apiKey: string): Record<string, string> {
    return { authorization: `Bearer ${apiKey}` }
  }
}

async function fail(res: Response): Promise<never> {
  let code = `http_${res.status}`
  let message = `${res.status} ${res.statusText}`.trim()
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    if (body.error?.code) code = body.error.code
    if (body.error?.message) message = body.error.message
  } catch {
    // not JSON — the status line is the message
  }
  throw new RelayError(res.status, code, message)
}

function toState(value: unknown): SyncRelayState {
  const b = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const counts = (b.counts && typeof b.counts === 'object' ? b.counts : {}) as Record<string, unknown>
  return { enabled: b.enabled !== false, cursor: Number(b.cursor ?? 0), counts: { conversations: Number(counts.conversations ?? 0), messages: Number(counts.messages ?? 0) } }
}

function toConversation(value: unknown): WireConversation {
  const c = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    cid: String(c.cid ?? ''),
    kind: c.kind === 'main' ? 'main' : 'side',
    title: String(c.title ?? ''),
    device: String(c.device ?? ''),
    device_name: String(c.device_name ?? ''),
    created_at: Number(c.created_at ?? 0),
    updated_at: Number(c.updated_at ?? 0),
    deleted: c.deleted === true,
    seq: Number(c.seq ?? 0),
  }
}

function toMessage(value: unknown): WireMessage {
  const m = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    mid: String(m.mid ?? ''),
    cid: String(m.cid ?? ''),
    seq: Number(m.seq ?? 0),
    device: String(m.device ?? ''),
    device_name: String(m.device_name ?? ''),
    role: m.role === 'assistant' ? 'assistant' : 'user',
    text: String(m.text ?? ''),
    truncated: m.truncated === true,
    created_at: Number(m.created_at ?? 0),
    deleted: m.deleted === true,
  }
}

// ---- the sessions, as the engine sees them -----------------------------------------------

/** One message of a dsh session the engine may sync: the person's prompt or the model's final text. */
export interface SessionLine {
  /** The dsh message id: stable, so a line is pushed once. */
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Unix epoch milliseconds. */
  at: number
}

export interface SessionInfo {
  id: string
  title: string
  blank: boolean
  createdAt: number
  updatedAt: number
}

/** A turn of the conversation written on another device, as it goes into a session's log here (C8). */
export interface RemoteLine {
  mid: string
  role: 'user' | 'assistant'
  text: string
  /** Unix epoch milliseconds (the relay's `created_at`, in ms). */
  at: number
  device: string
  deviceName: string
}

/** The slice of the session API the engine uses; `cloud.ts` binds it to `ctx.sessionController`, tests fake it. */
export interface SyncSessions {
  list(): Promise<SessionInfo[]>
  /** The session's human prompts and final assistant texts, in order; [] for a session that cannot be read. */
  lines(sessionId: string): Promise<SessionLine[]>
  create(title: string): Promise<string>
  rename(sessionId: string, title: string): Promise<void>
  /**
   * A turn from another device, kept by the host for the transcript — in a store of its own,
   * never in the session's log: a surface message appended there outside a turn makes the log
   * unreadable once a turn runs ("system/message requires a protected first surface head").
   */
  keep(sessionId: string, line: RemoteLine): Promise<void>
  /** A kept turn deleted elsewhere. */
  forget(sessionId: string, mid: string): Promise<void>
  /** Model-facing context for the session's next step (`agent.inject`): what the other devices said; never shown as the person's words. */
  inject(sessionId: string, text: string): Promise<void>
}

/**
 * The other devices' turns, kept by session for the transcript: one JSON file, read once,
 * written whole after each change (coalesced, atomically — a temp file renamed over). A
 * line is kept once (by `mid`), in time order.
 */
export class RemoteStore {
  private lines = new Map<string, RemoteLine[]>()
  private loaded = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private readonly path: string,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  private load(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, RemoteLine[]>
      for (const [sessionId, lines] of Object.entries(raw)) if (Array.isArray(lines)) this.lines.set(sessionId, lines)
    } catch {
      // no store yet
    }
  }

  linesOf(sessionId: string): RemoteLine[] {
    this.load()
    return [...(this.lines.get(sessionId) ?? [])]
  }

  add(sessionId: string, line: RemoteLine): void {
    this.load()
    const list = this.lines.get(sessionId) ?? []
    if (list.some((l) => l.mid === line.mid)) return
    list.push(line)
    list.sort((a, b) => a.at - b.at)
    this.lines.set(sessionId, list)
    this.saveSoon()
  }

  remove(sessionId: string, mid: string): void {
    this.load()
    const list = this.lines.get(sessionId)
    if (!list) return
    const next = list.filter((l) => l.mid !== mid)
    if (next.length === list.length) return
    if (next.length === 0) this.lines.delete(sessionId)
    else this.lines.set(sessionId, next)
    this.saveSoon()
  }

  private saveSoon(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.writing = this.writing.then(() => this.write()).catch(this.onError)
    }, 200)
    this.timer.unref?.()
  }

  private async write(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(Object.fromEntries(this.lines)) + '\n', { mode: 0o600 })
    await rename(tmp, this.path)
  }

  /** Written now (the host stopping). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
      this.writing = this.writing.then(() => this.write()).catch(this.onError)
    }
    await this.writing
  }
}

/** The note that hands the model what the other devices added to a conversation that lives in a session here. */
export function meanwhileNote(lines: RemoteLine[]): string {
  const MAX_LINES = 40
  const MAX_CHARS = 12_000
  const recent = lines.slice(-MAX_LINES)
  const rows: string[] = []
  let size = 0
  for (const l of [...recent].reverse()) {
    const row = `${l.role === 'user' ? 'Person' : 'Muse'}${l.deviceName ? ` (on ${l.deviceName})` : ''}: ${l.text}`
    if (size + row.length > MAX_CHARS && rows.length > 0) break
    rows.unshift(row)
    size += row.length
  }
  const omitted = lines.length - rows.length
  return `[Meanwhile, in this same conversation on another device of the account${omitted > 0 ? ` (${omitted} earlier turn${omitted === 1 ? '' : 's'} not shown)` : ''}:]\n${rows.join('\n')}`
}

// ---- state --------------------------------------------------------------------------------

/** A conversation as the relay lists it, kept so a late session, a rename or a tombstone finds it. */
export interface KnownConversation {
  kind: 'main' | 'side'
  title: string
  device: string
  deviceName: string
  /** Unix seconds, the relay's clock. */
  createdAt: number
  updatedAt: number
}

export interface SyncState {
  accountId: string
  cursor: number
  enabled: boolean
  /** The session that is the main chat here: the account's one main conversation. */
  mainSession: string
  /** dsh session id → conversation id. */
  cids: Record<string, string>
  /** dsh message id → the mid it was pushed as. */
  mids: Record<string, string>
  /** session id → the title last pushed (or pulled: not pushed back). */
  titles: Record<string, string>
  /** cid → what the relay says of the conversation. */
  conversations: Record<string, KnownConversation>
  /** mid → the session it was appended to: a row goes into a log once. */
  pulled: Record<string, string>
  /** Rows deleted elsewhere after they were appended here: a log forgets nothing, the browser half hides them. */
  hidden: string[]
  /** Sessions whose conversation was deleted elsewhere: the browser half archives them (the host has no archive) and reports back. */
  toArchive: string[]
  /** 0.1.36 kept the other devices' chats as mirrors; a state that still has them is migrated (`migrate`). */
  mirrors?: Record<string, unknown>
}

export function emptyState(): SyncState {
  return { accountId: '', cursor: 0, enabled: true, mainSession: '', cids: {}, mids: {}, titles: {}, conversations: {}, pulled: {}, hidden: [], toArchive: [] }
}

/**
 * A 0.1.36 state (mirrors, no `conversations`) starts the pull over from zero: what the
 * mirrors held becomes sessions and log rows on that pull; the ids of what this device
 * pushed stay, so nothing goes up twice, and our own rows coming back are known by device.
 */
export function migrate(state: SyncState | undefined): SyncState {
  if (!state) return emptyState()
  const next: SyncState = { ...emptyState(), ...state }
  if ('mirrors' in next || !state.conversations) {
    delete next.mirrors
    next.cursor = 0
    next.conversations = {}
    next.pulled = {}
    next.hidden = []
    next.toArchive = []
  }
  return next
}

export interface SyncEngineOptions {
  relay: SyncRelay
  sessions: SyncSessions
  /** The account key when signed in; nothing when not. */
  token(): Promise<string | undefined>
  deviceId(): string
  /** Sessions that are another device's tasks (`task.ts`) are not synced: they are that device's conversation. */
  isTaskSession?(sessionId: string): boolean
  load(): SyncState | undefined
  save(state: SyncState): Promise<void>
  /** The view changed: tell the browser half. */
  onChange?(): void
  log?(level: 'info' | 'warn' | 'debug', text: string): void
  pushDelayMs?: number
  pullEveryMs?: number
}

/** What the browser half reads: Data controls, the chats column and the bubbles from elsewhere. */
export interface SyncView {
  enabled: boolean
  available: boolean
  paused: boolean
  cursor: number
  relay: SyncRelayState | null
  /** Grows with every change applied here; the browser half re-reads a session's remote rows when it moves. */
  rev: number
  /** The session that holds the account's main conversation ('' before the chats column named one). */
  mainSession: string
  /** Sessions that hold a synced conversation: listed in the chats column even before a turn ran here. */
  sessions: string[]
  /** mids of rows deleted elsewhere: hidden in the transcript. */
  hidden: string[]
  /** Sessions whose conversation was deleted elsewhere: to be archived by the browser half. */
  toArchive: string[]
}

export class SyncEngine {
  state: SyncState
  private paused = false
  private pushTimer: ReturnType<typeof setTimeout> | undefined
  private pullTimer: ReturnType<typeof setInterval> | undefined
  private readonly dirty = new Set<string>()
  private pulling: Promise<number> | undefined
  private pushing: Promise<void> | undefined
  private relayState: SyncRelayState | null = null
  private lastError = ''
  private rev = 0

  constructor(private readonly options: SyncEngineOptions) {
    this.state = migrate(options.load())
  }

  get enabled(): boolean {
    return this.state.enabled
  }

  /** On, signed in, and the key not refused. */
  async active(): Promise<boolean> {
    return this.state.enabled && !this.paused && Boolean(await this.options.token())
  }

  view(): SyncView {
    return {
      enabled: this.state.enabled,
      available: !this.paused && Boolean(this.state.accountId),
      paused: this.paused,
      cursor: this.state.cursor,
      relay: this.relayState,
      rev: this.rev,
      mainSession: this.state.mainSession,
      sessions: Object.keys(this.state.cids),
      hidden: [...this.state.hidden],
      toArchive: [...this.state.toArchive],
    }
  }

  /** The conversation id a session syncs under, when it has one. */
  cidOf(sessionId: string): string | undefined {
    return this.state.cids[sessionId]
  }

  // ---- lifecycle ----------------------------------------------------------------------------

  start(): void {
    this.pullTimer ??= setInterval(() => void this.pullQuietly(), this.options.pullEveryMs ?? PULL_EVERY_MS)
    // pull first: the relay's history reaches the sessions here before ours goes up
    void this.pullQuietly().then(() => this.pushAllSoon())
  }

  stop(): void {
    if (this.pullTimer) clearInterval(this.pullTimer)
    this.pullTimer = undefined
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = undefined
  }

  /** A sign-in: a different account starts from cursor 0 with fresh ids. */
  async accountChanged(accountId: string): Promise<void> {
    this.paused = false
    if (accountId && accountId !== this.state.accountId) {
      this.state = { ...emptyState(), enabled: this.state.enabled, mainSession: this.state.mainSession, accountId }
      await this.save()
    }
    void this.pullQuietly().then(() => this.pushAllSoon())
  }

  signedOut(): void {
    this.paused = false
    this.relayState = null
    this.changed()
  }

  /**
   * The chats column's main chat. While the account's main conversation already lives in a
   * session here, that session stays the main chat (one thread, C8): the id of the one it
   * lives in comes back for the column to adopt. Otherwise the session becomes the main chat
   * and takes the relay's main conversation id when the relay has one.
   */
  async setMain(sessionId: string): Promise<string> {
    const current = this.state.mainSession
    if (!sessionId || current === sessionId) return current
    if (current && this.holdsMain(current)) return current
    this.state.mainSession = sessionId
    const mainCid = this.mainCid()
    if (mainCid && !this.state.cids[sessionId]) {
      this.state.cids[sessionId] = mainCid
      this.state.titles[sessionId] = this.state.conversations[mainCid]?.title ?? ''
    } else {
      delete this.state.titles[sessionId]
    }
    await this.save()
    this.dirty.add(sessionId)
    this.pushSoon(200)
    this.changed()
    return sessionId
  }

  /** The browser half archived the sessions whose conversations were deleted elsewhere. */
  async archived(sessionIds: string[]): Promise<void> {
    const done = new Set(sessionIds)
    this.state.toArchive = this.state.toArchive.filter((id) => !done.has(id))
    await this.save()
    this.changed()
  }

  private holdsMain(sessionId: string): boolean {
    const cid = this.state.cids[sessionId]
    return Boolean(cid && this.state.conversations[cid]?.kind === 'main')
  }

  private mainCid(): string | undefined {
    for (const [cid, c] of Object.entries(this.state.conversations)) if (c.kind === 'main') return cid
    return undefined
  }

  // ---- the switch ---------------------------------------------------------------------------

  async setEnabled(enabled: boolean): Promise<SyncView> {
    const token = await this.options.token()
    if (token) {
      try {
        this.relayState = await this.options.relay.setEnabled(token, enabled)
      } catch (error: unknown) {
        this.noteError(error)
        throw error
      }
    }
    this.state.enabled = enabled
    if (enabled) {
      this.paused = false
      // on again: this device's conversations go up in full
      this.state.titles = {}
      this.state.mids = {}
    }
    await this.save()
    if (enabled) void this.pullQuietly().then(() => this.pushAllSoon())
    this.changed()
    return this.view()
  }

  async relayStatus(): Promise<SyncRelayState | null> {
    const token = await this.options.token()
    if (!token) return (this.relayState = null)
    try {
      this.relayState = await this.options.relay.state(token)
    } catch (error: unknown) {
      this.noteError(error)
    }
    return this.relayState
  }

  /** "Delete synced conversations": the relay's store emptied; what it knew is forgotten here, the sessions stay. */
  async deleteRemote(): Promise<SyncView> {
    const token = await this.options.token()
    if (token) {
      this.relayState = await this.options.relay.wipe(token)
      this.state.cursor = this.relayState.cursor
    }
    this.state.conversations = {}
    this.state.mids = {}
    this.state.titles = {}
    await this.save()
    this.changed()
    return this.view()
  }

  // ---- hooks --------------------------------------------------------------------------------

  /** The person sent a message in a session here: it goes up now (C8), not when the turn ends. */
  messageSent(sessionId: string): void {
    if (this.options.isTaskSession?.(sessionId)) return
    this.dirty.add(sessionId)
    this.pushSoon(Math.min(SEND_DELAY_MS, this.options.pushDelayMs ?? PUSH_DELAY_MS))
    // a new prompt here is a new anchor for the other devices' bubbles: the browser half re-reads them
    if (this.kept(sessionId)) this.changed()
  }

  /** Whether a session shows turns from the other devices (a pulled row, or one hidden). */
  private kept(sessionId: string): boolean {
    return Object.values(this.state.pulled).includes(sessionId)
  }

  /** A turn ended in a session here: the model's final text goes up after the debounce. */
  turnEnded(sessionId: string): void {
    if (this.options.isTaskSession?.(sessionId)) return
    this.dirty.add(sessionId)
    this.pushSoon(this.options.pushDelayMs ?? PUSH_DELAY_MS)
  }

  sessionRenamed(sessionId: string): void {
    if (this.options.isTaskSession?.(sessionId)) return
    this.dirty.add(sessionId)
    this.pushSoon(200)
  }

  /** The relay's `sync` frame: another device pushed. */
  onFrame(frame: { cursor?: number; from?: string }): void {
    if (frame.from && frame.from === this.options.deviceId()) return
    if (typeof frame.cursor === 'number' && frame.cursor <= this.state.cursor) return
    void this.pullQuietly()
  }

  // ---- push ---------------------------------------------------------------------------------

  private pushSoon(delayMs: number): void {
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => {
      this.pushTimer = undefined
      void this.push().catch(() => undefined)
    }, delayMs)
  }

  /** Every session that is not a task: on start and when the switch goes on. */
  private pushAllSoon(): void {
    void this.options.sessions
      .list()
      .then((sessions) => {
        for (const s of sessions) if (!s.blank && !this.options.isTaskSession?.(s.id)) this.dirty.add(s.id)
        this.pushSoon(this.options.pushDelayMs ?? PUSH_DELAY_MS)
      })
      .catch(() => undefined)
  }

  /** The dirty sessions' new lines to the relay, oldest session first, one POST of up to 200 messages at a time; one push at a time. */
  push(): Promise<void> {
    const run = (): Promise<void> => {
      const p = this.pushNow()
        .catch((error: unknown) => {
          this.noteError(error)
          throw error
        })
        .finally(() => {
          if (this.pushing === p) this.pushing = undefined
        })
      this.pushing = p
      return p
    }
    return this.pushing ? this.pushing.then(run, run) : run()
  }

  private async pushNow(): Promise<void> {
    if (!(await this.active())) return
    const token = await this.options.token()
    if (!token) return
    const device = this.options.deviceId()
    const sessions = new Map((await this.options.sessions.list()).map((s) => [s.id, s]))
    // oldest first: a history going up in full arrives in the order it was lived
    const ids = [...this.dirty].sort((a, b) => (sessions.get(a)?.createdAt ?? 0) - (sessions.get(b)?.createdAt ?? 0))
    this.dirty.clear()
    for (let round = 0; round < 50 && ids.length > 0; round++) {
      const conversations: Record<string, unknown>[] = []
      const messages: Record<string, unknown>[] = []
      const pending: Array<{ sessionId: string; line: SessionLine; mid: string }> = []
      const touched: string[] = []
      const unvisited = new Set(ids)
      for (const sessionId of ids) {
        unvisited.delete(sessionId)
        const info = sessions.get(sessionId)
        if (!info || this.options.isTaskSession?.(sessionId)) continue
        const cid = this.cidFor(sessionId)
        const title = info.title || 'New chat'
        if (this.state.titles[sessionId] !== title) {
          conversations.push({ cid, kind: sessionId === this.state.mainSession ? 'main' : 'side', title, created_at: Math.floor(info.createdAt / 1000), updated_at: Math.floor(info.updatedAt / 1000) })
        }
        const lines = await this.options.sessions.lines(sessionId)
        for (const line of lines) {
          if (this.state.mids[line.id]) continue
          if (messages.length >= MAX_POST_MESSAGES) break
          const mid = randomUUID()
          messages.push({ mid, cid, role: line.role, text: line.text, created_at: Math.floor(line.at / 1000) })
          pending.push({ sessionId, line, mid })
        }
        touched.push(sessionId)
        if (messages.length >= MAX_POST_MESSAGES) break
      }
      if (conversations.length === 0 && messages.length === 0) break
      const out = await this.options.relay.push(token, device, conversations, messages)
      const redirect = new Map<string, string>()
      for (const r of out.rejected) if (r.reason === 'main_exists' && r.cid && r.cid_main) redirect.set(r.cid, r.cid_main)
      if (redirect.size > 0) {
        // the account's main chat has an id already: ours takes it; its lines go again next round
        for (const [sid, cid] of Object.entries(this.state.cids)) {
          const to = redirect.get(cid)
          if (to) {
            this.state.cids[sid] = to
            delete this.state.titles[sid]
            this.log('info', 'nanomuse sync: the main chat adopts the account’s conversation id')
          }
        }
      }
      const refused = new Map(out.rejected.filter((r) => r.mid && r.reason !== 'main_exists').map((r) => [r.mid!, r.reason]))
      const redirected = new Set(out.rejected.filter((r) => r.mid && r.reason === 'main_exists').map((r) => r.mid!))
      for (const p of pending) {
        if (redirected.has(p.mid)) continue
        // a refused row stays refused: it is not sent again and again
        this.state.mids[p.line.id] = refused.has(p.mid) ? `refused:${refused.get(p.mid)}` : p.mid
      }
      for (const c of conversations) {
        if (out.rejected.some((r) => r.cid === c.cid)) continue
        for (const [sid, cid] of Object.entries(this.state.cids)) if (cid === c.cid) this.state.titles[sid] = String(c.title)
        const known = this.state.conversations[String(c.cid)]
        this.state.conversations[String(c.cid)] = {
          kind: c.kind === 'main' ? 'main' : 'side',
          title: String(c.title),
          device: known?.device || device,
          deviceName: known?.deviceName ?? '',
          createdAt: known?.createdAt || Number(c.created_at),
          updatedAt: Math.max(known?.updatedAt ?? 0, Number(c.updated_at)),
        }
      }
      await this.save()
      // sessions with more than 200 new lines, the redirected ones and those the round did not reach go again
      const again = new Set<string>(unvisited)
      for (const sid of touched) {
        const lines = await this.options.sessions.lines(sid)
        if (lines.some((l) => !this.state.mids[l.id])) again.add(sid)
      }
      ids.splice(0, ids.length, ...ids.filter((sid) => again.has(sid)))
    }
    if (ids.length > 0) {
      // a very long history: the rest goes after the next debounce
      for (const sid of ids) this.dirty.add(sid)
      this.pushSoon(this.options.pushDelayMs ?? PUSH_DELAY_MS)
    }
    // our rows come back on the next pull (known by device, no change) and the cursor catches up
    void this.pullQuietly()
  }

  private cidFor(sessionId: string): string {
    let cid = this.state.cids[sessionId]
    if (!cid) {
      // the main chat takes the account's main conversation id when the relay has one
      cid = (sessionId === this.state.mainSession ? this.mainCid() : undefined) ?? randomUUID()
      this.state.cids[sessionId] = cid
    }
    return cid
  }

  // ---- pull ---------------------------------------------------------------------------------

  /** A pull that joins the one in flight, and tells nobody when it fails (rule 7). */
  private pullQuietly(): Promise<number> {
    return (this.pulling ?? this.pull()).catch(() => 0)
  }

  /** What the other devices pushed since our cursor, applied in order; how many rows. One at a time. */
  pull(): Promise<number> {
    const run = (): Promise<number> => {
      const p = this.pullNow()
        .catch((error: unknown) => {
          this.noteError(error)
          throw error
        })
        .finally(() => {
          if (this.pulling === p) this.pulling = undefined
        })
      this.pulling = p
      return p
    }
    return this.pulling ? this.pulling.then(run, run) : run()
  }

  private async pullNow(): Promise<number> {
    if (!(await this.active())) return 0
    const token = await this.options.token()
    if (!token) return 0
    let applied = 0
    // what the other devices added to conversations living in sessions here: context for the model, per session
    const notes = new Map<string, RemoteLine[]>()
    for (let page = 0; page < 50; page++) {
      const out = await this.options.relay.changes(token, this.state.cursor, PAGE)
      // The page's conversations first, then its messages, each in seq order: a rename puts
      // a conversation's seq above its messages, and the relay sends every message's
      // conversation along with the page so none of them is an orphan.
      for (const c of [...out.conversations].sort((a, b) => a.seq - b.seq)) {
        await this.applyConversation(c)
        applied += 1
      }
      for (const m of [...out.messages].sort((a, b) => a.seq - b.seq)) {
        await this.applyMessage(m, notes)
        applied += 1
      }
      this.state.cursor = Math.max(this.state.cursor, out.cursor)
      await this.save()
      if (!out.more) break
    }
    this.lastError = ''
    for (const [sessionId, lines] of notes) {
      await this.options.sessions.inject(sessionId, meanwhileNote(lines)).catch((error: unknown) => this.log('warn', `nanomuse sync: context not injected: ${message(error)}`))
    }
    if (applied > 0) {
      this.log('info', `nanomuse sync: ${applied} change(s) from the account’s other devices`)
      this.changed()
    }
    return applied
  }

  private async applyConversation(c: WireConversation): Promise<void> {
    let sessionId = this.sessionOf(c.cid)
    if (c.deleted) {
      delete this.state.conversations[c.cid]
      if (sessionId) {
        // the harness has no delete: the session stops syncing under that id, and the chats column archives it
        delete this.state.cids[sessionId]
        delete this.state.titles[sessionId]
        if (sessionId !== this.state.mainSession && !this.state.toArchive.includes(sessionId)) this.state.toArchive.push(sessionId)
      }
      return
    }
    const known = this.state.conversations[c.cid]
    this.state.conversations[c.cid] = {
      kind: c.kind,
      title: c.title || known?.title || '',
      device: known?.device || c.device,
      deviceName: known?.deviceName || c.device_name,
      createdAt: known?.createdAt || c.created_at,
      updatedAt: Math.max(known?.updatedAt ?? 0, c.updated_at),
    }
    if (!sessionId) {
      if (c.kind === 'main' && this.state.mainSession) {
        // Identifiers: the account's main conversation already exists — our main chat adopts its id
        // (ours was never accepted as main, or the relay would have refused theirs: its lines are
        // still unpushed and go up under the adopted id)
        sessionId = this.state.mainSession
        this.state.cids[sessionId] = c.cid
        if (c.title) this.state.titles[sessionId] = c.title
        else delete this.state.titles[sessionId]
        this.dirty.add(sessionId)
        this.pushSoon(500)
        this.log('info', 'nanomuse sync: the main chat adopts the account’s conversation id')
      } else {
        // one thread (C8): a conversation from elsewhere is a chat here from the moment it is known
        const title = c.title || (c.kind === 'main' ? 'Main chat' : 'New chat')
        try {
          sessionId = await this.options.sessions.create(title)
        } catch (error: unknown) {
          this.log('warn', `nanomuse sync: no session for a synced conversation: ${message(error)}`)
          return
        }
        this.state.cids[sessionId] = c.cid
        this.state.titles[sessionId] = title
        if (c.kind === 'main') this.state.mainSession = sessionId
      }
      return
    }
    if (c.title && known && known.title !== c.title && this.state.titles[sessionId] !== c.title) {
      // renamed elsewhere: renamed here, and not pushed back
      this.state.titles[sessionId] = c.title
      await this.options.sessions.rename(sessionId, c.title).catch(() => undefined)
    }
  }

  private async applyMessage(m: WireMessage, notes: Map<string, RemoteLine[]>): Promise<void> {
    if (m.deleted) {
      const kept = this.state.pulled[m.mid]
      if (kept) {
        if (!this.state.hidden.includes(m.mid)) this.state.hidden.push(m.mid)
        await this.options.sessions.forget(kept, m.mid).catch(() => undefined)
      }
      return
    }
    // once is enough: a row kept here already, or our own words coming back
    if (this.state.pulled[m.mid]) return
    if (m.device === this.options.deviceId()) return
    const sessionId = this.sessionOf(m.cid)
    if (!sessionId) return
    const line: RemoteLine = { mid: m.mid, role: m.role, text: m.text, at: m.created_at * 1000, device: m.device, deviceName: m.device_name }
    try {
      await this.options.sessions.keep(sessionId, line)
      this.state.pulled[m.mid] = sessionId
      notes.set(sessionId, [...(notes.get(sessionId) ?? []), line])
    } catch (error: unknown) {
      this.log('warn', `nanomuse sync: a turn from ${m.device_name || 'another device'} did not reach its chat: ${message(error)}`)
    }
  }

  private sessionOf(cid: string): string | undefined {
    for (const [sid, c] of Object.entries(this.state.cids)) if (c === cid) return sid
    return undefined
  }

  // ---- errors -------------------------------------------------------------------------------

  /** Rule 7: network errors are silent; `sync_off` flips the switch here; a refused key pauses until the next sign-in. */
  private noteError(error: unknown): void {
    if (error instanceof RelayError) {
      if (error.code === 'sync_off') {
        this.state.enabled = false
        void this.save()
        this.log('info', 'nanomuse sync: turned off on another device; off here too')
        this.changed()
        return
      }
      if (error.status === 401) {
        this.paused = true
        this.lastError = 'signed_out'
        this.changed()
        return
      }
      this.lastError = error.code
    } else {
      this.lastError = message(error)
    }
    this.log('debug', `nanomuse sync: ${this.lastError}`)
  }

  get error(): string {
    return this.lastError
  }

  private changed(): void {
    this.rev += 1
    this.options.onChange?.()
  }

  private async save(): Promise<void> {
    await this.options.save(this.state).catch((error: unknown) => this.log('warn', `nanomuse sync: state not written: ${message(error)}`))
  }

  private log(level: 'info' | 'warn' | 'debug', text: string): void {
    this.options.log?.(level, text)
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
