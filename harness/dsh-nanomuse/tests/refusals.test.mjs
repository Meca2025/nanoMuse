// The relay's refusals, read out of the harness adapter's failure line and turned into the
// card the chat draws (C12): the allowance used up with its guidance, a request too large
// (the relay's JSON and the proxy's plain text), a retired key, a relay that did not answer —
// and what is left alone (another provider's words, the codes the harness itself acts on).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyRefusal, parseRelayFailure, providerFailureKind, refusalCard, refusalCode, refusalKindOf, refusalSentence, relayFailure, REFUSAL_PREFIX } from '../lib/refusals.js'

/** The relay's `error_response(...)` body, as `pi-ai` prints it: `<status>: <inner error object>`. */
function relayLine(status, inner) {
  return `${status}: ${JSON.stringify(inner)}`
}

const GUIDANCE = {
  version: 1,
  region: 'cn',
  docs: 'https://docs.example/own-key',
  providers: [{ id: 'bailian', name: 'Alibaba Cloud Bailian', name_zh: '阿里云百炼', key_url: 'https://bailian.example/keys', auth: ['key'], covers: ['chat', 'vision', 'image', 'video'] }],
  plans: [{ id: 'chatgpt', provider: 'openai', name: 'ChatGPT', auth: 'oauth-chatgpt', clients: ['desktop', 'android', 'ios'], covers: ['chat', 'vision'] }],
  caveats: { chatgpt: 'OpenAI’s terms…', chatgpt_zh: 'OpenAI 的条款…' },
}

const EXHAUSTED = {
  message: 'The free allowance (¥10) is used up. Three ways on…',
  type: 'nanomuse_cloud',
  code: 'allowance_exhausted',
  left: 0,
  grant: 10,
  region: 'cn',
  ways: [],
  guidance: GUIDANCE,
  invite_url: 'https://relay.example/i/ABCDEF',
  invite_bonus_cny: 5,
  invitee_bonus_cny: 5,
  own_key_docs: 'https://docs.example/own-key',
  openrouter_url: 'https://openrouter.example/keys',
}

test('429 allowance_exhausted: the kind, the figures and the guidance as the relay sent it', () => {
  const r = parseRelayFailure(relayLine(429, EXHAUSTED), 'RATE_LIMIT')
  assert.ok(r)
  assert.equal(r.kind, 'exhausted')
  assert.equal(r.status, 429)
  assert.equal(r.code, 'allowance_exhausted')
  assert.equal(r.left, 0)
  assert.equal(r.grant, 10)
  assert.equal(r.inviteUrl, 'https://relay.example/i/ABCDEF')
  assert.equal(r.inviteBonusCny, 5)
  assert.equal(r.ownKeyDocs, 'https://docs.example/own-key')
  assert.deepEqual(r.guidance, GUIDANCE)
  assert.equal(r.message, EXHAUSTED.message)
})

test('the OpenAI envelope `{error: {...}}` and a trailing provider dump are read the same', () => {
  const wrapped = `429: ${JSON.stringify({ error: EXHAUSTED })}`
  assert.equal(parseRelayFailure(wrapped)?.kind, 'exhausted')
  const dumped = `${relayLine(429, EXHAUSTED)}\n{"raw":"provider metadata"}`
  assert.equal(parseRelayFailure(dumped)?.grant, 10)
  // a prefixed line, as `formatProviderError` prints it
  assert.equal(parseRelayFailure(`nanoMuse Cloud (429): ${JSON.stringify(EXHAUSTED)}`)?.kind, 'exhausted')
})

test('402 out_of_tokens (older relay) is the same card', () => {
  const r = parseRelayFailure(relayLine(402, { message: 'Out of tokens.', type: 'nanomuse_cloud', code: 'out_of_tokens' }), 'QUOTA')
  assert.equal(r?.kind, 'exhausted')
  assert.equal(r?.status, 402)
})

test('413: the relay’s too_large JSON and the proxy’s plain text both say "too large"', () => {
  const json = parseRelayFailure(relayLine(413, { message: 'Request body is 12.4 MB; this relay accepts up to 8 MB.', type: 'nanomuse_cloud', code: 'too_large' }), 'INVALID_REQUEST')
  assert.equal(json?.kind, 'too_large')
  assert.equal(json?.code, 'too_large')
  assert.match(json?.message ?? '', /12\.4 MB/)
  const plain = parseRelayFailure('413 Request too large', 'INVALID_REQUEST')
  assert.equal(plain?.kind, 'too_large')
  assert.equal(plain?.status, 413)
  assert.equal(plain?.code, 'http_413')
  assert.equal(plain?.message, 'Request too large')
  // the upstream's own words about the window, relayed as a 400
  assert.equal(classifyRefusal(400, 'upstream', "This model's maximum context length is 128000 tokens."), 'too_large')
})

test('401 bad_key: signed out; 403: disabled; 404 model_not_offered: model', () => {
  assert.equal(parseRelayFailure(relayLine(401, { message: 'Unknown or revoked key.', type: 'nanomuse_cloud', code: 'bad_key' }), 'AUTH')?.kind, 'signed_out')
  assert.equal(parseRelayFailure('401 Unauthorized', 'AUTH')?.kind, 'signed_out')
  assert.equal(parseRelayFailure(relayLine(403, { message: 'This account has been disabled.', code: 'account_disabled' }), 'AUTH')?.kind, 'disabled')
  assert.equal(parseRelayFailure(relayLine(404, { message: 'Model not offered.', code: 'model_not_offered' }))?.kind, 'model')
})

test('429 without the allowance code is "busy", with retry_after in milliseconds; daily_cap keeps its own card', () => {
  const r = parseRelayFailure(relayLine(429, { message: 'Too many requests in flight.', code: 'too_many_in_flight', retry_after: 2.5 }), 'RATE_LIMIT')
  assert.equal(r?.kind, 'busy')
  assert.equal(r?.retryAfterMs, 2500)
  assert.equal(parseRelayFailure(relayLine(429, { message: 'Rate limited.', code: 'rate_limited' }))?.kind, 'busy')
  assert.equal(parseRelayFailure(relayLine(429, { message: "Today's allowance is used up.", code: 'daily_cap' }))?.kind, 'daily_cap')
})

test('5xx: the relay (or its upstream) did not answer; a connection failure or timeout: unreachable', () => {
  assert.equal(parseRelayFailure(relayLine(502, { message: 'The model provider did not answer.', code: 'upstream' }), 'SERVER')?.kind, 'relay_down')
  assert.equal(parseRelayFailure('503 Service Unavailable', 'SERVER')?.kind, 'relay_down')
  assert.equal(parseRelayFailure('500 status code (no body)', 'SERVER')?.message, '')
  const timeout = parseRelayFailure('No chunk received for 60 s (idle timeout).', 'TIMEOUT')
  assert.equal(timeout?.kind, 'unreachable')
  assert.equal(timeout?.status, 0)
  assert.equal(parseRelayFailure('Connection error.', 'TRANSPORT')?.kind, 'unreachable')
  assert.equal(parseRelayFailure('fetch failed')?.kind, 'unreachable')
})

test('not a refusal: a model that answered and then said nothing, a code the harness handles itself', () => {
  assert.equal(parseRelayFailure('The model returned an empty response.', 'EMPTY_RESPONSE'), null)
  assert.equal(parseRelayFailure(''), null)
  assert.equal(relayFailure({ message: '413 Request too large', code: 'CONTEXT_WINDOW_EXCEEDED' }), null, 'compaction runs on CONTEXT_WINDOW_EXCEEDED first')
  assert.equal(relayFailure({ message: 'offload', code: 'IMAGE_OFFLOAD_REQUIRED' }), null)
})

test('the rewritten failure: our code (never retried), our sentence, the relay’s status and retry-after', () => {
  const out = relayFailure({ message: relayLine(429, EXHAUSTED), code: 'RATE_LIMIT', status: 429 })
  assert.ok(out)
  assert.equal(out.failure.code, 'nanomuse/exhausted')
  assert.equal(out.failure.status, 429)
  assert.doesNotMatch(out.failure.message, /[{}"]/, 'no JSON in the sentence')
  assert.match(out.failure.message, /allowance is used up/)
  assert.equal(out.refusal.kind, 'exhausted')
  // the harness retries EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT and TRANSPORT; ours is none of them
  for (const kind of ['exhausted', 'too_large', 'signed_out', 'busy', 'relay_down', 'unreachable']) {
    assert.ok(refusalCode(kind).startsWith(REFUSAL_PREFIX))
    assert.ok(!['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'].includes(refusalCode(kind)))
  }
  const busy = relayFailure({ message: relayLine(429, { message: 'Busy.', code: 'provider_busy', retry_after: 3 }), code: 'RATE_LIMIT' })
  assert.equal(busy?.failure.providerRetryAfterMs, 3000)
  const down = relayFailure({ message: 'Connection error.', code: 'TRANSPORT' })
  assert.equal(down?.failure.code, 'nanomuse/unreachable')
  assert.equal(down?.failure.status, undefined)
})

test('the code round-trips to the kind for the client; anything else is not ours', () => {
  assert.equal(refusalKindOf('nanomuse/too_large'), 'too_large')
  assert.equal(refusalKindOf('nanomuse/nope'), undefined)
  assert.equal(refusalKindOf('RATE_LIMIT'), undefined)
  assert.equal(refusalKindOf(undefined), undefined)
})

test('each kind has one plain sentence — no status, no JSON — and the relay’s own words where they add', () => {
  for (const kind of ['exhausted', 'too_large', 'signed_out', 'disabled', 'daily_cap', 'busy', 'model', 'relay_down', 'unreachable', 'other']) {
    const text = refusalSentence({ kind, status: 429, code: 'x', message: '' })
    assert.ok(text.length > 10, kind)
    assert.doesNotMatch(text, /\b(?:401|413|429|5\d\d)\b|[{}]/, kind)
  }
  assert.equal(refusalSentence({ kind: 'disabled', status: 403, code: 'account_disabled', message: 'This account has been disabled.' }), 'This account has been disabled.')
  assert.equal(refusalSentence({ kind: 'other', status: 418, code: 'teapot', message: 'Short and stout.' }), 'Short and stout.')
})

test('the card plan: the ways on for the allowance, a new chat for too large, sign in for a retired key', () => {
  assert.deepEqual(refusalCard('exhausted').actions, ['ways', 'retry'])
  assert.deepEqual(refusalCard('too_large').actions, ['new-chat'])
  assert.deepEqual(refusalCard('signed_out').actions, ['sign-in'])
  assert.deepEqual(refusalCard('relay_down').actions, ['retry'])
  assert.equal(refusalCard('daily_cap').showRelayText, true)
  assert.equal(refusalCard('exhausted').showRelayText, false)
})

test('another provider’s failure (an own key): the harness’s routing code picks the sentence', () => {
  assert.equal(providerFailureKind('AUTH', ''), 'auth')
  assert.equal(providerFailureKind('QUOTA', ''), 'quota')
  assert.equal(providerFailureKind('CONTEXT_WINDOW_EXCEEDED', ''), 'too_large')
  assert.equal(providerFailureKind('INVALID_REQUEST', '413 Payload Too Large'), 'too_large')
  assert.equal(providerFailureKind('RATE_LIMIT', ''), 'busy')
  assert.equal(providerFailureKind('SERVER', ''), 'server')
  assert.equal(providerFailureKind('TIMEOUT', ''), 'unreachable')
  assert.equal(providerFailureKind('PI_AI_ERROR', 'something else'), 'other')
})
