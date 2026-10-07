/**
 * The turns of a conversation written on the account's other devices, in the chat here
 * (contract C8, one thread). The host appends each such turn to the session's log as a
 * `user/message` whose source is `nanomuse-sync` (see `sync.ts`), so the model reads it with
 * the rest of the conversation; the harness renders a message of that source as a collapsed
 * context row. This module dresses that row: it is hidden, and in its place stands a bubble —
 * the person's on the right, the Muse's on the left — with "From Pixel 8" under it. A turn
 * older than a prompt typed here before it arrived is shown before that prompt (the host
 * says which: `before`), so the thread reads in time order whatever order the log has.
 *
 * While the other device works on its last prompt (contract C9, presence), a quiet line
 * stands under that bubble — "kwai is working…" — until its reply arrives, presence says
 * done, or ten minutes pass.
 *
 * Like `FenceCards.ts`: a MutationObserver over the document, idempotent sweeps, nothing
 * of React's touched but a `display` on the row; a bubble whose row is gone goes with it.
 * The sweeps are cheap where it matters: a session with no turn from elsewhere is left
 * alone (a long transcript streaming a reply mutates many times a second), mutations made
 * by the bubbles themselves are ignored, and the rest are coalesced over 100 ms.
 */
import { call, type Translate } from './api.ts'
import { subscribeLive } from './live.ts'

const DONE = 'data-nm-remote'
const KEY = 'data-nm-remote-key'

interface RemoteRow {
  /** The dsh message id: the row's `data-chat-node-key` is `13:input-message<id>`. */
  id: string
  mid: string
  role: 'user' | 'assistant'
  text: string
  at: number
  device: string
  deviceName: string
  /** The node key of the local prompt this turn is older than, when it is. */
  before: string | null
}
/** Another device working on this conversation right now (C9). */
interface Working {
  from: string
  deviceName: string
  /** Unix epoch milliseconds. */
  at: number
}
interface Remote {
  lines: RemoteRow[]
  hidden: string[]
  working: Working | null
}

/** A `working` presence is over this long after its `at` (C9). */
const WORKING_TTL_MS = 10 * 60_000
/** Mutations within this window become one sweep. */
const SWEEP_DELAY_MS = 100

const nodeKey = (id: string): string => `13:input-message${id}`

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function bubble(t: Translate, row: RemoteRow): HTMLElement {
  const root = el('div', `nm-remote nm-remote-${row.role}`)
  root.setAttribute(KEY, nodeKey(row.id))
  root.setAttribute('data-nm-remote-mid', row.mid)
  const body = el('div', 'nm-remote-bubble', row.text)
  root.append(body)
  const from = el('div', 'nm-remote-from', t('chFrom', { device: row.deviceName || row.device || '?' }))
  if (row.at > 0) from.title = new Date(row.at).toLocaleString()
  root.append(from)
  return root
}

/** The element the chat lays out: the row itself, or the turn-process group it sits in. */
function flowItem(node: HTMLElement, content: HTMLElement): HTMLElement {
  let item = node
  while (item.parentElement && item.parentElement !== content && item.parentElement.hasAttribute('data-chat-group-key')) item = item.parentElement
  return item
}

/** Watch the document for the other devices' turns and show them as bubbles; returns the stop function. */
export function renderRemoteBubbles(t: Translate): () => void {
  const cache = new Map<string, Remote>()
  const inflight = new Set<string>()
  let scheduled: ReturnType<typeof setTimeout> | undefined
  let expiry: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const fetchFor = (sessionId: string) => {
    if (inflight.has(sessionId)) return
    inflight.add(sessionId)
    call<Remote>(`sync/remote?session=${encodeURIComponent(sessionId)}`)
      .then((remote) => {
        if (stopped) return
        cache.set(sessionId, { lines: remote.lines ?? [], hidden: remote.hidden ?? [], working: remote.working ?? null })
        // placed afresh: a prompt sent here since the last read is a new anchor for the older lines
        for (const content of document.querySelectorAll<HTMLElement>(`[data-conversation-content][data-conversation-session="${CSS.escape(sessionId)}"]`)) {
          for (const node of content.querySelectorAll('.nm-remote')) node.remove()
        }
        schedule()
      })
      .catch(() => undefined)
      .finally(() => inflight.delete(sessionId))
  }

  /** The bubble the working line belongs under: the other device's last line, when it is a prompt without a reply yet. */
  const workingLine = (remote: Remote): RemoteRow | undefined => {
    const w = remote.working
    if (!w || Date.now() - w.at >= WORKING_TTL_MS) return undefined
    const last = remote.lines.at(-1)
    return last && last.role === 'user' && (!w.from || last.device === w.from) ? last : undefined
  }

  const dress = (content: HTMLElement, remote: Remote) => {
    const hidden = new Set(remote.hidden)
    const rows = new Map<string, HTMLElement>()
    for (const node of content.querySelectorAll<HTMLElement>('[data-chat-node-key]')) rows.set(node.getAttribute('data-chat-node-key') ?? '', node)
    const bubbles = new Map<string, HTMLElement>()
    for (const node of content.querySelectorAll<HTMLElement>('.nm-remote')) bubbles.set(node.getAttribute(KEY) ?? '', node)
    // The chat renders no row for a message appended outside a turn (the log has it, the model
    // reads it, the transcript shows nothing) — so a line without a row gets its bubble all the
    // same: before the local prompt it is older than, else after everything shown so far. Lines
    // come in log order, which is time order, so appended bubbles keep that order.
    let tail: HTMLElement | null = null
    const under = workingLine(remote)
    for (const line of remote.lines) {
      const key = nodeKey(line.id)
      const row = rows.get(key)
      if (row && row.getAttribute(DONE) !== 'done') {
        row.setAttribute(DONE, 'done')
        row.style.display = 'none'
      }
      let shown = bubbles.get(key)
      if (!shown) {
        shown = bubble(t, line)
        const anchor = line.before ? rows.get(line.before) : undefined
        if (anchor) flowItem(anchor, content).insertAdjacentElement('beforebegin', shown)
        else if (row) flowItem(row, content).insertAdjacentElement('afterend', shown)
        else if (tail) tail.insertAdjacentElement('afterend', shown)
        else {
          const last = [...rows.values()].at(-1)
          // no row at all: the chat's "hero" layout — the bubbles go into the scrolling body, above the composer
          const seat = last ? null : content.querySelector<HTMLElement>('[data-conversation-scroll] > [data-composer-seat]')
          if (last) flowItem(last, content).insertAdjacentElement('afterend', shown)
          else if (seat) seat.insertAdjacentElement('beforebegin', shown)
          else content.append(shown)
        }
      }
      if (!row && !line.before) tail = shown
      bubbles.delete(key)
      shown.style.display = hidden.has(line.mid) ? 'none' : ''
      // the working line under the other device's last prompt (C9), and nowhere else
      const working = shown.querySelector('.nm-remote-working')
      if (line === under) {
        if (!working) shown.append(el('div', 'nm-remote-working', t('chWorking', { device: remote.working?.deviceName || line.deviceName || line.device || '?' })))
      } else working?.remove()
    }
    // a bubble whose row left the document (paged out, re-rendered elsewhere) goes; the next sweep brings it back
    for (const shown of bubbles.values()) shown.remove()
    if (under && remote.working && !expiry) {
      // the line goes away by itself ten minutes after the last `at`
      expiry = setTimeout(() => {
        expiry = undefined
        schedule()
      }, Math.max(0, remote.working.at + WORKING_TTL_MS - Date.now()) + 50)
    }
  }

  const sweep = () => {
    scheduled = undefined
    for (const content of document.querySelectorAll<HTMLElement>('[data-conversation-content][data-conversation-session]')) {
      const sessionId = content.getAttribute('data-conversation-session') ?? ''
      if (!sessionId) continue
      const remote = cache.get(sessionId)
      if (!remote) {
        fetchFor(sessionId)
        continue
      }
      // nothing from elsewhere in this chat: its rows are not read at all
      if (remote.lines.length === 0) continue
      dress(content, remote)
    }
  }
  const schedule = () => {
    if (scheduled || stopped) return
    scheduled = setTimeout(() => window.requestAnimationFrame(sweep), SWEEP_DELAY_MS)
  }
  /** Whether a mutation is one the bubbles made themselves: no sweep for those. */
  const ours = (m: MutationRecord): boolean => {
    const target = m.target instanceof Element ? m.target : m.target.parentElement
    if (target?.closest('.nm-remote')) return true
    const nodes = [...m.addedNodes, ...m.removedNodes]
    return nodes.length > 0 && nodes.every((n) => n instanceof Element && n.classList.contains('nm-remote'))
  }
  const observer = new MutationObserver((records) => {
    if (records.some((m) => !ours(m))) schedule()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  // the host's sync revision moved (a pull, a tombstone): the sessions on screen are read again
  let rev = -1
  const offLive = subscribeLive((live) => {
    const next = live.sync?.rev ?? 0
    if (next === rev) return
    rev = next
    cache.clear()
    schedule()
  })
  schedule()
  return () => {
    stopped = true
    observer.disconnect()
    offLive()
    if (scheduled) clearTimeout(scheduled)
    if (expiry) clearTimeout(expiry)
    for (const node of document.querySelectorAll('.nm-remote')) node.remove()
    for (const row of document.querySelectorAll<HTMLElement>(`[${DONE}]`)) {
      row.removeAttribute(DONE)
      row.style.display = ''
    }
  }
}
