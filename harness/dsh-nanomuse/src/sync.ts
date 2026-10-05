/**
 * Conversations synced between the account's devices (contract C7), the desktop's
 * half. The relay keeps the text of every conversation under `/v1/sync/*`; this
 * computer pushes the user and assistant texts of its dsh sessions after each
 * finished turn and pulls what the other devices pushed — on start, on the hub's
 * `sync` frame and every minute.
 *
 * The path taken here: **mirrors**. A dsh session's log is append-only and owned
 * by the agent loop (`Session.append` needs turn and step numbers, surface intents
 * and, for an assistant message, its model stream), so a transcript written on
 * another device cannot be appended to a session as history. A synced
 * conversation therefore shows in the chats column as a *mirror* — the title, the
 * device it came from ("From Pixel 8") and its transcript, read-only — with
 * **Continue here**: that starts a dsh session with the same title, maps it to the
 * conversation, and hands the transcript to the model as context (`agent.inject`,
 * model-facing, not shown as the person's words). From then on the session's turns
 * sync back under the same conversation id, and what the other devices add to the
 * conversation reaches the session as context the same way, so the model knows
 * what was said elsewhere.
 *
 * The main chat: the chats column decides which session is the main chat (the
 * host is told with `sync/main`); that session is pushed as `kind: "main"`, and the
 * relay's one main conversation per account is adopted when it already has one.
 *
 * Never a key in a log, never a file: attachments travel as names and sizes.
 */
import { randomUUID } from 'node:crypto'
import { RelayError } from './relay.ts'

/** The relay's limits (contract C7). */
export const MAX_POST_MESSAGES = 200
export const PUSH_DELAY_MS = 2000
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

/** The slice of the session API the engine uses; `cloud.ts` binds it to `ctx.sessionController`, tests fake it. */
export interface SyncSessions {
  list(): Promise<SessionInfo[]>
  /** The session's human prompts and final assistant texts, in order; [] for a session that cannot be read. */
  lines(sessionId: string): Promise<SessionLine[]>
  create(title: string): Promise<string>
  rename(sessionId: string, title: string): Promise<void>
  /** Model-facing context for the session's next step (`agent.inject`); never shown as the person's words. */
  inject(sessionId: string, text: string): Promise<void>
}

// ---- state --------------------------------------------------------------------------------

export interface MirrorMessage {
  mid: string
  role: 'user' | 'assistant'
  text: string
  /** Unix seconds, the relay's clock. */
  createdAt: number
  device: string
  deviceName: string
}

/** A synced conversation as this computer keeps it: the relay's copy, read-only until "Continue here". */
export interface Mirror {
  cid: string
  kind: 'main' | 'side'
  title: string
  device: string
  deviceName: string
  createdAt: number
  updatedAt: number
  messages: MirrorMessage[]
}

export interface SyncState {
  accountId: string
  cursor: number
  enabled: boolean
  /** The session the chats column calls the main chat. */
  mainSession: string
  /** dsh session id → conversation id. */
  cids: Record<string, string>
  /** dsh message id → the mid it was pushed as. */
  mids: Record<string, string>
  /** session id → the title last pushed. */
  titles: Record<string, string>
  mirrors: Record<string, Mirror>
}

export function emptyState(): SyncState {
  return { accountId: '', cursor: 0, enabled: true, mainSession: '', cids: {}, mids: {}, titles: {}, mirrors: {} }
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

/** What the browser half shows: Data controls and the mirrors in the chats column. */
export interface SyncView {
  enabled: boolean
  available: boolean
  paused: boolean
  cursor: number
  relay: SyncRelayState | null
  mirrors: Array<{ cid: string; kind: 'main' | 'side'; title: string; device: string; deviceName: string; messages: number; updatedAt: number; sessionId: string | null }>
  /** session id → the device the conversation came from, for the badge on a continued chat. */
  origins: Record<string, { device: string; deviceName: string }>
}

/** The one-line note the model reads in front of a transcript from elsewhere. */
export function transcriptNote(title: string, deviceName: string, messages: MirrorMessage[], here: string): string {
  const lines = messages.map((m) => `${m.role === 'user' ? 'Person' : 'Muse'}${m.deviceName && m.deviceName !== here ? ` (on ${m.deviceName})` : ''}: ${m.text}`)
  const from = deviceName ? ` on ${deviceName}` : ' on another device'
  return `[This conversation, "${title}", was started${from} and continues here on ${here}. What was said so far:]\n${lines.join('\n')}`
}

/** The note for messages added elsewhere to a conversation that lives in a session here. */
export function meanwhileNote(messages: MirrorMessage[]): string {
  const lines = messages.map((m) => `${m.role === 'user' ? 'Person' : 'Muse'}${m.deviceName ? ` (on ${m.deviceName})` : ''}: ${m.text}`)
  return `[Meanwhile, in this same conversation on another device of the account:]\n${lines.join('\n')}`
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

  constructor(private readonly options: SyncEngineOptions) {
    this.state = options.load() ?? emptyState()
  }

  get enabled(): boolean {
    return this.state.enabled
  }

  /** On, signed in, and the key not refused. */
  async active(): Promise<boolean> {
    return this.state.enabled && !this.paused && Boolean(await this.options.token())
  }

  view(): SyncView {
    const bySession = new Map(Object.entries(this.state.cids).map(([sid, cid]) => [cid, sid]))
    const origins: SyncView['origins'] = {}
    for (const [sid, cid] of Object.entries(this.state.cids)) {
      const m = this.state.mirrors[cid]
      if (m && m.device && m.device !== this.options.deviceId()) origins[sid] = { device: m.device, deviceName: m.deviceName }
    }
    return {
      enabled: this.state.enabled,
      available: !this.paused && Boolean(this.state.accountId),
      paused: this.paused,
      cursor: this.state.cursor,
      relay: this.relayState,
      mirrors: Object.values(this.state.mirrors)
        .filter((m) => m.device !== this.options.deviceId() || bySession.has(m.cid))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((m) => ({ cid: m.cid, kind: m.kind, title: m.title, device: m.device, deviceName: m.deviceName, messages: m.messages.length, updatedAt: m.updatedAt, sessionId: bySession.get(m.cid) ?? null })),
      origins,
    }
  }

  /** The transcript of one mirror, for the read-only view. */
  mirror(cid: string): Mirror | undefined {
    return this.state.mirrors[cid]
  }

  // ---- lifecycle ----------------------------------------------------------------------------

  start(): void {
    this.pullTimer ??= setInterval(() => void this.pullQuietly(), this.options.pullEveryMs ?? PULL_EVERY_MS)
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
    this.options.onChange?.()
  }

  /** The chats column's main chat: pushed as the account's one main conversation. */
  async setMain(sessionId: string): Promise<void> {
    if (!sessionId || this.state.mainSession === sessionId) return
    this.state.mainSession = sessionId
    delete this.state.titles[sessionId]
    await this.save()
    this.dirty.add(sessionId)
    this.pushSoon(200)
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
    this.options.onChange?.()
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

  /** "Delete synced conversations": the relay's store emptied; the mirrors here go with it, the sessions stay. */
  async deleteRemote(): Promise<SyncView> {
    const token = await this.options.token()
    if (token) {
      this.relayState = await this.options.relay.wipe(token)
      this.state.cursor = this.relayState.cursor
    }
    this.state.mirrors = {}
    this.state.mids = {}
    this.state.titles = {}
    await this.save()
    this.options.onChange?.()
    return this.view()
  }

  // ---- hooks --------------------------------------------------------------------------------

  /** A turn ended in a session here: its new lines go up after the debounce. */
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

  /** The dirty sessions' new lines to the relay, one POST of up to 200 messages at a time; one push at a time. */
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
    const ids = [...this.dirty]
    this.dirty.clear()
    const sessions = new Map((await this.options.sessions.list()).map((s) => [s.id, s]))
    for (let round = 0; round < 50 && ids.length > 0; round++) {
      const conversations: Record<string, unknown>[] = []
      const messages: Record<string, unknown>[] = []
      const pending: Array<{ sessionId: string; line: SessionLine; mid: string }> = []
      const touched: string[] = []
      for (const sessionId of ids) {
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
      }
      await this.save()
      // sessions with more than 200 new lines, and the redirected ones, go again
      const again = new Set<string>()
      for (const sid of touched) {
        const lines = await this.options.sessions.lines(sid)
        if (lines.some((l) => !this.state.mids[l.id])) again.add(sid)
      }
      ids.splice(0, ids.length, ...again)
    }
    // our rows come back on the next pull (known mids, no change) and the cursor catches up
    void this.pullQuietly()
  }

  private cidFor(sessionId: string): string {
    let cid = this.state.cids[sessionId]
    if (!cid) {
      cid = randomUUID()
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
    const notes = new Map<string, MirrorMessage[]>()
    for (let page = 0; page < 50; page++) {
      const out = await this.options.relay.changes(token, this.state.cursor, PAGE)
      // The page's conversations first, then its messages, each in seq order: a rename puts
      // a conversation's seq above its messages, and the relay sends every message's
      // conversation along with the page so none of them is an orphan.
      for (const c of [...out.conversations].sort((a, b) => a.seq - b.seq)) {
        this.applyConversation(c)
        applied += 1
      }
      for (const m of [...out.messages].sort((a, b) => a.seq - b.seq)) {
        this.applyMessage(m, notes)
        applied += 1
      }
      this.state.cursor = Math.max(this.state.cursor, out.cursor)
      await this.save()
      if (!out.more) break
    }
    this.lastError = ''
    // what the other devices added to conversations living in sessions here: context for the model
    for (const [sessionId, messages] of notes) {
      await this.options.sessions.inject(sessionId, meanwhileNote(messages)).catch((error: unknown) => this.log('warn', `nanomuse sync: context not injected: ${message(error)}`))
    }
    if (applied > 0) {
      this.log('info', `nanomuse sync: ${applied} change(s) from the account’s other devices`)
      this.options.onChange?.()
    }
    return applied
  }

  private applyConversation(c: WireConversation): void {
    const sessionId = this.sessionOf(c.cid)
    if (c.deleted) {
      delete this.state.mirrors[c.cid]
      if (sessionId) {
        // the session stays (the harness has no delete); it just stops syncing under that id
        delete this.state.cids[sessionId]
        delete this.state.titles[sessionId]
      }
      return
    }
    const known = this.state.mirrors[c.cid]
    if (c.kind === 'main' && !sessionId && this.state.mainSession) {
      // Identifiers: the account's main conversation already exists — our main chat adopts its id
      // (ours was never accepted as main, or the relay would have refused theirs: its lines are
      // still unpushed and go up under the adopted id)
      if (this.state.cids[this.state.mainSession] !== c.cid) {
        this.state.cids[this.state.mainSession] = c.cid
        delete this.state.titles[this.state.mainSession]
        this.dirty.add(this.state.mainSession)
        this.pushSoon(500)
      }
    }
    this.state.mirrors[c.cid] = {
      cid: c.cid,
      kind: c.kind,
      title: c.title || known?.title || 'New chat',
      device: known?.device || c.device,
      deviceName: known?.deviceName || c.device_name,
      createdAt: known?.createdAt || c.created_at,
      updatedAt: Math.max(known?.updatedAt ?? 0, c.updated_at),
      messages: known?.messages ?? [],
    }
    if (sessionId && known && known.title !== c.title && c.title && this.state.titles[sessionId] !== c.title) {
      this.state.titles[sessionId] = c.title
      void this.options.sessions.rename(sessionId, c.title).catch(() => undefined)
    }
  }

  private applyMessage(m: WireMessage, notes: Map<string, MirrorMessage[]>): void {
    const mirror = this.state.mirrors[m.cid]
    if (!mirror) return
    if (m.deleted) {
      mirror.messages = mirror.messages.filter((x) => x.mid !== m.mid)
      return
    }
    if (mirror.messages.some((x) => x.mid === m.mid)) return
    const own = m.device === this.options.deviceId()
    const row: MirrorMessage = { mid: m.mid, role: m.role, text: m.text, createdAt: m.created_at, device: m.device, deviceName: m.device_name }
    mirror.messages.push(row)
    mirror.messages.sort((a, b) => a.createdAt - b.createdAt)
    mirror.updatedAt = Math.max(mirror.updatedAt, m.created_at)
    const sessionId = this.sessionOf(m.cid)
    if (sessionId && !own) {
      const list = notes.get(sessionId) ?? []
      list.push(row)
      notes.set(sessionId, list)
    }
  }

  private sessionOf(cid: string): string | undefined {
    for (const [sid, c] of Object.entries(this.state.cids)) if (c === cid) return sid
    return undefined
  }

  // ---- continue here ------------------------------------------------------------------------

  /**
   * A mirror becomes a session here: created with the conversation's title, mapped to its id,
   * the transcript handed to the model as context. The relay already has these messages, so
   * nothing is pushed for them; the session's own turns sync from now on.
   */
  async continueHere(cid: string, here: string): Promise<string> {
    const mirror = this.state.mirrors[cid]
    if (!mirror) throw new RelayError(404, 'not_found', 'No such synced conversation')
    const existing = this.sessionOf(cid)
    if (existing) return existing
    const sessionId = await this.options.sessions.create(mirror.title)
    this.state.cids[sessionId] = cid
    this.state.titles[sessionId] = mirror.title
    await this.save()
    if (mirror.messages.length > 0) {
      await this.options.sessions.inject(sessionId, transcriptNote(mirror.title, mirror.deviceName, mirror.messages, here)).catch((error: unknown) => this.log('warn', `nanomuse sync: transcript not injected: ${message(error)}`))
    }
    this.options.onChange?.()
    return sessionId
  }

  // ---- errors -------------------------------------------------------------------------------

  /** Rule 7: network errors are silent; `sync_off` flips the switch here; a refused key pauses until the next sign-in. */
  private noteError(error: unknown): void {
    if (error instanceof RelayError) {
      if (error.code === 'sync_off') {
        this.state.enabled = false
        void this.save()
        this.log('info', 'nanomuse sync: turned off on another device; off here too')
        this.options.onChange?.()
        return
      }
      if (error.status === 401) {
        this.paused = true
        this.lastError = 'signed_out'
        this.options.onChange?.()
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
