// The two dictionaries, side by side: every `{hole}` an English string has, its Chinese twin
// has too (the client fills them by name); a Chinese entry reads the same as the English one
// only when it is a name (nanoMuse, Harness, a URL); quotation marks in Chinese are 「」, not
// the English pair. Each of these was a slip once ('kwai is working…', 'online', “始终允许”).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = fileURLToPath(new URL('.', import.meta.url))
let dir
let en
let zh

/** Entries whose Chinese is, on purpose, the English: names, a URL, a field label the vendors use. */
const SAME_ON_PURPOSE = new Set([
  'nav',
  'brand',
  'railLabel',
  'navHarness',
  'handsAct',
  'cnCustomUrl',
  'fsMacTitle',
  'style_muse',
  'abVersionBundle',
  'mdVideoCloud',
  'ownKeyKeyField',
  'ownKeyChatGptRow',
  'ownKeyModelFrom',
  'nwProxyPlaceholder',
])

const holes = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nm-locales-'))
  await build({
    entryPoints: [join(here, '..', 'src', 'client', 'locales.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: join(dir, 'locales.mjs'),
    logLevel: 'silent',
  })
  ;({ en, zh } = await import(pathToFileURL(join(dir, 'locales.mjs')).href))
})

after(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('en and zh have the same keys', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
})

test('every {hole} of an English string is in its Chinese twin', () => {
  const off = Object.keys(en).filter((k) => holes(en[k]) !== holes(zh[k]))
  assert.deepEqual(off, [])
})

test('a Chinese entry equals the English only when it is a name', () => {
  const same = Object.keys(en).filter((k) => en[k] === zh[k] && !SAME_ON_PURPOSE.has(k))
  assert.deepEqual(same, [], 'English left in the Chinese dictionary')
  const gone = [...SAME_ON_PURPOSE].filter((k) => en[k] !== zh[k])
  assert.deepEqual(gone, [], 'drop these from SAME_ON_PURPOSE')
})

test('Chinese quotes are 「」', () => {
  const off = Object.keys(zh).filter((k) => /["“”]/.test(zh[k]))
  assert.deepEqual(off, [])
})

test('no string names this computer', () => {
  // the presence line once read 'kwai is working…' — a developer's host name baked into both dictionaries
  for (const [k, v] of Object.entries(en)) assert.ok(!/\bkwai\b/i.test(v), `${k}: ${v}`)
  for (const [k, v] of Object.entries(zh)) assert.ok(!/\bkwai\b/i.test(v), `${k}: ${v}`)
})
