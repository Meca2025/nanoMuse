/**
 * The few switches of this desktop that live in the browser half alone, kept
 * in localStorage (per host origin): whether the harness's own controls show
 * beside the Muse chrome, whether the display stays awake while the agent
 * works, and the look preferences the Muse desktop keeps in Settings → General.
 * A small observable so every reader re-renders when one flips.
 */
import { useSyncExternalStore } from 'react'

export interface Prefs {
  /** Show DeepSeek Harness's own controls: the model picker, the modes, the workspace browser. */
  showHarness: boolean
  /** Keep the display awake while a turn runs (through the Electron bridge). */
  keepAwake: boolean
  /** Show the agent's steps (tool rows) in the chat; off, the chat keeps to the conversation and the words under the face say what it is on. */
  showSteps: boolean
  /** Answers given on approval cards, newest first — the drawer's Approvals tab. */
  approvals: ApprovalRecord[]
  /** Where the Live stage (the picture-in-picture of the hands) was last put and how wide; unset = bottom right, default width. */
  stage?: StagePlace | undefined
}

export interface StagePlace {
  /** Distance from the window's right and bottom edges, in px. */
  right: number
  bottom: number
  /** The frame's width, in px. */
  width: number
}

export interface ApprovalRecord {
  at: number
  toolName: string
  reason: string
  outcome: 'allowed' | 'rejected'
}

const KEY = 'nanomuse.prefs'
const DEFAULTS: Prefs = { showHarness: false, keepAwake: true, showSteps: false, approvals: [] }
const MAX_APPROVALS = 50

let current: Prefs = read()
const listeners = new Set<() => void>()

function read(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return {
      showHarness: parsed.showHarness === true,
      keepAwake: parsed.keepAwake !== false,
      showSteps: parsed.showSteps === true,
      approvals: Array.isArray(parsed.approvals) ? parsed.approvals.slice(0, MAX_APPROVALS) : [],
      stage: readStage(parsed.stage),
    }
  } catch {
    return DEFAULTS
  }
}

function readStage(raw: unknown): StagePlace | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const { right, bottom, width } = raw as Partial<StagePlace>
  if (![right, bottom, width].every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined
  return { right: right as number, bottom: bottom as number, width: width as number }
}

export function getPrefs(): Prefs {
  return current
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // private mode: the switch holds for this page only
  }
  for (const listener of listeners) listener()
}

export function recordApproval(record: ApprovalRecord): void {
  setPrefs({ approvals: [record, ...current.approvals].slice(0, MAX_APPROVALS) })
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const subscribe = subscribePrefs

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs)
}
