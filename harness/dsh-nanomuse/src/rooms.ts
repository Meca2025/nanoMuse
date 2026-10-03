/**
 * The rooms of the Muse desktop — Feed, Ideas, Goals, Library — as a host
 * service over the harness's own primitives, no second runtime:
 *
 * - **Feed** (动态): short posts the agent writes for the person — news on what
 *   they follow, a nudge on a goal, a plan for the day — a batch a day, written
 *   in a background dsh session (the agent's full tool set, so a post about
 *   today's news comes from `web_search`, with its source linked) that is
 *   archived once the batch is parsed. The person's "feed instructions" say what
 *   they want to read there.
 * - **Ideas** (点子): things the agent could do for the person right now,
 *   grouped by theme, each with what it includes and how it works; "start" opens
 *   a chat with the idea's request.
 * - **Goals** (目标): a goal lives in its own dsh session — the agent shapes it
 *   there, sets up recurring checks with the harness's Schedule (`schedule_create`;
 *   those are the goal's "automations"), and every turn in that session becomes
 *   an entry on the goal's activity timeline. `goals_room_update` lets the agent write
 *   the status line from any chat.
 * - **Library** (构件): the files the agent delivered — every `present` call in
 *   any session lands here, plus what `library_add` names — by kind: documents,
 *   web pages, images, videos, audio.
 *
 * Everything is one JSON file, `$DSH_HOME/nanomuse/rooms.json`; the browser
 * half mirrors it over `/nanomuse/rooms/events` and acts through the routes
 * under `/nanomuse/rooms/*`. The tools and the prompt context the agent sees
 * are the preset row `dsh-nanomuse/rooms-tools`.
 */
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { deflateRawSync } from 'node:zlib'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from './cloud.ts'
import { dshHome, json, message, sameOrigin, send } from './cloud.ts'
import { RelayError } from './relay.ts'
import { textOf } from './task.ts'

export const API_PREFIX = '/nanomuse/rooms'

/** A background batch may run this long (web searches included). */
const RUN_TIMEOUT_MS = 8 * 60_000
/** A new feed batch is due this long after the last one. */
const FEED_EVERY_MS = 20 * 3600_000
/** Ideas go stale after a week. */
const IDEAS_EVERY_MS = 7 * 24 * 3600_000
/** A failed batch is not retried before this. */
const RETRY_AFTER_MS = 2 * 3600_000
const FEED_KEEP = 120
const ACTIVITY_KEEP = 60
const LIBRARY_KEEP = 500
const CHECK_EVERY_MS = 30 * 60_000
const FIRST_CHECK_MS = 90_000

export const AREAS = ['planning', 'research', 'goals', 'money', 'health', 'home', 'learning', 'people', 'files', 'fun', 'news'] as const
export type Area = (typeof AREAS)[number]
export const CATEGORIES = ['health', 'relationships', 'finance', 'career', 'hobbies', 'productivity', 'other'] as const
export type Category = (typeof CATEGORIES)[number]
export type GoalStatus = 'tracking' | 'done' | 'paused'
export type LibraryKind = 'document' | 'web' | 'image' | 'video' | 'audio' | 'file'

export interface FeedPost {
  id: string
  at: number
  title: string
  /** Markdown; links inline. */
  body: string
  area: string
  emoji: string
  /** A direct image URL the agent found with the story, or empty. */
  image: string
  /** A follow-up the person could send, or empty. */
  prompt: string
  liked: boolean
  /** The chat opened to discuss it, once there is one. */
  sessionId?: string
}

export interface Idea {
  id: string
  at: number
  group: string
  emoji: string
  title: string
  detail: string
  includes: string[]
  how: string
  prompt: string
  area: string
  /** The chat it was started in, once started. */
  started?: string
  dismissed?: boolean
}

export interface GoalActivity {
  at: number
  title: string
  text: string
}

export interface GoalAutomation {
  id: string
  title: string
  kind: string
  /** `daily@09:30`, `weekly 1,3@09:00`, `cron 0 9 * * 1-5`, `every 3600s`, or the one-shot instant. */
  rule: string
  next: string
}

export interface Goal {
  id: string
  title: string
  description: string
  category: Category
  status: GoalStatus
  /** The goal's chat. */
  sessionId: string
  createdAt: number
  updatedAt: number
  /** The agent's one-line status, as `goals_room_update` last wrote it. */
  summary: string
  activity: GoalActivity[]
}

export interface LibraryItem {
  id: string
  path: string
  name: string
  kind: LibraryKind
  description: string
  sessionId: string
  at: number
}

/** One thing the agent remembers about the person — a line, as on the phone's Memory screen. */
export interface MemoryItem {
  id: string
  at: number
  text: string
  /** Who wrote it: the agent in a chat, the person by hand, or an import. */
  source: 'agent' | 'person' | 'import'
}

interface Store {
  lang: string
  feed: { instructions: string; generatedAt: number; lastTry: number; posts: FeedPost[] }
  ideas: { generatedAt: number; lastTry: number; items: Idea[] }
  goals: Goal[]
  library: LibraryItem[]
  memory: MemoryItem[]
}

/** What the browser mirrors. */
export interface RoomsView extends Store {
  busy: { feed: boolean; ideas: boolean }
  automations: Record<string, GoalAutomation[]>
  /** Whether a model is reachable, so the empty rooms can say why they are empty. */
  ready: boolean
  /** The agent asked for the avatar studio (draw_new_look): the words and when; the window opens it once. */
  studio: { description: string; style: string; at: number }
}

/** `dsh-permission-presets`' service, as much of it as we use. */
interface PresetsLike {
  readonly names: readonly string[]
  set(session: Session, name: string): void
}

/** The harness's Schedule service, the part of it the goals use (optional at runtime). */
interface ScheduleLike {
  list(request: { sessionId: SessionId }): Promise<ScheduleRecordLike[]>
  delete(request: { sessionId: SessionId; id: string }): Promise<unknown>
}
interface ScheduleRecordLike {
  id: string
  kind: string
  title: string
  scheduledAt: string
  time?: string
  weekdays?: number[]
  expression?: string
  everySeconds?: number
}
interface RegistryLike {
  archiveSession(sessionId: SessionId, options?: { stopActivity?: boolean }): Promise<void>
}

interface Run {
  final: string
  resolve(text: string): void
  reject(error: Error): void
}

const EMPTY: Store = {
  lang: '',
  feed: { instructions: '', generatedAt: 0, lastTry: 0, posts: [] },
  ideas: { generatedAt: 0, lastTry: 0, items: [] },
  goals: [],
  library: [],
  memory: [],
}
const STUDIO_STYLES: Record<string, true> = { muse: true, flat: true, clay: true, watercolor: true, pixel: true, line: true, sticker: true }
const MEMORY_MAX = 400
const MEMORY_LINE = 400

const KINDS: Record<string, LibraryKind> = {
  '.md': 'document', '.markdown': 'document', '.txt': 'document', '.rtf': 'document', '.doc': 'document', '.docx': 'document', '.pdf': 'document', '.pptx': 'document', '.xlsx': 'document', '.csv': 'document', '.json': 'document', '.tex': 'document',
  '.html': 'web', '.htm': 'web',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.svg': 'image',
  '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.mkv': 'video',
  '.mp3': 'audio', '.m4a': 'audio', '.wav': 'audio', '.ogg': 'audio', '.flac': 'audio',
}
const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf', '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
}
const TEXT_KINDS = new Set(['.md', '.markdown', '.txt', '.html', '.htm', '.csv', '.json', '.tex', '.svg'])

declare module '@deepseek-ai/cordis' {
  interface Context {
    nanomuseRooms: NanomuseRooms
  }
}

export default class NanomuseRooms extends Service {
  static inject = ['nanomuseCloud']

  private store: Store = structuredClone(EMPTY)
  private readonly streams = new Set<ServerResponse>()
  private readonly runs = new Map<SessionId, Run>()
  /** Goal sessions → goal, and the last words the agent said in each (the next activity entry). */
  private readonly goalBySession = new Map<string, string>()
  private readonly lastWords = new Map<string, string>()
  /** When the current turn's first words arrived, per goal session. */
  private readonly turnMarks = new Map<string, number>()
  private automations: Record<string, GoalAutomation[]> = {}
  /** The tools as the last agent saw them (the registry's views are per agent); the Connectors page reads it. */
  private toolCatalog: { name: string; description: string }[] = []
  private catalogAt = 0
  private busy = { feed: false, ideas: false }
  private ready = false
  private studio = { description: '', style: 'muse', at: 0 }
  private writing: Promise<void> = Promise.resolve()
  private timer: NodeJS.Timeout | undefined

  constructor(ctx: Context) {
    super(ctx, 'nanomuseRooms')
  }

  async [Service.init](): Promise<void> {
    this.store = await this.read()
    for (const goal of this.store.goals) this.goalBySession.set(goal.sessionId, goal.id)
    this.ctx.effect(() => this.ctx.on('session/event', (session: Session, event: SessionEvent) => this.onEvent(session, event)), 'nanomuse rooms: session events')
    this.ctx.effect(() => this.ctx.on('schedule/changed' as never, (() => void this.refreshAutomations()) as never), 'nanomuse rooms: schedule changes')
    this.ctx.effect(() => this.ctx.nanomuseCloud.onChange(() => void this.syncReady().catch(() => undefined)), 'nanomuse rooms: cloud changes')
    this.ctx.inject(['webServer'], (ctx) => {
      ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: this.handle }), 'nanomuse rooms: api')
    })
    this.timer = setInterval(() => void this.tick().catch((error: unknown) => this.warn('tick', error)), CHECK_EVERY_MS)
    const first = setTimeout(() => void this.tick().catch((error: unknown) => this.warn('tick', error)), FIRST_CHECK_MS)
    this.ctx.effect(() => () => {
      if (this.timer) clearInterval(this.timer)
      clearTimeout(first)
      for (const res of this.streams) res.end()
      this.streams.clear()
      for (const run of this.runs.values()) run.reject(new Error('nanomuse rooms: shutting down'))
    }, 'nanomuse rooms: stop')
    // the schedule service may come up after us: read the automations once it is there, and again on demand
    this.ctx.inject(['schedule' as never], () => void this.refreshAutomations().catch(() => undefined))
  }

  // ---- the view --------------------------------------------------------------------

  view(): RoomsView {
    return { ...this.store, busy: { ...this.busy }, automations: this.automations, ready: this.ready, studio: this.studio }
  }

  /** The person's language for what the agent writes here (`zh-CN`, `en`, …). */
  get lang(): string {
    return this.store.lang || Intl.DateTimeFormat().resolvedOptions().locale || 'en'
  }

  /** The goals, for the agent's prompt context. */
  get goals(): readonly Goal[] {
    return this.store.goals
  }

  /** The agent asks the window to open the avatar studio with these words (the person draws from there). */
  requestStudio(description: string, style: string): void {
    this.studio = { description: description.replace(/\s+/g, ' ').trim().slice(0, 200), style: style in STUDIO_STYLES ? style : 'muse', at: Date.now() }
    this.broadcast()
  }

  /** What the agent remembers about the person, newest last; for the prompt context and the Memory tab. */
  get memory(): readonly MemoryItem[] {
    return this.store.memory
  }

  /** Keep one line; a line already there (loosely compared) is refreshed, not doubled. */
  async remember(text: string, source: MemoryItem['source'] = 'agent'): Promise<MemoryItem | null> {
    const line = text.replace(/\s+/g, ' ').trim().slice(0, MEMORY_LINE)
    if (!line) return null
    const key = titleKey(line)
    const existing = this.store.memory.find((m) => titleKey(m.text) === key)
    if (existing) {
      existing.at = Date.now()
      await this.save()
      return existing
    }
    const item: MemoryItem = { id: newId('mem'), at: Date.now(), text: line, source }
    this.store.memory.push(item)
    if (this.store.memory.length > MEMORY_MAX) this.store.memory.splice(0, this.store.memory.length - MEMORY_MAX)
    await this.save()
    return item
  }

  async forget(id: string): Promise<void> {
    const before = this.store.memory.length
    this.store.memory = this.store.memory.filter((m) => m.id !== id)
    if (this.store.memory.length !== before) await this.save()
  }

  /** Muse's "import memory": a text pasted from another assistant — one line or paragraph per memory. */
  async importMemory(text: string): Promise<number> {
    const lines = text.split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((l) => l.length > 1)
    let added = 0
    for (const line of lines.slice(0, 200)) {
      const before = this.store.memory.length
      await this.remember(line, 'import')
      if (this.store.memory.length > before) added++
    }
    return added
  }

  /** Snapshot the catalogue through an agent's view; the registry shows nothing from the root. */
  private snapshotTools(agent: Agent): void {
    const tools = this.ctx.get('tools') as { schemas(scope?: object): { name: string; description: string }[] } | undefined
    if (!tools) return
    try {
      this.toolCatalog = tools.schemas(agent).map((tool) => ({ name: tool.name, description: tool.description }))
      this.catalogAt = Date.now()
    } catch (error: unknown) {
      this.warn('tool catalogue', error)
    }
  }

  /** The MCP servers behind the preset's tools (`mcp__<server>__<tool>`), and how many tools are the harness's own. */
  connectors(): { servers: { name: string; tools: { name: string; description: string }[] }[]; builtin: number; at: number } {
    const tools = this.toolCatalog
    const servers = new Map<string, { name: string; description: string }[]>()
    let builtin = 0
    for (const tool of tools) {
      const match = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(tool.name)
      if (!match) {
        builtin++
        continue
      }
      const list = servers.get(match[1]!) ?? []
      list.push({ name: match[2]!, description: tool.description.split('\n')[0]!.slice(0, 160) })
      servers.set(match[1]!, list)
    }
    return { servers: [...servers].map(([name, list]) => ({ name, tools: list })), builtin, at: this.catalogAt }
  }

  // ---- data controls: the person's agent data, in a zip or gone ---------------------

  /**
   * Muse's "download your agent data": a zip in ~/Downloads with the account snapshot
   * (no token), the profile and faces, the rooms (feed, ideas, goals, library index,
   * memory) and the chats as dsh keeps them; the file manager shows it.
   */
  async exportData(): Promise<string> {
    const home = dshHome()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const folder = await downloadsDir()
    const out = join(folder, `nanoMuse-data-${stamp}.zip`)
    await mkdir(folder, { recursive: true })
    const entries: ZipEntry[] = []
    const add = async (folder: string, under: string, skip: (name: string) => boolean = () => false) => {
      let names: string[]
      try {
        names = await readdir(folder)
      } catch {
        return
      }
      for (const name of names) {
        if (skip(name)) continue
        const full = join(folder, name)
        const info = await stat(full).catch(() => null)
        if (!info) continue
        if (info.isDirectory()) await add(full, `${under}${name}/`, skip)
        else if (info.size <= 64 * 1024 * 1024) entries.push({ name: `${under}${name}`, data: await readFile(full), at: info.mtime })
      }
    }
    await add(join(home, 'nanomuse'), 'nanomuse/', (name) => name.endsWith('.tmp'))
    await add(join(home, 'sessions'), 'sessions/')
    const prefs = join(home, 'desktop.json')
    if (await stat(prefs).catch(() => null)) entries.push({ name: 'desktop.json', data: await readFile(prefs), at: new Date() })
    entries.push({ name: 'README.txt', at: new Date(), data: Buffer.from(['Your nanoMuse data, exported ' + new Date().toISOString(), '', 'nanomuse/cloud.json    the account snapshot (no sign-in token)', 'nanomuse/profile.json  the agent’s name and look; faces/ its pictures', 'nanomuse/rooms.json    feed, ideas, goals, the library index and memory', 'sessions/              the chats, as DeepSeek Harness keeps them (zstd-compressed JSON lines)', ''].join('\n'))})
    await writeFile(out, zip(entries), { mode: 0o600 })
    const sc = this.ctx.get('sessionController')
    if (sc) await sc.openWorkspacePath({ path: out, action: 'reveal' }, new AbortController().signal).catch(() => undefined)
    return out
  }

  /** Muse's "reset": memory, rooms and the local profile go, the account signs out; the chats stay (dsh's). */
  async resetData(): Promise<void> {
    for (const goal of this.store.goals) this.goalBySession.delete(goal.sessionId)
    this.store = { ...structuredClone(EMPTY), lang: this.store.lang }
    this.automations = {}
    await this.save()
    await this.ctx.nanomuseCloud.signOut().catch(() => undefined)
    await rm(join(dshHome(), 'nanomuse', 'profile.json'), { force: true }).catch(() => undefined)
    await rm(join(dshHome(), 'nanomuse', 'faces'), { recursive: true, force: true }).catch(() => undefined)
  }

  get feedInstructions(): string {
    return this.store.feed.instructions
  }

  private broadcast(): void {
    const frame = `data: ${JSON.stringify(this.view())}\n\n`
    for (const res of this.streams) {
      try {
        res.write(frame)
      } catch {
        this.streams.delete(res)
      }
    }
  }

  // ---- feed ------------------------------------------------------------------------

  async setFeedInstructions(text: string): Promise<void> {
    this.store.feed.instructions = text.trim().slice(0, 2000)
    await this.save()
  }

  async likePost(id: string, on: boolean): Promise<void> {
    const post = this.store.feed.posts.find((p) => p.id === id)
    if (!post) throw new RelayError(404, 'not_found', 'No such post')
    post.liked = on
    await this.save()
  }

  async deletePost(id: string): Promise<void> {
    this.store.feed.posts = this.store.feed.posts.filter((p) => p.id !== id)
    await this.save()
  }

  /** A post the agent (or a tool) writes directly, newest first. */
  async addPost(input: { title: string; body: string; area?: string; emoji?: string; image?: string; prompt?: string }): Promise<FeedPost> {
    const post: FeedPost = {
      id: newId('post'),
      at: Date.now(),
      title: input.title.trim().slice(0, 120),
      body: input.body.trim().slice(0, 4000),
      area: area(input.area),
      emoji: oneEmoji(input.emoji),
      image: httpsUrl(input.image),
      prompt: (input.prompt ?? '').trim().slice(0, 500),
      liked: false,
    }
    this.store.feed.posts = [post, ...this.store.feed.posts].slice(0, FEED_KEEP)
    await this.save()
    return post
  }

  /** Write a new batch now; resolves when the posts are in. */
  async refreshFeed(): Promise<void> {
    if (this.busy.feed) return
    this.busy.feed = true
    this.store.feed.lastTry = Date.now()
    this.broadcast()
    try {
      const before = this.store.feed.posts.length
      const text = await this.run(this.lang.startsWith('zh') ? '动态 · ' + today(this.lang) : 'Feed · ' + today(this.lang), this.feedPrompt())
      const rows = parseArray(text)
      const now = Date.now()
      const posts: FeedPost[] = []
      // the agent may also have posted with `feed_post` as it went; the JSON then repeats those
      const seen = new Set(this.store.feed.posts.map((p) => titleKey(p.title)))
      for (const row of rows.slice(0, 8)) {
        const title = str(row.title).slice(0, 120)
        const body = str(row.body).slice(0, 4000)
        if (!title || !body || seen.has(titleKey(title))) continue
        seen.add(titleKey(title))
        posts.push({ id: newId('post'), at: now, title, body, area: area(str(row.area)), emoji: oneEmoji(str(row.emoji)), image: httpsUrl(str(row.image)), prompt: str(row.prompt).slice(0, 500), liked: false })
      }
      if (posts.length === 0 && this.store.feed.posts.length === before) throw new Error('the batch came back empty')
      this.store.feed.posts = [...posts, ...this.store.feed.posts].slice(0, FEED_KEEP)
      this.store.feed.generatedAt = now
      await this.save()
      this.ctx.logger.info('nanomuse rooms: %d feed posts written', posts.length)
    } finally {
      this.busy.feed = false
      this.broadcast()
    }
  }

  /** A chat about one post: the agent opens with what is worth knowing, then listens. */
  async discuss(id: string): Promise<string> {
    const post = this.store.feed.posts.find((p) => p.id === id)
    if (!post) throw new RelayError(404, 'not_found', 'No such post')
    if (post.sessionId && (await this.alive(post.sessionId))) return post.sessionId
    const zh = this.lang.startsWith('zh')
    const framing = zh
      ? `[这是你之前写进这个人「动态」里的一条帖子，对方现在想聊聊它。先用一两句话说清楚最值得知道的，以及你接下来能帮上什么，然后听对方说。]`
      : `[A post you wrote for this person's feed earlier; they want to talk about it. Open with one or two sentences — what is worth knowing, what you could do next — and then listen.]`
    const sessionId = await this.open(post.title, `${framing}\n\n**${post.title}**\n\n${post.body}`)
    post.sessionId = sessionId
    await this.save()
    return sessionId
  }

  // ---- ideas -----------------------------------------------------------------------

  async refreshIdeas(): Promise<void> {
    if (this.busy.ideas) return
    this.busy.ideas = true
    this.store.ideas.lastTry = Date.now()
    this.broadcast()
    try {
      const text = await this.run(this.lang.startsWith('zh') ? '点子' : 'Ideas', this.ideasPrompt())
      const rows = parseArray(text)
      const now = Date.now()
      const items: Idea[] = []
      for (const row of rows.slice(0, 24)) {
        const title = str(row.title).slice(0, 120)
        const detail = str(row.detail).slice(0, 600)
        const prompt = str(row.prompt).slice(0, 1000)
        if (!title || !prompt) continue
        items.push({
          id: newId('idea'),
          at: now,
          group: str(row.group).slice(0, 40),
          emoji: oneEmoji(str(row.emoji)) || '💡',
          title,
          detail,
          includes: strList(row.includes, 6, 160),
          how: str(row.how).slice(0, 800),
          prompt,
          area: area(str(row.area)),
        })
      }
      if (items.length === 0) throw new Error('the batch came back empty')
      // Started ideas stay (their green check is the person's history); the rest is replaced.
      const kept = this.store.ideas.items.filter((i) => i.started && !i.dismissed)
      this.store.ideas.items = [...items, ...kept]
      this.store.ideas.generatedAt = now
      await this.save()
      this.ctx.logger.info('nanomuse rooms: %d ideas written', items.length)
    } finally {
      this.busy.ideas = false
      this.broadcast()
    }
  }

  async startIdea(id: string): Promise<string> {
    const idea = this.store.ideas.items.find((i) => i.id === id)
    if (!idea) throw new RelayError(404, 'not_found', 'No such idea')
    if (idea.started && (await this.alive(idea.started))) return idea.started
    const zh = this.lang.startsWith('zh')
    const framing = zh
      ? `[对方从「点子」里选了这一条：「${idea.title}」—— ${idea.detail}。直接开始做；需要对方补充的信息，一次问清。]`
      : `[The person picked this from their Ideas room: "${idea.title}" — ${idea.detail}. Start on it; ask for what you need from them in one go.]`
    const sessionId = await this.open(idea.title, `${framing}\n\n${idea.prompt}`)
    idea.started = sessionId
    await this.save()
    return sessionId
  }

  async dismissIdea(id: string): Promise<void> {
    const idea = this.store.ideas.items.find((i) => i.id === id)
    if (!idea) return
    idea.dismissed = true
    await this.save()
  }

  // ---- goals -----------------------------------------------------------------------

  async createGoal(input: { title?: string | undefined; category?: string | undefined; text: string }): Promise<Goal> {
    const text = input.text.trim()
    if (!text) throw new RelayError(400, 'usage', 'Say what the goal is')
    const category = (CATEGORIES as readonly string[]).includes(input.category ?? '') ? (input.category as Category) : 'other'
    const title = (input.title ?? '').trim().slice(0, 80) || goalTitle(text)
    const id = newId('goal')
    const zh = this.lang.startsWith('zh')
    const framing = zh
      ? `[这是对方在「目标」里新建的一个目标（分类：${categoryLabel(category, true)}，id ${id}）。这个对话就是这个目标的家：先用几句话说清楚你打算怎么帮、需要对方给什么；如果定期检查有用（比如每天查一次价、每周回顾一次），就用 schedule_create 在这里建一个定时任务；第一轮就调用 goals_room_update（goal_id "${id}"）给目标起一个 12 字以内的短标题（title）和一句话 summary；之后每当有值得记下的进展，再调用 goals_room_update 加一条 activity。回复要短。]`
      : `[A goal the person set in their Goals room (category: ${categoryLabel(category, false)}, id ${id}). This chat is the goal's home: say in a few sentences how you will help and what you need from them; when a recurring check helps (a daily price check, a weekly review), set it up here with schedule_create; in this first turn call goals_room_update (goal_id "${id}") with a short title (eight words at most) and a one-line summary; and whenever something worth noting happens later, call goals_room_update again with an activity entry. Keep replies short.]`
    const sessionId = await this.open(title, `${framing}\n\n${text}`)
    const now = Date.now()
    const goal: Goal = { id, title, description: text.slice(0, 2000), category, status: 'tracking', sessionId, createdAt: now, updatedAt: now, summary: '', activity: [] }
    this.store.goals = [goal, ...this.store.goals]
    this.goalBySession.set(sessionId, id)
    await this.save()
    return goal
  }

  /** From the room (status, title) or from the agent (`goals_room_update`: summary, activity). */
  async updateGoal(ref: string, patch: { title?: string; description?: string; status?: string; summary?: string; activity?: { title: string; text?: string } }): Promise<Goal> {
    const goal = this.findGoal(ref)
    if (!goal) throw new RelayError(404, 'not_found', `No goal "${ref}"`)
    if (typeof patch.title === 'string' && patch.title.trim()) goal.title = patch.title.trim().slice(0, 80)
    if (typeof patch.description === 'string') goal.description = patch.description.trim().slice(0, 2000)
    if (patch.status === 'tracking' || patch.status === 'done' || patch.status === 'paused') goal.status = patch.status
    if (typeof patch.summary === 'string') goal.summary = patch.summary.trim().slice(0, 240)
    if (patch.activity && typeof patch.activity.title === 'string' && patch.activity.title.trim()) {
      goal.activity = [{ at: Date.now(), title: patch.activity.title.trim().slice(0, 120), text: (patch.activity.text ?? '').trim().slice(0, 600) }, ...goal.activity].slice(0, ACTIVITY_KEEP)
    }
    goal.updatedAt = Date.now()
    await this.save()
    return goal
  }

  async deleteGoal(id: string): Promise<void> {
    const goal = this.store.goals.find((g) => g.id === id)
    if (!goal) return
    this.store.goals = this.store.goals.filter((g) => g.id !== id)
    this.goalBySession.delete(goal.sessionId)
    delete this.automations[id]
    await this.save()
    // Its automations stop with it; the chat stays in the archive.
    const schedule = this.ctx.get('schedule') as ScheduleLike | undefined
    if (schedule) {
      const list = await schedule.list({ sessionId: goal.sessionId as SessionId }).catch(() => [])
      for (const record of list) await schedule.delete({ sessionId: goal.sessionId as SessionId, id: record.id }).catch(() => undefined)
    }
    await (this.ctx.get('workspaceRegistry') as RegistryLike | undefined)?.archiveSession(goal.sessionId as SessionId, { stopActivity: true }).catch(() => undefined)
  }

  /** "How is it going?" in the goal's chat; returns the chat to open. */
  async checkIn(id: string): Promise<string> {
    const goal = this.store.goals.find((g) => g.id === id)
    if (!goal) throw new RelayError(404, 'not_found', 'No such goal')
    const zh = this.lang.startsWith('zh')
    const prompt = zh
      ? `[来自「目标」的进度确认] 「${goal.title}」进展如何？简短说明上次之后有什么变化、下一步是什么，并用 goals_room_update 更新一句话 summary。`
      : `[A check-in from the Goals room] How is "${goal.title}" going? Briefly: what changed since last time and what is next; update the one-line summary with goals_room_update.`
    if (!(await this.alive(goal.sessionId))) {
      goal.sessionId = await this.open(goal.title, prompt)
      this.goalBySession.set(goal.sessionId, goal.id)
      await this.save()
      return goal.sessionId
    }
    await this.say(goal.sessionId as SessionId, prompt)
    return goal.sessionId
  }

  async deleteAutomation(goalId: string, scheduleId: string): Promise<void> {
    const goal = this.store.goals.find((g) => g.id === goalId)
    const schedule = this.ctx.get('schedule') as ScheduleLike | undefined
    if (!goal || !schedule) return
    await schedule.delete({ sessionId: goal.sessionId as SessionId, id: scheduleId })
    await this.refreshAutomations()
  }

  private findGoal(ref: string): Goal | undefined {
    const key = ref.trim().toLowerCase()
    return this.store.goals.find((g) => g.id === ref) ?? this.store.goals.find((g) => g.title.toLowerCase() === key) ?? this.store.goals.find((g) => g.title.toLowerCase().includes(key) && key.length >= 4)
  }

  private async refreshAutomations(): Promise<void> {
    const schedule = this.ctx.get('schedule') as ScheduleLike | undefined
    if (!schedule) return
    const next: Record<string, GoalAutomation[]> = {}
    for (const goal of this.store.goals) {
      const list = await schedule.list({ sessionId: goal.sessionId as SessionId }).catch(() => [])
      if (list.length) next[goal.id] = list.map((r) => ({ id: r.id, title: r.title, kind: r.kind, rule: ruleOf(r), next: r.scheduledAt }))
    }
    if (JSON.stringify(next) === JSON.stringify(this.automations)) return
    this.automations = next
    this.broadcast()
  }

  // ---- library ---------------------------------------------------------------------

  /** A file the agent delivered (a `present` call, `library_add`, or the room's own creations). */
  async addToLibrary(path: string, description: string, sessionId: string, cwd?: string): Promise<LibraryItem | undefined> {
    const full = isAbsolute(path) ? path : resolve(cwd ?? process.cwd(), path)
    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(full)
    } catch {
      return undefined
    }
    if (!info.isFile()) return undefined
    const ext = extname(full).toLowerCase()
    const existing = this.store.library.find((i) => i.path === full)
    const item: LibraryItem = existing ?? { id: newId('lib'), path: full, name: basename(full), kind: KINDS[ext] ?? 'file', description: '', sessionId, at: 0 }
    item.at = Date.now()
    if (description.trim()) item.description = description.trim().slice(0, 300)
    if (sessionId) item.sessionId = sessionId
    this.store.library = [item, ...this.store.library.filter((i) => i !== item)].slice(0, LIBRARY_KEEP)
    await this.save()
    return item
  }

  async removeFromLibrary(id: string): Promise<void> {
    this.store.library = this.store.library.filter((i) => i.id !== id)
    await this.save()
  }

  /** A new document / web page / video / podcast: a chat where the agent makes it and presents the file. */
  async createArtifact(kind: string, brief: string): Promise<string> {
    const text = brief.trim()
    if (!text) throw new RelayError(400, 'usage', 'Say what to make')
    const zh = this.lang.startsWith('zh')
    const folder = this.libraryFolder()
    const what: Record<string, [string, string]> = {
      document: ['a document (Markdown, `.md`, unless the person asks for another format)', '一份文档（默认 Markdown `.md`，除非对方要别的格式）'],
      web: ['a self-contained web page (`.html`, inline CSS/JS)', '一个独立的网页（`.html`，样式脚本内联）'],
      video: ['a short video (`.mp4`; e.g. ffmpeg over generated frames or slides — say so if the tools for it are missing)', '一段短视频（`.mp4`，比如用 ffmpeg 把生成的画面或幻灯片拼起来；缺工具就直说）'],
      audio: ['a short podcast episode (`.mp3`/`.m4a`; a script first, then speech with whatever text-to-speech is available — say so if none is)', '一期短播客（`.mp3`/`.m4a`：先写稿，再用可用的文字转语音生成；没有就直说）'],
    }
    const pair = what[kind] ?? what.document!
    const framing = zh
      ? `[对方在「构件」里点了「创建」：请做${pair[1]}，保存到 ${folder}/（没有就创建），做完用 present 声明这个文件，让它出现在对方的构件库里。先做再说，简短汇报。]`
      : `[The person pressed "Create" in their Library: make ${pair[0]}, save it under ${folder}/ (create the folder if needed), and declare the file with present when done so it appears in their Library. Make it first, then report briefly.]`
    await mkdir(folder, { recursive: true })
    return this.open(firstLine(text).slice(0, 60), `${framing}\n\n${text}`, { cwd: folder, preset: 'workspace-write' })
  }

  /** Where the room's own creations go: `~/nanoMuse/Library` (`~/nanoMuse/构件` in Chinese). */
  libraryFolder(): string {
    return join(homeDir(), 'nanoMuse', this.lang.startsWith('zh') ? '构件' : 'Library')
  }

  // ---- the agent's sessions -------------------------------------------------------------

  /** A new chat the person will see, with its first message sent. */
  /**
   * A chat the person will see. It starts in their home folder; a `preset` of
   * `workspace-write` (used for the Library's creations, whose cwd is the
   * Library folder) lets the agent write there without asking — everything
   * outside still asks, as the deployment's presets say.
   */
  private async open(title: string, prompt: string, options: { cwd?: string; preset?: string } = {}): Promise<string> {
    const sc = this.ctx.get('sessionController')
    if (!sc) throw new RelayError(503, 'no_sessions', 'Chats are not available yet')
    const created = await sc.create({ agentPreset: 'nanomuse', cwd: options.cwd ?? homeDir() })
    await sc.rename({ sessionId: created.sessionId, title: title.slice(0, 80) }).catch(() => undefined)
    await this.say(created.sessionId, prompt, options.preset)
    return created.sessionId
  }

  private async say(sessionId: SessionId, prompt: string, preset?: string): Promise<Agent> {
    const sc = this.ctx.get('sessionController')
    if (!sc) throw new RelayError(503, 'no_sessions', 'Chats are not available yet')
    const resolved = await sc.resolveAgent(sessionId)
    if ('error' in resolved) throw new RelayError(409, 'session', `The chat could not be opened: ${String(resolved.error)}`)
    if (resolved.agent.status !== 'idle') throw new RelayError(409, 'busy', 'That chat is busy right now')
    this.snapshotTools(resolved.agent)
    if (preset) {
      const presets = this.ctx.get('permissionPresets') as PresetsLike | undefined
      if (presets?.names.includes(preset)) {
        try {
          presets.set(resolved.agent.session, preset)
        } catch (error) {
          this.warn('permission preset', error)
        }
      }
    }
    resolved.agent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }))
    return resolved.agent
  }

  private async alive(sessionId: string): Promise<boolean> {
    const sc = this.ctx.get('sessionController')
    if (!sc) return false
    const resolved = await sc.resolveAgent(sessionId as SessionId).catch(() => undefined)
    return Boolean(resolved && 'agent' in resolved)
  }

  /** A background batch: a chat of its own, the final answer returned, the chat archived. */
  private async run(title: string, prompt: string): Promise<string> {
    const sc = this.ctx.get('sessionController')
    if (!sc) throw new Error('chats are not available yet')
    if (!(await this.ctx.nanomuseCloud.status()).ready) throw new Error('no model is set up')
    const created = await sc.create({ agentPreset: 'nanomuse', cwd: homeDir() })
    await sc.rename({ sessionId: created.sessionId, title }).catch(() => undefined)
    const resolved = await sc.resolveAgent(created.sessionId)
    if ('error' in resolved) throw new Error(`the chat could not be opened: ${String(resolved.error)}`)
    const agent = resolved.agent
    let text = ''
    try {
      text = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          agent.cancel({ kind: 'hook', reason: 'nanomuse rooms: the batch took too long' })
          fail(new Error('the batch took too long'))
        }, RUN_TIMEOUT_MS)
        const done = (value: string) => {
          clearTimeout(timer)
          this.runs.delete(created.sessionId)
          resolve(value)
        }
        const fail = (error: Error) => {
          clearTimeout(timer)
          this.runs.delete(created.sessionId)
          reject(error)
        }
        this.runs.set(created.sessionId, { final: '', resolve: done, reject: fail })
        agent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }))
      })
    } finally {
      // The batch is a means, not a chat: out of the list, kept in the archive.
      await (this.ctx.get('workspaceRegistry') as RegistryLike | undefined)?.archiveSession(created.sessionId, { stopActivity: true }).catch(() => undefined)
    }
    return text
  }

  private onEvent(session: Session, event: SessionEvent): void {
    const run = this.runs.get(session.id)
    const goalId = this.goalBySession.get(session.id)
    const type: string = event.type
    if (type === 'deliverables/presented') {
      const files = ((event as unknown as { data: { files?: { path: string; description?: string }[] } }).data.files ?? [])
      for (const file of files) void this.addToLibrary(file.path, file.description ?? '', session.id, session.header.cwd).catch((error: unknown) => this.warn('library', error))
      return
    }
    // any chat's first turn refreshes the tool catalogue the Connectors page shows (the view is per agent)
    if (type === 'turn/start' && Date.now() - this.catalogAt > 30_000) {
      const sc = this.ctx.get('sessionController')
      if (sc) void sc.resolveAgent(session.id).then((resolved) => { if (!('error' in resolved)) this.snapshotTools(resolved.agent) }).catch(() => undefined)
    }
    if (!run && !goalId) return
    if (goalId && (type === 'turn/start' || type === 'user/message')) {
      this.turnMarks.set(session.id, Date.now())
      return
    }
    switch (event.type) {
      case 'assistant/message': {
        const text = textOf(event.data.message.content)
        if (!text) return
        if (run) run.final = text
        if (goalId) {
          if (!this.turnMarks.has(session.id)) this.turnMarks.set(session.id, Date.now())
          this.lastWords.set(session.id, text)
        }
        return
      }
      case 'turn/end': {
        const reason = event.data.reason
        if (run) {
          if (reason.kind === 'error') run.reject(new Error(String(reason.error.message ?? 'the model failed')))
          else run.resolve(run.final)
        }
        if (goalId) {
          const words = this.lastWords.get(session.id) ?? ''
          const since = this.turnMarks.get(session.id) ?? Date.now()
          this.lastWords.delete(session.id)
          this.turnMarks.delete(session.id)
          if (words && reason.kind !== 'error') void this.logGoalTurn(goalId, words, since).catch((error: unknown) => this.warn('goal activity', error))
        }
        return
      }
      default:
        return
    }
  }

  /** Every turn in a goal's chat is a line on its timeline — unless the agent wrote one itself with `goals_room_update`. */
  private async logGoalTurn(goalId: string, words: string, since: number): Promise<void> {
    const goal = this.store.goals.find((g) => g.id === goalId)
    if (!goal) return
    if (goal.activity.some((entry) => entry.at >= since - 1000)) return
    const plain = words.replace(/[*_`#>]/g, '').replace(/\r/g, '').trim()
    const title = firstLine(plain).slice(0, 120)
    const rest = plain.slice(plain.indexOf('\n') + 1).replace(/\s+/g, ' ').trim()
    if (!title) return
    const last = goal.activity[0]
    if (last && last.title === title && Date.now() - last.at < 60_000) return
    goal.activity = [{ at: Date.now(), title, text: plain.indexOf('\n') > 0 ? rest.slice(0, 600) : '' }, ...goal.activity].slice(0, ACTIVITY_KEEP)
    goal.updatedAt = Date.now()
    await this.save()
  }

  // ---- the batches' timing ------------------------------------------------------------

  /** Whether a model can answer right now (signed in, or another provider set up). */
  private async syncReady(): Promise<boolean> {
    const ready = (await this.ctx.nanomuseCloud.status().catch(() => ({ ready: false }))).ready
    if (ready !== this.ready) {
      this.ready = ready
      this.broadcast()
    }
    return ready
  }

  private async tick(): Promise<void> {
    const ready = await this.syncReady()
    if (!ready || !this.known()) return
    const now = Date.now()
    const feed = this.store.feed
    if (!this.busy.feed && now - feed.generatedAt > FEED_EVERY_MS && now - feed.lastTry > RETRY_AFTER_MS) {
      await this.refreshFeed().catch((error: unknown) => this.warn('feed', error))
    }
    const ideas = this.store.ideas
    if (!this.busy.ideas && now - ideas.generatedAt > IDEAS_EVERY_MS && now - ideas.lastTry > RETRY_AFTER_MS) {
      await this.refreshIdeas().catch((error: unknown) => this.warn('ideas', error))
    }
  }

  /** Something to write from: instructions, a goal, or a profile the person shaped. */
  private known(): boolean {
    const profile = this.ctx.nanomuseCloud.profile.current()
    return Boolean(this.store.feed.instructions || this.store.goals.length || profile.description || this.store.ideas.items.some((i) => i.started))
  }

  // ---- prompts ---------------------------------------------------------------------------

  private context(): string {
    const profile = this.ctx.nanomuseCloud.profile.current()
    const lines: string[] = []
    lines.push(`- the agent's name, as the person chose it: ${profile.name}`)
    if (profile.description) lines.push(`- the agent's look, as the person drew it: ${profile.description.slice(0, 200)}`)
    for (const goal of this.store.goals.slice(0, 10)) {
      lines.push(`- goal (${goal.status}, ${goal.category}): ${goal.title}${goal.summary ? ` — ${goal.summary}` : ''}`)
    }
    const started = this.store.ideas.items.filter((i) => i.started).slice(0, 8)
    if (started.length) lines.push(`- ideas the person started before: ${started.map((i) => i.title).join('; ')}`)
    const dismissed = this.store.ideas.items.filter((i) => i.dismissed).slice(0, 8)
    if (dismissed.length) lines.push(`- ideas the person dismissed (do not repeat): ${dismissed.map((i) => i.title).join('; ')}`)
    const liked = this.store.feed.posts.filter((p) => p.liked).slice(0, 8)
    if (liked.length) lines.push(`- feed posts the person liked: ${liked.map((p) => p.title).join('; ')}`)
    const recent = this.store.feed.posts.slice(0, 12)
    if (recent.length) lines.push(`- posts already written (do not repeat them): ${recent.map((p) => p.title).join('; ')}`)
    lines.push(`- today: ${today(this.lang)}`)
    return lines.join('\n')
  }

  private feedPrompt(): string {
    const n = 4
    const instructions = this.store.feed.instructions || '(none yet — write what a good personal agent would: what they follow, their goals, the day ahead)'
    return [
      `[Background job from nanoMuse: write the person's feed. Nobody reads this chat; the app parses your final answer.]`,
      `You are the person's own agent, writing their personal feed: ${n} short posts made just for them, in ${languageName(this.lang)}. Think of a thoughtful friend who knows what they care about: news worth their attention on the topics they follow (use web_search for anything time-sensitive, and link the source inline in Markdown), a nudge on a goal, a small plan for the day, a question worth thinking about. Specific to this person; never generic filler. No greetings, no "as your agent". Do not call feed_post here — the JSON below is how this batch is delivered.`,
      ``,
      `What the person asked to read here:`,
      instructions,
      ``,
      `What you know:`,
      this.context(),
      ``,
      'Finish with ONE fenced ```json block and nothing after it: a JSON array of ' + n + ' objects, each {"title": "<max 12 words>", "body": "<60-160 words of Markdown, short paragraphs, links inline, no heading>", "area": "<one of ' + AREAS.join(', ') + '>", "emoji": "<one emoji that fits>", "image": "<a direct https image URL from a page you read, or empty>", "prompt": "<a follow-up the person could send you, or empty>"}.',
    ].join('\n')
  }

  private ideasPrompt(): string {
    const zh = this.lang.startsWith('zh')
    return [
      `[Background job from nanoMuse: propose ideas for the person. Nobody reads this chat; the app parses your final answer.]`,
      `You are the person's own agent. Propose 12 to 16 concrete, genuinely useful things you could do for them, in ${languageName(this.lang)}, in 4 to 5 groups. The first group is "${zh ? '为你推荐' : 'For you'}" (3-4 ideas tied to what you know about them below); the others are themes such as ${zh ? '健康与健身、购物、人际关系、效率提升、旅行、学习、金融' : 'Health & fitness, Shopping, Relationships, Productivity, Travel, Learning, Finance'} — pick the four that fit this person. Prefer things you can actually do with your tools: research and comparisons, planning, drafting, tracking prices or news, reminders and recurring checks, organising files, advancing their goals. Each title is one sentence in the first person about what you would do ("${zh ? '我会帮你…' : 'I will …'}").`,
      ``,
      `What you know:`,
      this.context(),
      ``,
      'Finish with ONE fenced ```json block and nothing after it: a JSON array of objects, each {"group": "<group name>", "emoji": "<one emoji>", "title": "<one sentence, first person>", "detail": "<1-2 sentences: what you would do and why it helps>", "includes": ["<3-4 short bullets of what is included>"], "how": "<2-3 sentences: how it works, what you need from the person>", "prompt": "<the exact request the person could send to start>", "area": "<one of ' + AREAS.join(', ') + '>"}.',
    ].join('\n')
  }

  // ---- storage ---------------------------------------------------------------------------

  private get path(): string {
    return join(dshHome(), 'nanomuse', 'rooms.json')
  }

  private async read(): Promise<Store> {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Partial<Store>
      return {
        lang: typeof raw.lang === 'string' ? raw.lang : '',
        feed: { ...EMPTY.feed, ...(raw.feed ?? {}), posts: Array.isArray(raw.feed?.posts) ? raw.feed!.posts : [] },
        ideas: { ...EMPTY.ideas, ...(raw.ideas ?? {}), items: Array.isArray(raw.ideas?.items) ? raw.ideas!.items : [] },
        goals: Array.isArray(raw.goals) ? raw.goals : [],
        library: Array.isArray(raw.library) ? raw.library : [],
        memory: Array.isArray(raw.memory) ? raw.memory : [],
      }
    } catch {
      return structuredClone(EMPTY)
    }
  }

  /** Serialised atomic writes; every save reaches the browser. */
  private save(): Promise<void> {
    const snapshot = JSON.stringify(this.store, null, 2) + '\n'
    this.writing = this.writing.then(async () => {
      const path = this.path
      await mkdir(join(dshHome(), 'nanomuse'), { recursive: true })
      const tmp = `${path}.${process.pid}.tmp`
      await writeFile(tmp, snapshot, { mode: 0o600 })
      await rename(tmp, path)
    }).catch((error: unknown) => this.warn('save', error))
    this.broadcast()
    return this.writing
  }

  private warn(what: string, error: unknown): void {
    this.ctx.logger.warn('nanomuse rooms: %s failed: %s', what, message(error))
  }

  // ---- the routes ----------------------------------------------------------------------

  private readonly handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    if (!sameOrigin(req)) return send(res, 403, { error: { code: 'forbidden', message: 'Same-origin requests only' } })
    try {
      if (req.method === 'GET' && route === '/state') {
        await Promise.all([this.syncReady(), this.refreshAutomations()])
        return send(res, 200, this.view())
      }
      if (req.method === 'GET' && route === '/events') {
        await Promise.all([this.syncReady(), this.refreshAutomations()])
        return this.stream(req, res)
      }
      if (req.method === 'GET' && route === '/connectors') return send(res, 200, this.connectors())
      if (req.method === 'GET' && route === '/files') return send(res, 200, { home: homeDir(), library: this.libraryFolder(), downloads: await downloadsDir(), state: join(dshHome(), 'nanomuse') })
      if (req.method === 'GET' && route === '/library/file') return this.serveFile(res, url.searchParams.get('id') ?? '', url.searchParams.get('raw') === '1')
      if (req.method !== 'POST') return send(res, 404, { error: { code: 'not_found', message: `No ${req.method ?? ''} ${route}` } })
      const body = await json(req)
      switch (route) {
        case '/lang': {
          const lang = String(body.lang ?? '').trim().slice(0, 20)
          if (lang && lang !== this.store.lang) {
            this.store.lang = lang
            await this.save()
          }
          return send(res, 204)
        }
        case '/feed/refresh':
          void this.refreshFeed().catch((error: unknown) => this.warn('feed', error))
          return send(res, 202, { started: true })
        case '/feed/instructions':
          await this.setFeedInstructions(String(body.text ?? ''))
          return send(res, 204)
        case '/feed/like':
          await this.likePost(String(body.id ?? ''), body.on !== false)
          return send(res, 204)
        case '/feed/delete':
          await this.deletePost(String(body.id ?? ''))
          return send(res, 204)
        case '/feed/discuss':
          return send(res, 200, { sessionId: await this.discuss(String(body.id ?? '')) })
        case '/ideas/refresh':
          void this.refreshIdeas().catch((error: unknown) => this.warn('ideas', error))
          return send(res, 202, { started: true })
        case '/ideas/start':
          return send(res, 200, { sessionId: await this.startIdea(String(body.id ?? '')) })
        case '/ideas/dismiss':
          await this.dismissIdea(String(body.id ?? ''))
          return send(res, 204)
        case '/goals/create':
          return send(res, 200, await this.createGoal({ title: typeof body.title === 'string' ? body.title : undefined, category: typeof body.category === 'string' ? body.category : undefined, text: String(body.text ?? '') }))
        case '/goals/update':
          return send(res, 200, await this.updateGoal(String(body.id ?? ''), body as Parameters<NanomuseRooms['updateGoal']>[1]))
        case '/goals/delete':
          await this.deleteGoal(String(body.id ?? ''))
          return send(res, 204)
        case '/goals/check-in':
          return send(res, 200, { sessionId: await this.checkIn(String(body.id ?? '')) })
        case '/goals/automation/delete':
          await this.deleteAutomation(String(body.id ?? ''), String(body.schedule_id ?? ''))
          return send(res, 204)
        case '/library/create':
          return send(res, 200, { sessionId: await this.createArtifact(String(body.kind ?? 'document'), String(body.text ?? '')) })
        case '/library/delete':
          await this.removeFromLibrary(String(body.id ?? ''))
          return send(res, 204)
        case '/library/write': {
          const item = this.store.library.find((i) => i.id === String(body.id ?? ''))
          if (!item || !TEXT_KINDS.has(extname(item.path).toLowerCase())) return send(res, 404, { error: { code: 'not_found', message: 'No such text file' } })
          await writeFile(item.path, String(body.text ?? ''), 'utf8')
          item.at = Date.now()
          await this.save()
          return send(res, 204)
        }
        case '/files/reveal': {
          const sc = this.ctx.get('sessionController')
          if (!sc) return send(res, 503, { error: { code: 'no_sessions', message: 'Not available yet' } })
          const which = String(body.which ?? '')
          const folder = which === 'home' ? homeDir() : which === 'downloads' ? await downloadsDir() : which === 'state' ? join(dshHome(), 'nanomuse') : this.libraryFolder()
          await mkdir(folder, { recursive: true })
          await sc.openWorkspacePath({ path: folder, action: 'reveal' }, new AbortController().signal)
          return send(res, 204)
        }
        case '/library/folder': {
          const sc = this.ctx.get('sessionController')
          if (!sc) return send(res, 503, { error: { code: 'no_sessions', message: 'Not available yet' } })
          const folder = this.libraryFolder()
          await mkdir(folder, { recursive: true })
          await sc.openWorkspacePath({ path: folder, action: 'reveal' }, new AbortController().signal)
          return send(res, 204)
        }
        case '/memory/add':
          return send(res, 200, { item: await this.remember(String(body.text ?? ''), 'person') })
        case '/memory/delete':
          await this.forget(String(body.id ?? ''))
          return send(res, 204)
        case '/memory/import':
          return send(res, 200, { added: await this.importMemory(String(body.text ?? '')) })
        case '/data/export':
          return send(res, 200, { path: await this.exportData() })
        case '/data/reset':
          await this.resetData()
          return send(res, 204)
        case '/library/open': {
          const item = this.store.library.find((i) => i.id === String(body.id ?? ''))
          const sc = this.ctx.get('sessionController')
          if (!item || !sc) return send(res, 404, { error: { code: 'not_found', message: 'No such file' } })
          await sc.openWorkspacePath(body.reveal === true ? { path: item.path, action: 'reveal' } : { path: item.path }, new AbortController().signal)
          return send(res, 204)
        }
        default:
          return send(res, 404, { error: { code: 'not_found', message: `No ${req.method ?? ''} ${route}` } })
      }
    } catch (error: unknown) {
      if (error instanceof RelayError) return send(res, error.status >= 500 ? 502 : error.status, { error: { code: error.code, message: error.message } })
      this.warn(`${req.method ?? ''} ${route}`, error)
      return send(res, 500, { error: { code: 'internal', message: message(error) } })
    }
  }

  private stream(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    res.write(`retry: 2000\ndata: ${JSON.stringify(this.view())}\n\n`)
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

  /** The file behind a Library item: its text for the editor, or the bytes for a preview. */
  private async serveFile(res: ServerResponse, id: string, raw: boolean): Promise<void> {
    const item = this.store.library.find((i) => i.id === id)
    if (!item) return send(res, 404, { error: { code: 'not_found', message: 'No such file' } })
    const ext = extname(item.path).toLowerCase()
    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(item.path)
    } catch {
      return send(res, 410, { error: { code: 'gone', message: 'The file is no longer there' } })
    }
    if (!raw) {
      if (!TEXT_KINDS.has(ext)) return send(res, 415, { error: { code: 'binary', message: 'Not a text file' } })
      if (info.size > 2 * 1024 * 1024) return send(res, 413, { error: { code: 'too_large', message: 'The file is too large to edit here' } })
      return send(res, 200, { text: await readFile(item.path, 'utf8'), bytes: info.size, mtime: Math.round(info.mtimeMs) })
    }
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'content-length': info.size, 'cache-control': 'private, max-age=60' })
    createReadStream(item.path).pipe(res)
  }
}

// ---- small helpers ---------------------------------------------------------------------------

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

function strList(value: unknown, max: number, each: number): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => str(v).slice(0, each)).filter(Boolean).slice(0, max)
}

function area(value: string | undefined): string {
  return (AREAS as readonly string[]).includes(value ?? '') ? (value as string) : 'planning'
}

function oneEmoji(value: string | undefined): string {
  if (!value) return ''
  const first = [...value.trim()][0] ?? ''
  return /\p{Extended_Pictographic}/u.test(first) ? first : ''
}

function httpsUrl(value: string | undefined): string {
  if (!value) return ''
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.href.slice(0, 1000) : ''
  } catch {
    return ''
  }
}

function firstLine(text: string): string {
  return text.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
}

function today(lang: string): string {
  try {
    return new Date().toLocaleDateString(lang, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return new Date().toDateString()
  }
}

function languageName(lang: string): string {
  const base = lang.toLowerCase()
  if (base.startsWith('zh')) return base.includes('tw') || base.includes('hk') || base.includes('hant') ? 'Traditional Chinese' : 'Simplified Chinese'
  if (base.startsWith('ja')) return 'Japanese'
  if (base.startsWith('ko')) return 'Korean'
  if (base.startsWith('de')) return 'German'
  if (base.startsWith('fr')) return 'French'
  if (base.startsWith('es')) return 'Spanish'
  return 'English'
}

function categoryLabel(category: Category, zh: boolean): string {
  const labels: Record<Category, [string, string]> = {
    health: ['Health', '健康'],
    relationships: ['Relationships', '人际关系'],
    finance: ['Finance', '金融'],
    career: ['Career', '职业'],
    hobbies: ['Hobbies', '兴趣'],
    productivity: ['Productivity', '效率提升'],
    other: ['Other', '其他'],
  }
  return labels[category][zh ? 1 : 0]
}

function ruleOf(r: ScheduleRecordLike): string {
  const hhmm = (t: string | undefined) => (t ?? '').slice(0, 5)
  switch (r.kind) {
    case 'daily':
      return `daily@${hhmm(r.time)}`
    case 'weekly':
      return `weekly ${(r.weekdays ?? []).join(',')}@${hhmm(r.time)}`
    case 'cron':
      return `cron ${r.expression ?? ''}`
    case 'every':
      return `every ${r.everySeconds ?? 0}s`
    default:
      return r.scheduledAt
  }
}

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? process.cwd()
}

/** `~/Downloads`, or what the desktop calls it (`~/下载` on a Chinese Linux: user-dirs.dirs). */
async function downloadsDir(): Promise<string> {
  const home = homeDir()
  if (process.platform === 'linux') {
    try {
      const dirs = await readFile(join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'user-dirs.dirs'), 'utf8')
      const match = /^XDG_DOWNLOAD_DIR="?([^"\n]+)"?/m.exec(dirs)
      if (match?.[1]) return match[1].replace('$HOME', home)
    } catch {
      /* the default below */
    }
  }
  return join(home, 'Downloads')
}

/** A first title for a goal typed in one breath: the first clause, before the agent names it. */
export function goalTitle(text: string): string {
  const line = firstLine(text).trim()
  const cut = line.search(/[；;。！？!?\n]|，|, |: |：/)
  const clause = (cut > 3 ? line.slice(0, cut) : line).trim()
  return (clause || line).slice(0, 40)
}

/** Titles compared loosely, so a post the agent sent twice lands once. */
function titleKey(title: string): string {
  return title.toLowerCase().replace(/[\s\p{P}]+/gu, '')
}

/** The JSON array in the agent's final answer: the last fenced block, else the outermost brackets. */
export function parseArray(text: string): Record<string, unknown>[] {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1] ?? '')
  const candidates = fenced.length ? fenced.reverse() : []
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1))
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate.trim())
      const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? Object.values(parsed as Record<string, unknown>).find(Array.isArray) : undefined
      if (Array.isArray(rows)) return rows.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    } catch {
      // the next candidate
    }
  }
  return []
}

// ---- a small zip writer (deflate, one pass; enough for an export) ------------------

interface ZipEntry {
  name: string
  data: Buffer
  at: Date
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosTime(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getFullYear())
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  }
}

/** The entries as one zip file (names UTF-8, deflated, no zip64 — exports are small). */
export function zip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const packed = deflateRawSync(entry.data)
    const stored = packed.length < entry.data.length
    const body = stored ? packed : entry.data
    const method = stored ? 8 : 0
    const crc = crc32(entry.data)
    const { time, date } = dosTime(entry.at)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    parts.push(local, name, body)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4)
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(0x0800, 8)
    dir.writeUInt16LE(method, 10)
    dir.writeUInt16LE(time, 12)
    dir.writeUInt16LE(date, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(body.length, 20)
    dir.writeUInt32LE(entry.data.length, 24)
    dir.writeUInt16LE(name.length, 28)
    dir.writeUInt16LE(0, 30)
    dir.writeUInt16LE(0, 32)
    dir.writeUInt16LE(0, 34)
    dir.writeUInt16LE(0, 36)
    dir.writeUInt32LE(0, 38)
    dir.writeUInt32LE(offset, 42)
    central.push(dir, name)
    offset += local.length + name.length + body.length
  }
  const dirBytes = central.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dirBytes, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...parts, ...central, end])
}
