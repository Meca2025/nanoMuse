// Conversations synced between the account's devices (contracts C7 and C8) on the desktop: the
// engine against a fake relay and fake sessions — the person's words pushed when sent and the
// model's at the turn's end, the whole history backfilled oldest first, the main chat as the
// account's one main conversation (adopted, merged in time order, our echo never twice), the
// other devices' chats as sessions here from the moment they are pulled, tombstones, the
// switch and the refusals.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SyncEngine, SyncRelay, MAX_POST_MESSAGES, migrate, RemoteStore, meanwhileNote } from '../lib/sync.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

/** The sessions as the engine sees them: titles, lines, creation, the rows kept from elsewhere, the notes to the model. */
function fakeSessions() {
  const s = { rows: new Map(), lines: new Map(), appended: [], forgotten: [], injected: [], renamed: [], created: 0 }
  s.add = (id, title, lines = [], createdAt = 1738000000000) => {
    s.rows.set(id, { id, title, blank: lines.length === 0, createdAt, updatedAt: createdAt })
    s.lines.set(id, lines)
  }
  s.api = {
    list: async () => [...s.rows.values()],
    lines: async (id) => s.lines.get(id) ?? [],
    create: async (title) => {
      const id = `session-${++s.created}`
      s.add(id, title, [], Date.now())
      return id
    },
    rename: async (id, title) => { s.renamed.push([id, title]); if (s.rows.has(id)) s.rows.get(id).title = title },
    keep: async (id, line) => { s.appended.push([id, line]) },
    forget: async (id, mid) => { s.forgotten.push([id, mid]) },
    inject: async (id, text) => { s.injected.push([id, text]) },
  }
  /** What one session shows from elsewhere, in the order it was kept. */
  s.remote = (id) => s.appended.filter(([sid]) => sid === id).map(([, line]) => line)
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

test('the person’s words go up when sent, the model’s at the turn’s end; the main chat is the account’s main conversation', async () => {
  const relay = fakeRelay()
  const sessions = fakeSessions()
  sessions.add('s-main', 'Hello there', [{ id: 'u1', role: 'user', text: 'hi there', at: 1738000000000 }])
  sessions.add('task-1', 'From Pixel 8', [{ id: 'u9', role: 'user', text: 'a task from the phone', at: 1738000002000 }])
  const { engine: e, saved } = engine(relay, sessions)
  assert.equal(await e.setMain('s-main'), 's-main')
  // push at send: the prompt is on the relay while the turn still runs
  e.messageSent('s-main')
  await until(() => relay.msgs.size === 1)
  assert.deepEqual([...relay.msgs.values()].map((m) => [m.role, m.text]), [['user', 'hi there']])
  const main = [...relay.convs.values()].find((c) => c.kind === 'main')
  assert.equal(main.title, 'Hello there')
  assert.equal(main.device, 'pc-1')
  // the turn ends: the final text follows
  sessions.lines.get('s-main').push({ id: 'a1', role: 'assistant', text: 'Hello from the desk', at: 1738000001000 })
  e.turnEnded('s-main')
  e.turnEnded('task-1')
  await until(() => relay.msgs.size === 2)
  assert.deepEqual([...relay.msgs.values()].map((m) => [m.role, m.text]), [['user', 'hi there'], ['assistant', 'Hello from the desk']])
  // the task session is another device's conversation: not synced
  assert.equal([...relay.convs.values()].length, 1)
  // idempotent: the lines are remembered by their dsh ids, the next push sends nothing
  const pushes = relay.pushes.length
  e.turnEnded('s-main')
  await tick(30)
  assert.equal(relay.pushes.length, pushes)
  assert.equal(saved().cids['s-main'], main.cid)
  assert.equal(Object.keys(saved().mids).length, 2)
  // the cursor caught up on the pull after the push, and our own rows came back without being appended
  await until(() => e.state.cursor === relay.seq)
  assert.deepEqual(sessions.appended, [])
  // a rename goes up on its own
  sessions.rows.get('s-main').title = 'Greetings'
  e.sessionRenamed('s-main')
  await until(() => relay.convs.get(main.cid).title === 'Greetings')
  e.stop()
})

test('sign-in backfills the whole history, oldest first, 200 messages a POST', async () => {
  const relay = fakeRelay()
  const sessions = fakeSessions()
  const lines = (prefix, n, from) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, role: i % 2 ? 'assistant' : 'user', text: `${prefix}${i}`, at: from + i * 1000 }))
  sessions.add('s-new', 'Newer', lines('n', 10, 1738100000000), 1738100000000)
  sessions.add('s-old', 'Older', lines('o', 250, 1738000000000), 1738000000000)
  const { engine: e } = engine(relay, sessions)
  await e.setMain('s-old')
  await e.accountChanged('acct-1')
  await until(() => relay.msgs.size === 260)
  // the oldest session's lines first, in the order they were lived, 200 at a time
  const first = relay.pushes.find((p) => p.messages.length > 0)
  assert.equal(first.messages.length, MAX_POST_MESSAGES)
  assert.deepEqual(first.messages.slice(0, 4).map((m) => m.text), ['o0', 'o1', 'o2', 'o3'])
  const order = relay.pushes.flatMap((p) => p.messages.map((m) => m.text))
  assert.deepEqual(order.slice(0, 250), lines('o', 250, 0).map((l) => l.text))
  assert.deepEqual(order.slice(250), lines('n', 10, 0).map((l) => l.text))
  assert.ok(relay.pushes.every((p) => p.messages.length <= MAX_POST_MESSAGES))
  // pulled back: nothing of ours is appended to a session
  await until(() => e.state.cursor === relay.seq)
  assert.deepEqual(sessions.appended, [])
  e.stop()
})

test('the second main adopts the account’s id (pull first); the phone’s turns are in the thread, in time order, never twice', async () => {
  const relay = fakeRelay()
  relay.add('their-main', 'main', 'Main chat')
  relay.say('their-main', 'user', 'earlier, on the phone', 'phone-1', 'Pixel 8', 1737990000)
  relay.say('their-main', 'assistant', 'the phone’s answer', 'phone-1', 'Pixel 8', 1737990005)
  const sessions = fakeSessions()
  sessions.add('s-main', 'Desk chat', [
    { id: 'u1', role: 'user', text: 'desk question', at: 1738000000000 },
    { id: 'a1', role: 'assistant', text: 'desk answer', at: 1738000001000 },
  ])
  const { engine: e } = engine(relay, sessions)
  await e.setMain('s-main')
  await e.accountChanged('acct-1')
  await until(() => [...relay.msgs.values()].some((m) => m.text === 'desk answer'))
  assert.equal([...relay.convs.values()].filter((c) => c.kind === 'main').length, 1)
  assert.equal(e.state.cids['s-main'], 'their-main')
  assert.deepEqual(new Set([...relay.msgs.values()].map((m) => m.cid)), new Set(['their-main']))
  // the phone's turns are rows of the main chat here, with where they came from and when
  assert.deepEqual(sessions.remote('s-main').map((l) => [l.role, l.text, l.deviceName, l.at]), [
    ['user', 'earlier, on the phone', 'Pixel 8', 1737990000000],
    ['assistant', 'the phone’s answer', 'Pixel 8', 1737990005000],
  ])
  assert.ok(sessions.remote('s-main').every((l) => l.mid && l.device === 'phone-1'))
  // later on the phone: appended as it arrives
  relay.say('their-main', 'user', 'later, on the phone', 'phone-1', 'Pixel 8', 1738000060)
  await e.pull()
  assert.equal(sessions.remote('s-main').at(-1).text, 'later, on the phone')
  // a second pull, even from zero, appends nothing again: not our echo, not the phone's rows
  await until(() => e.state.cursor === relay.seq)
  const count = sessions.appended.length
  e.state.cursor = 0
  await e.pull()
  assert.equal(sessions.appended.length, count)
  assert.ok(!sessions.appended.some(([, l]) => l.device === 'pc-1'))
  // one thread: the column may not move the main chat away from the account's conversation
  sessions.add('s-other', 'Other', [{ id: 'u5', role: 'user', text: 'x', at: 1 }])
  assert.equal(await e.setMain('s-other'), 's-main')
  assert.equal(e.state.mainSession, 's-main')
  assert.deepEqual(e.view().sessions, ['s-main'])
  assert.equal(e.view().mainSession, 's-main')
  e.stop()
})

test('a conversation from elsewhere is a chat here at once; it continues under the same id; tombstones and renames', async () => {
  const relay = fakeRelay()
  relay.add('c1', 'side', 'Dinner plans')
  relay.say('c1', 'user', 'book a table')
  relay.say('c1', 'assistant', 'Booked for 7', 'phone-1', 'Pixel 8', 1738000060)
  const sessions = fakeSessions()
  const { engine: e } = engine(relay, sessions)
  assert.equal(await e.pull(), 3)
  // eager: a session with the title, mapped, the two turns appended in order, listed by the column
  assert.equal(sessions.created, 1)
  const sid = [...sessions.rows.keys()][0]
  assert.equal(sessions.rows.get(sid).title, 'Dinner plans')
  assert.equal(e.state.cids[sid], 'c1')
  assert.deepEqual(sessions.remote(sid).map((l) => [l.role, l.text]), [['user', 'book a table'], ['assistant', 'Booked for 7']])
  assert.deepEqual(e.view().sessions, [sid])
  // the title it came with is not pushed back
  await tick(30)
  assert.equal(relay.pushes.filter((p) => p.conversations.length > 0).length, 0)
  // a turn here syncs into the same conversation: the prompt at once, the answer at the end
  sessions.lines.set(sid, [{ id: 'u2', role: 'user', text: 'make it 8', at: 1738000070000 }])
  sessions.rows.get(sid).blank = false
  e.messageSent(sid)
  await until(() => [...relay.msgs.values()].some((m) => m.text === 'make it 8'))
  sessions.lines.get(sid).push({ id: 'a2', role: 'assistant', text: 'Changed to 8', at: 1738000071000 })
  e.turnEnded(sid)
  await until(() => [...relay.msgs.values()].some((m) => m.text === 'Changed to 8'))
  assert.deepEqual(new Set([...relay.msgs.values()].map((m) => m.cid)), new Set(['c1']))
  // a message tombstoned elsewhere is hidden here (a log forgets nothing)
  const mid = [...relay.msgs.values()].find((m) => m.text === 'book a table').mid
  Object.assign(relay.msgs.get(mid), { deleted: true, text: '', seq: ++relay.seq })
  await e.pull()
  assert.deepEqual(e.view().hidden, [mid])
  // the chat deleted elsewhere: unmapped, handed to the column to archive, which reports back
  relay.tombstone('c1')
  await e.pull()
  assert.equal(e.state.cids[sid], undefined)
  assert.deepEqual(e.view().toArchive, [sid])
  await e.archived([sid])
  assert.deepEqual(e.view().toArchive, [])
  // a renamed chat elsewhere renames the session here, without pushing the title back
  relay.add('c2', 'side', 'Old name')
  await e.pull()
  const sid2 = [...sessions.rows.keys()].find((id) => sessions.rows.get(id).title === 'Old name')
  Object.assign(relay.convs.get('c2'), { title: 'New name', seq: ++relay.seq })
  await e.pull()
  assert.deepEqual(sessions.renamed.at(-1), [sid2, 'New name'])
  // the main from the relay, when no main chat exists here yet, becomes the main chat
  relay.add('their-main', 'main', 'Main chat')
  relay.say('their-main', 'user', 'from the phone')
  await e.pull()
  const mainSid = e.state.mainSession
  assert.ok(mainSid && sessions.rows.get(mainSid).title === 'Main chat')
  assert.equal(e.state.cids[mainSid], 'their-main')
  assert.deepEqual(sessions.remote(mainSid).map((l) => l.text), ['from the phone'])
  assert.equal(await e.setMain(sid2), mainSid)
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
  await until(() => e.state.conversations.c1 !== undefined)
  // off: the relay deletes, nothing more moves
  const off = await e.setEnabled(false)
  assert.equal(off.enabled, false)
  assert.equal(relay.enabled, false)
  assert.equal(relay.convs.size, 0)
  sessions.add('s1', 'Quiet', [{ id: 'u1', role: 'user', text: 'x', at: 1 }])
  const calls = relay.calls.length
  e.turnEnded('s1')
  e.messageSent('s1')
  await tick(30)
  assert.equal(relay.calls.length, calls)
  // on again: pull first, then this device's conversations go up in full
  await e.setEnabled(true)
  await until(() => [...relay.convs.values()].some((c) => c.title === 'Quiet'))
  assert.ok(relay.calls.indexOf('GET /v1/sync/changes') < relay.calls.indexOf('POST /v1/sync/changes'))
  // "Delete synced conversations": the relay emptied, the switch kept, the sessions kept
  const after = await e.deleteRemote()
  assert.equal(relay.convs.size, 0)
  assert.equal(after.enabled, true)
  assert.equal(relay.enabled, true)
  assert.ok(sessions.rows.has('s1'))
  assert.deepEqual(e.state.conversations, {})
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

test('signed out, nothing moves; a 0.1.36 state with mirrors pulls again from zero; the relay’s errors keep their code', async () => {
  const relay = fakeRelay()
  const sessions = fakeSessions()
  sessions.add('s1', 'Local only', [{ id: 'u1', role: 'user', text: 'x', at: 1 }])
  const { engine: e } = engine(relay, sessions, { signedOut: true })
  e.turnEnded('s1')
  e.messageSent('s1')
  assert.equal(await e.pull(), 0)
  await tick(20)
  assert.deepEqual(relay.calls, [])
  assert.equal(e.view().available, false)
  // the mirrors of 0.1.36 become sessions and rows on the next pull: the cursor starts over, the pushed ids stay
  const old = migrate({ accountId: 'a', cursor: 42, enabled: true, mainSession: 's1', cids: { s1: 'c-main' }, mids: { u1: 'm1' }, titles: { s1: 'T' }, mirrors: { c1: { cid: 'c1', messages: [] } } })
  assert.equal(old.cursor, 0)
  assert.equal(old.mirrors, undefined)
  assert.deepEqual([old.cids, old.mids, old.conversations, old.pulled], [{ s1: 'c-main' }, { u1: 'm1' }, {}, {}])
  const kept = migrate({ ...old, cursor: 7, conversations: { c1: { kind: 'side', title: 't', device: 'd', deviceName: 'D', createdAt: 1, updatedAt: 1 } } })
  assert.equal(kept.cursor, 7)
  // the relay's errors keep their code
  const r = new SyncRelay('https://relay.test', async () => new Response(JSON.stringify({ error: { code: 'sync_off', message: 'off' } }), { status: 409 }))
  await assert.rejects(r.changes('k', 0), (err) => err instanceof RelayError && err.code === 'sync_off' && err.status === 409)
})

test('the other devices’ turns live in the host’s own store, not the session log: kept once, in time order, written whole, forgotten on a tombstone; the note to the model is bounded', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nm-remote-'))
  const path = join(dir, 'sync-remote.json')
  try {
    const store = new RemoteStore(path)
    store.add('s1', { mid: 'm2', role: 'assistant', text: 'second', at: 2000, device: 'p', deviceName: 'Pixel 8' })
    store.add('s1', { mid: 'm1', role: 'user', text: 'first', at: 1000, device: 'p', deviceName: 'Pixel 8' })
    store.add('s1', { mid: 'm1', role: 'user', text: 'first again', at: 1000, device: 'p', deviceName: 'Pixel 8' })
    assert.deepEqual(store.linesOf('s1').map((l) => l.mid), ['m1', 'm2'])
    assert.deepEqual(store.linesOf('s2'), [])
    await store.flush()
    const onDisk = JSON.parse(readFileSync(path, 'utf8'))
    assert.deepEqual(Object.keys(onDisk), ['s1'])
    assert.equal(onDisk.s1.length, 2)
    // read again by a fresh store, as after a restart
    const again = new RemoteStore(path)
    assert.deepEqual(again.linesOf('s1').map((l) => l.text), ['first', 'second'])
    again.remove('s1', 'm1')
    await again.flush()
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).s1.map((l) => l.mid), ['m2'])
    // the note: the most recent lines, capped
    const many = Array.from({ length: 60 }, (_, i) => ({ mid: `m${i}`, role: i % 2 ? 'assistant' : 'user', text: `line ${i}`, at: i, device: 'p', deviceName: 'Pixel 8' }))
    const note = meanwhileNote(many)
    assert.ok(note.startsWith('[Meanwhile, in this same conversation on another device of the account (20 earlier turns not shown):]'))
    assert.ok(note.includes('Person (on Pixel 8): line 20') && note.includes('Muse (on Pixel 8): line 59') && !note.includes('line 19\n'))
    const big = meanwhileNote([{ mid: 'a', role: 'user', text: 'x'.repeat(20_000), at: 1, device: 'p', deviceName: 'P' }, { mid: 'b', role: 'assistant', text: 'short', at: 2, device: 'p', deviceName: 'P' }])
    assert.ok(big.includes('(1 earlier turn not shown)') && big.endsWith('Muse (on P): short'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a pull keeps the other devices’ rows for the transcript and hands the model one note per session; a tombstone forgets the row', async () => {
  const relay = fakeRelay()
  const sessions = fakeSessions()
  const { engine: e } = engine(relay, sessions)
  relay.add('c-side', 'side', 'Dinner plans', 'pixel', 'Pixel 8')
  relay.say('c-side', 'user', 'Pasta tonight?', 'pixel', 'Pixel 8', 10)
  const p2 = relay.say('c-side', 'assistant', 'Sure, for how many?', 'pixel', 'Pixel 8', 11)
  await e.pull()
  const sid = Object.keys(e.state.cids).find((id) => e.state.cids[id] === 'c-side')
  assert.ok(sid)
  assert.deepEqual(sessions.remote(sid).map((l) => [l.role, l.text, l.deviceName]), [['user', 'Pasta tonight?', 'Pixel 8'], ['assistant', 'Sure, for how many?', 'Pixel 8']])
  assert.equal(sessions.injected.length, 1)
  assert.equal(sessions.injected[0][0], sid)
  assert.ok(sessions.injected[0][1].startsWith('[Meanwhile, in this same conversation on another device of the account:]\nPerson (on Pixel 8): Pasta tonight?\nMuse (on Pixel 8): Sure, for how many?'))
  // deleted on the phone: hidden here and forgotten by the store; nothing injected for a tombstone
  Object.assign(relay.msgs.get(p2), { deleted: true, text: '', seq: ++relay.seq })
  await e.pull()
  assert.deepEqual(sessions.forgotten, [[sid, p2]])
  assert.ok(e.view().hidden.includes(p2))
  assert.equal(sessions.injected.length, 1)
  e.stop()
})
