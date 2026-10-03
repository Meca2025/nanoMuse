// The Live stage's reading of the hands: a `computer_act` call as the caption and
// cursor marker need it, and the first line of what `computer_screen` says.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { screenHead, stageAction } from '../lib/cloud.js'

test('stageAction keeps the kind, the words and the point', () => {
  const a = stageAction({ action: 'click', x: 120.5, y: '300', label: '  Save\n  file ' })
  assert.equal(a.kind, 'click')
  assert.equal(a.label, 'Save file')
  assert.equal(a.x, 120.5)
  assert.equal(a.y, 300)
  assert.ok(a.at > 0)
  const k = stageAction({ action: 'key', keys: ['ctrl', 's'] })
  assert.equal(k.text, 'ctrl+s')
  assert.equal(k.x, -1)
  const o = stageAction({ action: 'open_app', app: 'Safari' })
  assert.equal(o.text, 'Safari')
  const t = stageAction({ action: 'type', text: 'hello '.repeat(40) })
  assert.equal(t.text.length, 80)
  assert.equal(stageAction(undefined).kind, 'act')
})

test('screenHead reads the window in front and the size', () => {
  assert.deepEqual(screenHead('Safari — Apple · 2560×1600 · keyboard hidden\nmore words'), { title: 'Safari — Apple', width: 2560, height: 1600 })
  assert.deepEqual(screenHead('\n  phone · home · 1080x2400 · keyboard shown'), { title: 'phone', width: 1080, height: 2400 })
  assert.deepEqual(screenHead(''), { title: '', width: 0, height: 0 })
})

test('a hands refusal is recognised and confirmed with the ticket the runtime checks', async () => {
  const { confirmTicket, confirmationOf, refusalOf } = await import('../lib/cloud.js')
  const refusal = { isError: true, error: { message: 'x' }, content: [{ type: 'text', text: 'Not done — press enter: Enter sends what is typed. The person has to agree to this step on their permission card first; the host asks them.' }] }
  assert.equal(refusalOf(refusal), 'press enter: Enter sends what is typed. The person has to agree to this step on their permission card first; the host asks them.')
  assert.equal(refusalOf({ isError: true, error: { message: 'timeout' }, content: [{ type: 'text', text: 'timeout' }] }), undefined)
  // the model's own word is a confirmation we recognise but never make; the ticket is bound to the arguments
  assert.equal(confirmationOf({ action: 'key', confirmed: true }), true)
  assert.equal(confirmationOf({ action: 'key' }), undefined)
  const enter = { action: 'key', keys: ['enter'] }
  const t = confirmTicket('s3cret', enter)
  assert.match(t, /^[0-9a-f]{32}$/)
  assert.equal(confirmTicket('s3cret', { keys: ['enter'], action: 'key', confirmed: 'junk' }), t)
  assert.notEqual(confirmTicket('s3cret', { action: 'type', text: 'hi', submit: true }), t)
  assert.notEqual(confirmTicket('other', enter), t)
  // parity with nanomuse/bridge/mcp_server.py: the same bytes, the same digest
  assert.equal(confirmTicket('s3cret', { action: 'type', text: '你好 "world"', submit: true, keys: ['enter'], n: 1.5, nested: { b: 2, a: [1, null] } }), 'a0304fd4d602086fbac512191ed08838')
})
