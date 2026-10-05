// The stylesheet is one string; a few rules are load-bearing for the window chrome and are
// checked here as text, so that a later restyle cannot quietly bring the macOS bug back where
// the header face over the drag region stopped taking clicks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('../src/client/styles.ts', import.meta.url)), 'utf8')

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector) {
  const lines = css.split('\n')
  const prefix = `${selector} {`
  const line = lines.find((l) => l.startsWith(prefix))
  assert.ok(line, `no rule for ${selector}`)
  return line.slice(prefix.length)
}

test('the header block is centred without a transform and without pointer-events tricks', () => {
  const header = rule('.nm-header')
  assert.doesNotMatch(header, /transform\s*:/)
  assert.doesNotMatch(header, /pointer-events\s*:/)
  assert.match(header, /left:\s*0;/)
  assert.match(header, /right:\s*0;/)
  assert.match(header, /margin:\s*0 auto/)
  assert.match(header, /width:\s*fit-content/)
  // the old escape hatch is gone with the wrapper's pointer-events:none
  assert.doesNotMatch(css, /^\.nm-header > \* \{ pointer-events: auto; \}/m)
})

test('the face, the header block and the rail face are no-drag islands on macOS and Windows', () => {
  const noDrag = css.split('\n').filter((l) => l.includes('-webkit-app-region: no-drag') && l.includes("[data-nm-platform='darwin']") && l.includes("[data-nm-platform='win32']"))
  const covers = (sel) => noDrag.some((l) => l.includes(sel))
  assert.ok(covers('.nm-header'), '.nm-header')
  assert.ok(covers('.nm-header-face'), '.nm-header-face')
  assert.ok(covers('.nm-rail-face'), '.nm-rail-face')
  // the chat header stays a drag handle
  assert.match(css, /\[data-nm-platform='win32'\]\) \[data-window-drag\][^\n]*-webkit-app-region: drag/)
})

test('the desk-a additions sit at the end of the sheet, under their marker', () => {
  const marker = css.indexOf('/* desk-a */')
  assert.ok(marker > 0)
  assert.ok(css.indexOf('.nm-rail-face, button:has(> .nm-rail-face)') > marker)
})
