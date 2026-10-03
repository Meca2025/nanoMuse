/**
 * The rooms' state in the browser — Feed, Ideas, Goals, Library — one
 * `EventSource` on `/nanomuse/rooms/events` mirrored into a snapshot React
 * reads with `useSyncExternalStore` (the same shape `live.ts` gives the
 * account), and the calls the rooms make. Types mirror `src/rooms.ts`.
 */
import { useSyncExternalStore } from 'react'

export interface FeedPost {
  id: string
  at: number
  title: string
  body: string
  area: string
  emoji: string
  image: string
  prompt: string
  liked: boolean
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
  rule: string
  next: string
}

export type Category = 'health' | 'relationships' | 'finance' | 'career' | 'hobbies' | 'productivity' | 'other'
export type GoalStatus = 'tracking' | 'done' | 'paused'

export interface Goal {
  id: string
  title: string
  description: string
  category: Category
  status: GoalStatus
  sessionId: string
  createdAt: number
  updatedAt: number
  summary: string
  activity: GoalActivity[]
}

export type LibraryKind = 'document' | 'web' | 'image' | 'video' | 'audio' | 'file'

export interface LibraryItem {
  id: string
  path: string
  name: string
  kind: LibraryKind
  description: string
  sessionId: string
  at: number
}

export interface MemoryItem {
  id: string
  at: number
  text: string
  source: 'agent' | 'person' | 'import'
}

export interface Rooms {
  lang: string
  feed: { instructions: string; generatedAt: number; lastTry: number; posts: FeedPost[] }
  ideas: { generatedAt: number; lastTry: number; items: Idea[] }
  goals: Goal[]
  library: LibraryItem[]
  memory: MemoryItem[]
  busy: { feed: boolean; ideas: boolean }
  automations: Record<string, GoalAutomation[]>
  ready: boolean
  studio: { description: string; style: string; at: number }
  /** Whether the stream is open; false before the first snapshot and while reconnecting. */
  streaming: boolean
  /** When the person last had the Feed open (this browser); the rail's dot marks newer posts. */
  feedSeenAt: number
}

const SEEN_KEY = 'nanomuse.feedSeenAt'

const INITIAL: Rooms = {
  lang: '',
  feed: { instructions: '', generatedAt: 0, lastTry: 0, posts: [] },
  ideas: { generatedAt: 0, lastTry: 0, items: [] },
  goals: [],
  library: [],
  memory: [],
  busy: { feed: false, ideas: false },
  automations: {},
  ready: false,
  studio: { description: '', style: 'muse', at: 0 },
  streaming: false,
  feedSeenAt: Number(globalThis.localStorage?.getItem(SEEN_KEY) ?? 0) || 0,
}

const API = 'nanomuse/rooms'
export const EVENTS_URL = `${API}/events`

let snapshot: Rooms = INITIAL
let source: EventSource | undefined
let langSent = false
const listeners = new Set<() => void>()

function publish(next: Rooms): void {
  snapshot = next
  for (const listener of listeners) listener()
}

function open(): void {
  if (source || typeof EventSource === 'undefined') return
  const es = new EventSource(EVENTS_URL)
  source = es
  es.onmessage = (event: MessageEvent<string>) => {
    try {
      const data = JSON.parse(event.data) as Omit<Rooms, 'streaming'>
      publish({ ...snapshot, ...data, streaming: true })
      // The host writes the rooms in the person's language; tell it once which that is.
      if (!langSent && typeof navigator !== 'undefined' && navigator.language && data.lang !== navigator.language) {
        langSent = true
        void roomsCall('lang', { lang: navigator.language }).catch(() => undefined)
      } else {
        langSent = true
      }
    } catch {
      // a malformed frame is skipped; the next snapshot replaces everything anyway
    }
  }
  es.onerror = () => {
    if (snapshot.streaming) publish({ ...snapshot, streaming: false })
    if (es.readyState === 2) {
      source = undefined
      setTimeout(open, 3000)
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  open()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && source) {
      source.close()
      source = undefined
    }
  }
}

function getSnapshot(): Rooms {
  return snapshot
}

/** The rooms' state; the stream opens with the first subscriber. */
export function useRooms(): Rooms {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** The Feed is open: its posts count as seen. */
export function markFeedSeen(): void {
  const at = Date.now()
  try {
    globalThis.localStorage?.setItem(SEEN_KEY, String(at))
  } catch {
    // private mode; the dot comes back next launch, no harm
  }
  publish({ ...snapshot, feedSeenAt: at })
}

/** GET when there is no body, POST with one; 204 resolves to undefined. */
export async function roomsCall<T = undefined>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-nanomuse': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (res.status === 204) return undefined as T
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message ?? `${res.status}`)
  return json as T
}

/** The URL of a Library file's bytes (previews) — `raw=1` — or its text. */
export function fileUrl(id: string, raw = true): string {
  return `${API}/library/file?id=${encodeURIComponent(id)}${raw ? '&raw=1' : ''}`
}

/** Where the rooms send the person next: set by the plugin entry, read by the panels. */
export const nav: { openSession(id: string): void; showChats(): void; startSession(): void } = {
  openSession: () => undefined,
  showChats: () => undefined,
  startSession: () => undefined,
}
