/** The loopback API the host half serves under `/nanomuse/cloud/*` (see `cloud.ts`). */
import type { LiveHub, LiveProfile } from './live.ts'
import type { Words } from './locales.ts'

export type Translate = (key: Words, values?: Record<string, string | number>) => string

export interface Account {
  id: string
  channel: string
  hint: string
  member: boolean
  tokens: { unlimited: boolean; granted: number; used: number; remaining: number }
  /** Data controls (relay 0.9); absent on an older relay. */
  contribute?: { on: boolean; samples: number; defaultOn?: boolean; privacyUrl: string }
}

export interface Model {
  id: string
  name: string
  kind: string
}

export interface CloudStatus {
  signedIn: boolean
  ready: boolean
  baseURL: string
  account?: Account
  models: Model[]
  profile: LiveProfile
  hub: LiveHub
  error?: { code: string; message: string }
}

const API = 'nanomuse/cloud'

/** GET when there is no body (`status`, `invite` — the read-only routes), POST with one; 204 resolves to undefined. */
export async function call<T>(path: string, body?: unknown): Promise<T> {
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

export const column: Record<string, string | number> = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 440 }
export const row: Record<string, string | number> = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }
export const muted: Record<string, string | number> = { color: 'var(--dsw-alias-label-secondary, #6b6b6b)', fontSize: 13, lineHeight: 1.5 }
export const errorStyle: Record<string, string | number> = { color: 'var(--dsw-alias-state-error-primary, #b42318)', fontSize: 13 }
