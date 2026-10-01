// The hub client against a fake socket: hello with the key, welcome, calls and
// their results/events/errors, incoming calls answered, the device list,
// reconnect after a drop, and a refused key.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HubClient, HubError } from '../lib/hub.js'

const OPEN = 1

/** A socket the test drives: `sent` collects frames, `push` delivers frames, `drop` closes. */
class FakeSocket {
  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sent = []
    this.listeners = { open: [], message: [], close: [], error: [] }
  }
  addEventListener(type, fn) {
    this.listeners[type].push(fn)
  }
  send(data) {
    this.sent.push(JSON.parse(data))
  }
  close(code = 1000, reason = '') {
    if (this.readyState === 3) return
    this.readyState = 3
    for (const fn of this.listeners.close) fn({ code, reason })
  }
  open() {
    this.readyState = OPEN
    for (const fn of this.listeners.open) fn({})
  }
  push(frame) {
    for (const fn of this.listeners.message) fn({ data: JSON.stringify(frame) })
  }
  drop(code = 1006, reason = '') {
    this.readyState = 3
    for (const fn of this.listeners.close) fn({ code, reason })
  }
}

const DEVICE = { id: 'pc-dsh-test', name: 'Desk', kind: 'computer', os: 'Linux', version: 'test', actions: ['info', 'notify'] }

function harness({ key = 'nm_test' } = {}) {
  const sockets = []
  const client = new HubClient({
    url: 'ws://relay/v1/hub',
    key: async () => key,
    device: () => DEVICE,
    socket: (url) => {
      const s = new FakeSocket(url)
      sockets.push(s)
      return s
    },
    backoffMs: { min: 5, max: 20 },
    pingMs: 100_000,
  })
  return { client, sockets }
}

const tick = () => new Promise((r) => setTimeout(r, 0))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function connected(h) {
  h.client.start()
  await tick()
  const s = h.sockets.at(-1)
  s.open()
  assert.deepEqual(s.sent[0], { type: 'hello', key: 'nm_test', device: DEVICE })
  s.push({ type: 'welcome', device_id: DEVICE.id, devices: [{ id: DEVICE.id, name: 'Desk', kind: 'computer', online: true }, { id: 'phone-1', name: 'Phone', kind: 'phone', online: true, controllable: true }], server: {} })
  assert.equal(h.client.connected, true)
  assert.equal(h.client.deviceId, DEVICE.id)
  return s
}

test('hello carries the key; welcome brings the device list', async () => {
  const h = harness()
  const s = await connected(h)
  assert.equal(h.client.devices.length, 2)
  assert.equal(h.client.find('phone')?.id, 'phone-1')
  assert.equal(h.client.find('PHONE')?.id, 'phone-1')
  assert.equal(h.client.find('')?.id, 'phone-1', 'the only other device')
  assert.equal(h.client.find('tablet'), undefined)
  h.client.stop()
  assert.equal(s.readyState, 3)
  assert.equal(h.client.connected, false)
})

test('a call resolves with the result body, sees events, and fails on an error frame', async () => {
  const h = harness()
  const s = await connected(h)
  const events = []
  const p = h.client.call('phone-1', 'task', { text: 'hi' }, { onEvent: (b) => events.push(b), timeoutMs: 1000 })
  const sent = s.sent.at(-1)
  assert.equal(sent.type, 'call')
  assert.equal(sent.to, 'phone-1')
  assert.equal(sent.action, 'task')
  s.push({ type: 'event', id: sent.id, body: { stage: 'tool', name: 'screen' } })
  s.push({ type: 'result', id: sent.id, ok: true, body: { text: 'done' } })
  assert.deepEqual(await p, { text: 'done' })
  assert.deepEqual(events, [{ stage: 'tool', name: 'screen' }])

  const p2 = h.client.call('phone-1', 'screen', {}, { timeoutMs: 1000 })
  const id2 = s.sent.at(-1).id
  s.push({ type: 'error', id: id2, code: 'device_offline', message: 'gone' })
  await assert.rejects(p2, (e) => e instanceof HubError && e.code === 'device_offline')

  const p3 = h.client.call('phone-1', 'shell', { command: 'ls' }, { timeoutMs: 1000 })
  const id3 = s.sent.at(-1).id
  s.push({ type: 'result', id: id3, ok: false, error: 'denied', message: 'no' })
  await assert.rejects(p3, (e) => e instanceof HubError && e.code === 'denied' && e.message === 'no')

  const p4 = h.client.call('phone-1', 'info', {}, { timeoutMs: 10 })
  await assert.rejects(p4, (e) => e instanceof HubError && e.code === 'timeout')

  // A caller may pick the id up front, so it can ask the device to `stop` that very call.
  const id5 = h.client.nextId()
  const p5 = h.client.call('phone-1', 'task', { text: 'later' }, { id: id5, timeoutMs: 1000 })
  assert.equal(s.sent.at(-1).id, id5)
  s.push({ type: 'result', id: id5, ok: true, body: { text: 'ok' } })
  assert.deepEqual(await p5, { text: 'ok' })
  h.client.stop()
})

test('an incoming call is answered by its handler; unknown actions are refused', async () => {
  const h = harness()
  const s = await connected(h)
  h.client.handle('notify', async (args, call) => {
    call.event({ stage: 'shown' })
    return { ok: true, text: args.text }
  })
  s.push({ type: 'call', id: 'c1', from: { id: 'phone-1', name: 'Phone', kind: 'phone' }, action: 'notify', args: { text: 'dinner' } })
  await tick()
  assert.deepEqual(s.sent.at(-2), { type: 'event', id: 'c1', body: { stage: 'shown' } })
  assert.deepEqual(s.sent.at(-1), { type: 'result', id: 'c1', ok: true, body: { ok: true, text: 'dinner' } })
  s.push({ type: 'call', id: 'c2', from: { id: 'phone-1', name: 'Phone', kind: 'phone' }, action: 'shell', args: {} })
  await tick()
  assert.equal(s.sent.at(-1).ok, false)
  assert.equal(s.sent.at(-1).error, 'unknown_action')
  h.client.stop()
})

test('a dropped socket reconnects; a refused key stops and reports', async () => {
  const h = harness()
  let states = 0
  let unauthorized = 0
  h.client.onState(() => states++)
  h.client.onUnauthorized(() => unauthorized++)
  const s = await connected(h)
  const pending = h.client.call('phone-1', 'info', {}, { timeoutMs: 1000 })
  s.drop(1006, 'network')
  await assert.rejects(pending, (e) => e instanceof HubError && e.code === 'disconnected')
  assert.equal(h.client.connected, false)
  await wait(30)
  assert.equal(h.sockets.length, 2, 'a new socket was opened')
  const s2 = h.sockets[1]
  s2.open()
  s2.push({ type: 'welcome', device_id: DEVICE.id, devices: [] })
  assert.equal(h.client.connected, true)
  s2.drop(4001, 'bad key')
  await tick()
  assert.equal(unauthorized, 1)
  assert.equal(h.client.connected, false)
  await wait(30)
  assert.equal(h.sockets.length, 2, 'no reconnect after a refused key')
  assert.ok(states >= 3)
})

test('without a key nothing connects until restart', async () => {
  let key
  const sockets = []
  const client = new HubClient({ url: 'ws://relay/v1/hub', key: async () => key, device: () => DEVICE, socket: (u) => { const s = new FakeSocket(u); sockets.push(s); return s }, backoffMs: { min: 5, max: 20 } })
  client.start()
  await tick()
  assert.equal(sockets.length, 0)
  key = 'nm_test'
  client.restart()
  await tick()
  assert.equal(sockets.length, 1)
  client.stop()
})
