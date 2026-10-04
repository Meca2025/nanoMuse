/**
 * The host's live state in the browser: one `EventSource` on
 * `/nanomuse/cloud/events`, mirrored into a snapshot React reads with
 * `useSyncExternalStore`. The account, the agent's name and face, the hub and
 * its devices, the Hands/Reach calls in flight and the notices from other
 * devices all arrive on it; a dropped stream reconnects by itself.
 */
import { useSyncExternalStore } from 'react'
import type { Grant, Hold, PendingApproval, SharedConnector, UpdateInfo } from '../desk.ts'

export type { Grant, Hold, PendingApproval, SharedConnector, UpdateInfo }

export interface LiveProfile {
  rev: number
  name: string
  avatar: 'dragon' | 'emoji' | 'face'
  emoji: string
  color: string
  description: string
  style: string
  faceId: string
  /** The account's connections on every device (this one included), as the relay lists them. */
  connectors: SharedConnector[]
}

export interface LiveDevice {
  id: string
  name: string
  kind: string
  os: string
  version: string
  online: boolean
  last_seen: number
  controllable: boolean
  actions: string[]
}

export interface LiveCall {
  id: string
  name: string
  args: Record<string, string>
  sessionId: string
  since: number
}

export interface LiveNotice {
  id: number
  /** `notify`: words from another device; `call`: `action` ran here for `from`. */
  kind: 'notify' | 'call'
  from: string
  title: string
  text: string
  action?: string
  at: number
}

export interface LiveHub {
  connected: boolean
  deviceId: string
  deviceName: string
  /** On: every device may run things here without asking; off: each device asks on this screen. */
  remoteControl: boolean
  /** Devices allowed without asking. */
  trusted: LiveTrusted[]
  /** Questions from other devices waiting for an answer here. */
  asks: LiveAsk[]
  lastError?: string
  devices: LiveDevice[]
}

export interface LiveTrusted {
  id: string
  name: string
  at: number
}

export interface LiveAsk {
  id: string
  from: string
  fromId: string
  action: string
  text: string
  at: number
}

/** The last thing the hands did, for the stage's caption and cursor marker. */
export interface LiveStageAction {
  kind: string
  label: string
  text: string
  /** Pixels of the frame; -1 when the step had no point. */
  x: number
  y: number
  at: number
}

/** The Live stage: the latest screenshot of a screen the agent is working on. */
export interface LiveStage {
  /** 0 before any frame; grows with each new one (the frame URL's cache key). */
  seq: number
  at: number
  source: 'computer' | 'device'
  /** The other device's name; empty for this computer. */
  device: string
  width: number
  height: number
  /** What is in front on that screen. */
  title: string
  /** `window`: the hands drive one app's window and the pointer stays with the person. */
  mode?: 'screen' | 'window'
  action: LiveStageAction | null
  sessionId: string
}

export interface Live {
  cloud: { signedIn: boolean; hint: string }
  profile: LiveProfile
  hub: LiveHub
  hands: { calls: LiveCall[]; steps: number }
  stage: LiveStage
  notices: LiveNotice[]
  /** Questions the agent asked before a step, open now; the stage answers them too. */
  approvals: PendingApproval[]
  /** Pauses of the hands that are on. */
  holds: Hold[]
  /** Standing "always allow" grants for the hands, per app. */
  grants: Grant[]
  /** The model the hands see the screen with; empty when the account has none. */
  handsModel: string
  /** The last update check, or null before one ran. */
  update: UpdateInfo | null
  /** Whether the stream is open; false before the first snapshot and while reconnecting. */
  streaming: boolean
}

export const DEFAULT_PROFILE: LiveProfile = { rev: 0, name: 'nanoMuse', avatar: 'dragon', emoji: '', color: '', description: '', style: '', faceId: '', connectors: [] }

const INITIAL: Live = {
  cloud: { signedIn: false, hint: '' },
  profile: DEFAULT_PROFILE,
  hub: { connected: false, deviceId: '', deviceName: '', remoteControl: false, trusted: [], asks: [], devices: [] },
  hands: { calls: [], steps: 0 },
  stage: { seq: 0, at: 0, source: 'computer', device: '', width: 0, height: 0, title: '', action: null, sessionId: '' },
  notices: [],
  approvals: [],
  holds: [],
  grants: [],
  handsModel: '',
  update: null,
  streaming: false,
}

/** Document-relative, so it resolves under whatever mount served the page. */
export const EVENTS_URL = 'nanomuse/cloud/events'

let snapshot: Live = INITIAL
let source: EventSource | undefined
const listeners = new Set<() => void>()

function publish(next: Live): void {
  snapshot = next
  for (const listener of listeners) listener()
}

function open(): void {
  if (source || typeof EventSource === 'undefined') return
  const es = new EventSource(EVENTS_URL)
  source = es
  es.onmessage = (event: MessageEvent<string>) => {
    try {
      const data = JSON.parse(event.data) as Partial<Omit<Live, 'streaming'>>
      // An older host (0.1.33) sends no approvals/holds; keep the defaults rather than undefined.
      publish({ ...snapshot, ...data, profile: { ...DEFAULT_PROFILE, ...data.profile }, approvals: data.approvals ?? [], holds: data.holds ?? [], grants: data.grants ?? [], handsModel: data.handsModel ?? '', update: data.update ?? null, streaming: true })
    } catch {
      // a malformed frame is skipped; the next snapshot replaces everything anyway
    }
  }
  es.onerror = () => {
    if (snapshot.streaming) publish({ ...snapshot, streaming: false })
    // EventSource reconnects on its own; a closed one (readyState 2) is reopened.
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

function getSnapshot(): Live {
  return snapshot
}

/** The host's live state; the stream opens with the first subscriber. */
export function useLive(): Live {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** The current snapshot outside React (e.g. a one-off check). */
export function peekLive(): Live {
  return snapshot
}

/** Hear every snapshot outside React; the stream opens with the first subscriber. */
export function subscribeLive(listener: (live: Live) => void): () => void {
  const off = subscribe(() => listener(snapshot))
  listener(snapshot)
  return off
}
