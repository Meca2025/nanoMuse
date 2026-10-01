/**
 * The host's live state in the browser: one `EventSource` on
 * `/nanomuse/cloud/events`, mirrored into a snapshot React reads with
 * `useSyncExternalStore`. The account, the agent's name and face, the hub and
 * its devices, the Hands/Reach calls in flight and the notices from other
 * devices all arrive on it; a dropped stream reconnects by itself.
 */
import { useSyncExternalStore } from 'react'

export interface LiveProfile {
  rev: number
  name: string
  avatar: 'dragon' | 'emoji' | 'face'
  emoji: string
  color: string
  description: string
  style: string
  faceId: string
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
  remoteControl: boolean
  lastError?: string
  devices: LiveDevice[]
}

export interface Live {
  cloud: { signedIn: boolean; hint: string }
  profile: LiveProfile
  hub: LiveHub
  hands: { calls: LiveCall[]; steps: number }
  notices: LiveNotice[]
  /** Whether the stream is open; false before the first snapshot and while reconnecting. */
  streaming: boolean
}

export const DEFAULT_PROFILE: LiveProfile = { rev: 0, name: 'nanoMuse', avatar: 'dragon', emoji: '', color: '', description: '', style: '', faceId: '' }

const INITIAL: Live = {
  cloud: { signedIn: false, hint: '' },
  profile: DEFAULT_PROFILE,
  hub: { connected: false, deviceId: '', deviceName: '', remoteControl: true, devices: [] },
  hands: { calls: [], steps: 0 },
  notices: [],
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
      const data = JSON.parse(event.data) as Omit<Live, 'streaming'>
      publish({ ...snapshot, ...data, streaming: true })
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
