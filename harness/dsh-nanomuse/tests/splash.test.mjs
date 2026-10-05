// The desktop's splash (C6): the wordmark and a quiet loader, no picture of any character;
// a face only when the shell hands over the person's own as a data URL; the error state
// keeps the layout. Read as text — the page is opened in no browser here.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const resources = join(here, '..', '..', 'desktop', 'resources')
const html = readFileSync(join(resources, 'loading.html'), 'utf8')

test('the splash shows the wordmark and a loader, and no dragon', () => {
  assert.match(html, /<h1>nanoMuse<\/h1>/)
  assert.match(html, /class="loader"/)
  assert.doesNotMatch(html, /dragon/i)
  // nothing but the shell's data URL ever lands in the face slot
  assert.match(html, /params\.get\("face"\)/)
  assert.match(html, /\^data:image\\\/\(webp\|png\|jpeg\);base64,/)
  assert.match(html, /img-src 'self' data:/)
})

test('the error state keeps the layout: the same card, the message under it', () => {
  assert.match(html, /window\.__failed = function/)
  assert.match(html, /\.failed \.error \{ display: block; \}/)
  assert.match(html, /没能启动/)
  assert.match(html, /Could not start/)
})

test('the dragon pictures are gone from the desktop resources', () => {
  assert.ok(existsSync(resources))
  assert.deepEqual(readdirSync(resources).filter((name) => /^dragon-/.test(name)), [])
})
