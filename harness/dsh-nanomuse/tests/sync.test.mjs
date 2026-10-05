// Conversations synced between the account's devices (contract C7) on the desktop: the engine
// against a fake relay and fake sessions — a finished turn pushed, the main chat as the
// account's one main conversation (and its adoption), the other devices' chats as mirrors,
// "Continue here" with the transcript as context, tombstones, the switch and the refusals.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SyncEngine, SyncRelay, meanwhileNote, transcriptNote } from '../lib/sync.js'
import { RelayError } from '../lib/relay.js'

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(pred, ms = 2000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (pred()) return
    await tick()
  }
  assert.fail('condition not met in time')
}

/** The relay's /v1/sync/* with the contract's rules, behind a fetch. */
function fakeRelay() {
  const r = { enabled: true, seq: 0, convs: new Map(), msgs: new Map(), pushes: [], calls: [], refuse: null }
  const next = () => ++r.seq
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const state = () => ({ enabled: r.enabled, cursor: r.seq, counts: { conversations: [...r.convs.values()].filter((c) => !c.deleted).length, messages: r.msgs.size }, limits: {} })
  r.add = (cid, kind, title, device = 'phone-1', name = 'Pixel 8') => {
    r.convs.set(cid, { cid, kind, title, device, device_name: name, created_at: 1738000000, updated_at: 1738000000, deleted: false, seq: next() })
  }
  r.say = (cid, role, text, device = 'phone-1', name = 'Pixel 8', at = 1738000050) => {
    const mid = `m-${r.seq + 1}`
    r.msgs.set(mid, { mid, cid, seq: next(), device, device_name: name, role, text, truncated: false, attachments: [], created_at: at, deleted: false })
    return mid
  }
  r.tombstone = (cid) => {
    const c = r.convs.get(cid)
    Object.assign(c, { deleted: true, title: '', seq: next() })
    for (const [mid, m] of r.msgs) if (m.cid === cid) r.msgs.delete(mid)
  }
  r.fetch = async (url, init = {}) => {
    const u = new URL(url)
    const method = init.method ?? 'GET'
    const path = u.pathname
    r.calls.push(`${method} ${path}`)
    if (r.refuse) {
      const { status, code } = r.refuse
      r.refuse = null
      return json(status, { error: { code, message: code } })
    }
    if (!init.headers?.authorization) return json(401, { error: { code: 'bad_key', message: 'no key' } })
    if (path === '/v1/sync/state' && method === 'GET') return json(200, state())
    if (path === '/v1/sync/state' && method === 'PUT') {
      r.enabled = JSON.parse(init.body).enabled !== false
      if (!r.enabled) { r.convs.clear(); r.msgs.clear() }
      return json(200, state())
    }
    if (!r.enabled) return json(409, { error: { code: 'sync_off', message: 'off' } })
    if (path === '/v1/sync/changes' && method === 'GET') {
      const since = Number(u.searchParams.get('since') ?? 0)
      const limit = Number(u.searchParams.get('limit') ?? 500)
      const rows = [...[...r.convs.values()].map((c) => ['c', c]), ...[...r.msgs.values()].map((m) => ['m', m])].filter(([, x]) => x.seq > since).sort((a, b) => a[1].seq - b[1].seq)
      const more = rows.length > limit
      const page = rows.slice(0, limit)
      return json(200, { cursor: more ? page[page.length - 1][1].seq : r.seq, more, conversations: page.filter(([k]) => k === 'c').map(([, x]) => x), messages: page.filter(([k]) => k === 'm').map(([, x]) => x) })
    }
    if (path === '/v1/sync/changes' && method === 'POST') {
      const body = JSON.parse(init.body)
      r.pushes.push(body)
      let accepted = 0
      const rejected = []
      const redirected = new Map()
      for (const c of body.conversations ?? []) {
        if (!r.convs.has(c.cid)) {
          if (c.kind === 'main') {
            const main = [...r.convs.values()].find((x) => x.kind === 'main' && !x.deleted)
            if (main) { redirected.set(c.cid, main.cid); rejected.push({ cid: c.cid, reason: 'main_exists', cid_main: main.cid }); continue }
          }
          r.convs.set(c.cid, { cid: c.cid, kind: c.kind ?? 'side', title: c.title ?? '', device: body.device, device_name: 'Desk', created_at: c.created_at ?? 0, updated_at: c.updated_at ?? 0, deleted: false, seq: next() })
          accepted++
        } else if (c.title !== r.convs.get(c.cid).title) {
          Object.assign(r.convs.get(c.cid), { title: c.title, seq: next() })
          accepted++
        }
      }
      for (const m of body.messages ?? []) {
        if (redirected.has(m.cid)) { rejected.push({ mid: m.mid, reason: 'main_exists', cid_main: redirected.get(m.cid) }); continue }
        if (r.msgs.has(m.mid)) continue
        if (!r.convs.has(m.cid)) { rejected.push({ mid: m.mid, reason: 'unknown_cid' }); continue }
        r.msgs.set(m.mid, { mid: m.mid, cid: m.cid, seq: next(), device: body.device, device_name: 'Desk', role: m.role, text: m.text, truncated: false, attachments: [], created_at: m.created_at ?? 0, deleted: false })
        accepted++
      }
      return json(200, { cursor: r.seq, accepted, rejected })
    }
    if (path === '/v1/sync/changes' && method === 'DELETE') {
      r.convs.clear()
      r.msgs.clear()
      return json(200, state())
    }
    if (path.startsWith('/v1/sync/conversations/') && method === 'DELETE') {
      const cid = decodeURIComponent(path.split('/').pop())
      if (!r.convs.has(cid)) return json(404, { error: { code: 'no_conversation', message: 'none' } })
      r.tombstone(cid)
      return json(200, { cursor: r.seq, deleted: true })
    }
    return json(404, { error: { code: 'not_found', message: path } })
  }
  return r
}

/** The sessions as the engine sees them: titles, lines, creation, the context injected. */
function fakeSessions() {
  const s = { rows: new Map(), lines: new Map(), injected: [], renamed: [], created: 0 }
  s.add = (id, title, lines = []) => {
    s.rows.set(id, { id, title, blank: lines.length === 0, createdAt: 1738000000000, updatedAt: 1738000000000 })
    s.lines.set(id, lines)
  }
  s.api = {
    list: async () => [...s.rows.values()],
    lines: async (id) => s.lines.get(id) ?? [],
    create: async (title) => {
      const id = `session-${++s.created}`
      s.add(id, title)
      return id
    },
    rename: async (id, title) => { s.renamed.push([id, title]); if (s.rows.has(id)) s.rows.get(id).title = title },
    inject: async (id, text) => { s.injected.push([id, text]) },
  }
  return s
}

function engine(relay, sessions, extra = {}) {
  let saved
  const e = new SyncEngine({
    relay: new SyncRelay('https://relay.test', relay.fetch),
    sessions: sessions.api,
    token: async () => (extra.signedOut ? undefined : 'key'),
    deviceId: () => 'pc-1',
    isTaskSession: (id) => id.startsWith('task-'),
    load: () => extra.state,
    save: async (state) => { saved = JSON.parse(JSON.stringify(state)) },
    log: () => undefined,
    pushDelayMs: 5,
    pullEveryMs: 60_000,
    ...extra.options,
  })
  return { engine: e, saved: () => saved }
}

test('a finished turn is pushed; the main chat goes as the account’s main conversation', async () => {
  const relay = fakeRelay()
  const sessions = fakeSessions()
  sessions.add('s-main', 'Hello there', [
    { id: 'u1', role: 'user', text: 'hi there', at: 1738000000000 },
    { id: 'a1', role: 'assistant', text: 'Hello from the desk', at: 1738000001000 },
  ])
  sessions.add('task-1', 'From Pixel 8', [{ id: 'u9', role: 'user', text: 'a task from the phone', at: 1738000002000 }])
  const { engine: e, saved } = engine(relay, sessions)
  await e.setMain('s-main')
  e.turnEnded('s-main')
  e.turnEnded('task-1')
  await until(() => relay.msgs.size === 2)
  const main = [...relay.convs.values()].find((c) => c.kind === 'main')
  assert.equal(main.title, 'Hello there')
  assert.equal(main.device, 'pc-1')
  assert.deepEqual([...relay.msgs.values()].map((m) => [m.role, m.text]).sort(), [['assistant', 'Hello from the desk'], ['user', 'hi there']])
  // the task session is another device's conversation: not synced
  assert.equal([...relay.convs.values()].length, 1)
  // idempotent: the lines are remembered by their dsh ids, the next push sends nothing
  const pushes = relay.pushes.length
  e.turnEnded('s-main')
  await tick(30)
  assert.equal(relay.pushes.length, pushes)
  assert.equal(saved().cids['s-main'], main.cid)
  assert.equal(Object.keys(saved().mids).length, 2)
  // the cursor caught up on the pull after the push
  await until(() => e.state.cursor === relay.seq)
  // a rename goes up on its own
  sessions.rows.get('s-main').title = 'Greetings'
  e.sessionRenamed('s-main')
  await until(() => relay.convs.get(main.cid).title === 'Greetings')
  e.stop()
})

test('the second main adopts the account’s id (push first, then pull)', async () => {
  const relay = fakeRelay()
  relay.add('their-main', 'main', 'Main chat')
  relay.say('their-main', 'user', 'from the phone')
  const sessions = fakeSessions()
  sessions.add('s-main', 'Desk chat', [
    { id: 'u1', role: 'user', text: 'desk question', at: 1738000000000 },
    { id: 'a1', role: 'assistant', text: 'desk answer', at: 1738000001000 },
  ])
  const { engine: e } = engine(relay, sessions)
  await e.setMain('s-main')
  await until(() => [...relay.msgs.values()].some((m) => m.text === 'desk answer'))
  assert.equal([...relay.convs.values()].filter((c) => c.kind === 'main').length, 1)
  assert.equal(e.state.cids['s-main'], 'their-main')
  assert.deepEqual(new Set([...relay.msgs.values()].map((m) => m.cid)), new Set(['their-main']))
  // and the phone's words reach the model here as context on the next pull
  await e.pull()
  const note = sessions.injected.find(([id]) => id === 's-main')
  assert.ok(note && note[1].includes('from the phone') && note[1].startsWith('[Meanwhile'))
  e.stop()
})

test('the other devices’ chats are mirrors; Continue here opens a session with the transcript as context', async () => {
  const relay = fakeRelay()
  relay.add('c1', 'side', 'Dinner plans')
  relay.say('c1', 'user', 'book a table')
  relay.say('c1', 'assistant', 'Booked for 7', 'phone-1', 'Pixel 8', 1738000060)
  const sessions = fakeSessions()
  const { engine: e } = engine(relay, sessions)
  assert.equal(await e.pull(), 3)
  const view = e.view()
  assert.equal(view.mirrors.length, 1)
  assert.deepEqual({ title: view.mirrors[0].title, deviceName: view.mirrors[0].deviceName, messages: view.mirrors[0].messages, sessionId: view.mirrors[0].sessionId }, { title: 'Dinner plans', deviceName: 'Pixel 8', messages: 2, sessionId: null })
  assert.deepEqual(e.mirror('c1').messages.map((m) => [m.role, m.text]), [['user', 'book a table'], ['assistant', 'Booked for 7']])
  // continue here: a session with the title, mapped, the transcript injected; nothing re-pushed
  const sid = await e.continueHere('c1', 'Desk')
  assert.equal(sessions.rows.get(sid).title, 'Dinner plans')
  assert.equal(e.state.cids[sid], 'c1')
  assert.equal(sessions.injected.length, 1)
  assert.ok(sessions.injected[0][1].includes('"Dinner plans"') && sessions.injected[0][1].includes('Pixel 8') && sessions.injected[0][1].includes('book a table'))
  assert.equal(e.view().mirrors[0].sessionId, sid)
  assert.deepEqual(e.view().origins[sid], { device: 'phone-1', deviceName: 'Pixel 8' })
  // the same mirror again gives the same session
  assert.equal(await e.continueHere('c1', 'Desk'), sid)
  // a turn here syncs into the same conversation
  sessions.lines.set(sid, [{ id: 'u2', role: 'user', text: 'make it 8', at: 1738000070000 }, { id: 'a2', role: 'assistant', text: 'Changed to 8', at: 1738000071000 }])
  sessions.rows.get(sid).blank = false
  e.turnEnded(sid)
  await until(() => [...relay.msgs.values()].some((m) => m.text === 'Changed to 8'))
  assert.deepEqual(new Set([...relay.msgs.values()].map((m) => m.cid)), new Set(['c1']))
  // a message tombstoned elsewhere leaves the mirror; the chat deleted elsewhere leaves the list and unmaps the session
  const mid = [...relay.msgs.values()].find((m) => m.text === 'book a table').mid
  Object.assign(relay.msgs.get(mid), { deleted: true, text: '', seq: ++relay.seq })
  await e.pull()
  assert.ok(!e.mirror('c1').messages.some((m) => m.text === 'book a table'))
  relay.tombstone('c1')
  await e.pull()
  assert.equal(e.mirror('c1'), undefined)
  assert.equal(e.state.cids[sid], undefined)
  // a renamed chat elsewhere renames the session here
  relay.add('c2', 'side', 'Old name')
  await e.pull()
  const sid2 = await e.continueHere('c2', 'Desk')
  Object.assign(relay.convs.get('c2'), { title: 'New name', seq: ++relay.seq })
  await e.pull()
  assert.deepEqual(sessions.renamed.at(-1), [sid2, 'New name'])
  e.stop()
})

test('the hub frame pulls, our own echo does not; the switch and the refusals', async () => {
  const relay = fakeRelay()
  const sessions = fakeSessions()
  const { engine: e } = engine(relay, sessions)
  relay.add('c1', 'side', 'Elsewhere')
  e.onFrame({ cursor: relay.seq, from: 'pc-1' })
  await tick(20)
  assert.equal(relay.calls.filter((c) => c.startsWith('GET /v1/sync/changes')).length, 0)
  e.onFrame({ cursor: relay.seq, from: 'phone-1' })
  await until(() => e.mirror('c1') !== undefined)
  // off: the relay deletes, nothing more moves
  const off = await e.setEnabled(false)
  assert.equal(off.enabled, false)
  assert.equal(relay.enabled, false)
  assert.equal(relay.convs.size, 0)
  sessions.add('s1', 'Quiet', [{ id: 'u1', role: 'user', text: 'x', at: 1 }])
  const calls = relay.calls.length
  e.turnEnded('s1')
  await tick(30)
  assert.equal(relay.calls.length, calls)
  // on again: this device's conversations go up in full
  await e.setEnabled(true)
  await until(() => [...relay.convs.values()].some((c) => c.title === 'Quiet'))
  // "Delete synced conversations": the relay emptied, the switch kept, the mirrors gone, the sessions kept
  const after = await e.deleteRemote()
  assert.equal(relay.convs.size, 0)
  assert.equal(after.enabled, true)
  assert.equal(relay.enabled, true)
  assert.ok(sessions.rows.has('s1'))
  // sync_off from the relay (turned off on another device) flips the switch here
  relay.enabled = false
  await e.pull().catch(() => undefined)
  assert.equal(e.enabled, false)
  relay.enabled = true
  await e.setEnabled(true)
  // a refused key pauses until the next sign-in
  relay.refuse = { status: 401, code: 'bad_key' }
  await e.pull().catch(() => undefined)
  assert.equal(await e.active(), false)
  assert.equal(e.view().paused, true)
  await e.accountChanged('acct-1')
  assert.equal(await e.active(), true)
  // a different account starts from zero
  e.state.cursor = 9
  e.state.cids.x = 'y'
  await e.accountChanged('acct-2')
  assert.equal(e.state.cursor, 0)
  assert.deepEqual(e.state.cids, {})
  assert.equal(e.state.accountId, 'acct-2')
  e.stop()
})

test('signed out, nothing moves; the notes read as the model should see them', async () => {
  const relay = fakeRelay()
  const sessions = fakeSessions()
  sessions.add('s1', 'Local only', [{ id: 'u1', role: 'user', text: 'x', at: 1 }])
  const { engine: e } = engine(relay, sessions, { signedOut: true })
  e.turnEnded('s1')
  assert.equal(await e.pull(), 0)
  await tick(20)
  assert.deepEqual(relay.calls, [])
  assert.equal(e.view().available, false)
  const messages = [
    { mid: 'a', role: 'user', text: 'book a table', createdAt: 1, device: 'phone-1', deviceName: 'Pixel 8' },
    { mid: 'b', role: 'assistant', text: 'Booked for 7', createdAt: 2, device: 'phone-1', deviceName: 'Pixel 8' },
  ]
  assert.equal(transcriptNote('Dinner plans', 'Pixel 8', messages, 'Desk'), '[This conversation, "Dinner plans", was started on Pixel 8 and continues here on Desk. What was said so far:]\nPerson (on Pixel 8): book a table\nMuse (on Pixel 8): Booked for 7')
  assert.equal(meanwhileNote(messages.slice(0, 1)), '[Meanwhile, in this same conversation on another device of the account:]\nPerson (on Pixel 8): book a table')
  // the relay's errors keep their code
  const r = new SyncRelay('https://relay.test', async () => new Response(JSON.stringify({ error: { code: 'sync_off', message: 'off' } }), { status: 409 }))
  await assert.rejects(r.changes('k', 0), (err) => err instanceof RelayError && err.code === 'sync_off' && err.status === 409)
})
