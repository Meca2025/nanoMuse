#!/usr/bin/env node
// Copies the own-key provider catalogue (nanomuse/llm/providers.json, the source of truth;
// contract C11) to the clients that cannot read the runtime's package data — the desktop
// plugin's assets, the Android app's assets, the iPhone app's bundle — and to the relay,
// which orders it per region for its "ways on" guidance. Run after editing the catalogue:
//
//   node scripts/providers-json.mjs          # write
//   node scripts/providers-json.mjs --check  # exit 1 when a copy is stale (CI)
//
// The file is `{version, updated, capabilities[], auth_kinds[], providers[]}`; each provider
// has `id`, `name`, `name_zh`, `protocol` (openai | openai-responses | anthropic | gemini),
// `base_url` (+ optional `base_url_global`), `key_url` (+ optional `key_url_global`,
// `key_hint`), `auth[]` (key | none | oauth-chatgpt | oauth-claude | oauth-openrouter |
// device-kimi), optional `auth_capabilities{auth: capabilities[]}` when a sign-in gives less
// than the key does, `regions[]` (cn | global), `capabilities[]` (chat | vision | image |
// video), `defaults{chat, hands, image, video}`, `note`/`note_zh`, `verified` (the month the
// facts were checked against the vendor's docs) and, for `custom`, `user_capabilities: true`.
// The copies are byte-identical to the source; the source is validated here so a typo never
// reaches a client.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'nanomuse/llm/providers.json')
const targets = [
  resolve(root, 'harness/dsh-nanomuse/assets/providers.json'),
  resolve(root, 'android/src/android/app/src/main/assets/nanomuse/providers.json'),
  resolve(root, 'android/src/ios/NanoMuse/Resources/providers.json'),
  // the relay builds the "ways on" guidance from the same facts (cloud/nanomuse_cloud/providers.py)
  resolve(root, 'cloud/nanomuse_cloud/providers.json'),
]

const PROTOCOLS = new Set(['openai', 'openai-responses', 'anthropic', 'gemini'])
const REGIONS = new Set(['cn', 'global'])

const text = readFileSync(source, 'utf8')
const catalogue = JSON.parse(text)
const capabilities = new Set(catalogue.capabilities)
const authKinds = new Set(catalogue.auth_kinds)
const problems = []
const ids = new Set()
for (const p of catalogue.providers) {
  const where = `providers[${p.id ?? '?'}]`
  if (!/^[a-z][a-z0-9-]*$/.test(p.id ?? '')) problems.push(`${where}: bad id`)
  if (ids.has(p.id)) problems.push(`${where}: duplicate id`)
  ids.add(p.id)
  for (const k of ['name', 'name_zh', 'note', 'note_zh', 'verified']) {
    if (typeof p[k] !== 'string') problems.push(`${where}: ${k} must be a string`)
  }
  if (!/^\d{4}-\d{2}$/.test(p.verified ?? '')) problems.push(`${where}: verified must be YYYY-MM`)
  if (!PROTOCOLS.has(p.protocol)) problems.push(`${where}: unknown protocol ${p.protocol}`)
  if (typeof p.base_url !== 'string') problems.push(`${where}: base_url must be a string`)
  if (p.base_url && !/^https?:\/\//.test(p.base_url)) problems.push(`${where}: base_url must be a URL`)
  if (typeof p.key_url !== 'string') problems.push(`${where}: key_url must be a string`)
  if (!Array.isArray(p.auth) || !p.auth.length) problems.push(`${where}: auth must be a non-empty list`)
  for (const a of p.auth ?? []) if (!authKinds.has(a)) problems.push(`${where}: unknown auth ${a}`)
  for (const a of Object.keys(p.auth_capabilities ?? {})) {
    if (!(p.auth ?? []).includes(a)) problems.push(`${where}: auth_capabilities.${a} is not in auth`)
    for (const c of p.auth_capabilities[a]) if (!capabilities.has(c)) problems.push(`${where}: unknown capability ${c}`)
  }
  if (!Array.isArray(p.regions) || !p.regions.length) problems.push(`${where}: regions must be a non-empty list`)
  for (const r of p.regions ?? []) if (!REGIONS.has(r)) problems.push(`${where}: unknown region ${r}`)
  if (!Array.isArray(p.capabilities) || !p.capabilities.includes('chat')) problems.push(`${where}: capabilities must include chat`)
  for (const c of p.capabilities ?? []) if (!capabilities.has(c)) problems.push(`${where}: unknown capability ${c}`)
  for (const [lane, model] of Object.entries(p.defaults ?? {})) {
    const need = lane === 'hands' ? 'vision' : lane
    if (!capabilities.has(need)) problems.push(`${where}: defaults.${lane} is not a lane`)
    else if (!(p.capabilities ?? []).includes(need)) problems.push(`${where}: defaults.${lane} without the ${need} capability`)
    if (typeof model !== 'string' || !model) problems.push(`${where}: defaults.${lane} must be a model id`)
  }
  for (const c of p.capabilities ?? []) {
    if (c === 'vision' || p.id === 'custom' || p.auth.includes('none')) continue
    if (!(p.defaults ?? {})[c]) problems.push(`${where}: a ${c} capability needs defaults.${c}`)
  }
}
if (problems.length) {
  for (const line of problems) console.error(line)
  process.exit(2)
}

let stale = false
for (const target of targets) {
  if (process.argv.includes('--check')) {
    let current = ''
    try { current = readFileSync(target, 'utf8') } catch { /* missing counts as stale */ }
    if (current !== text) { stale = true; console.error(`stale: ${target}`) }
  } else {
    writeFileSync(target, text)
    console.log(`${target}: ${catalogue.providers.length} providers`)
  }
}
if (stale) process.exit(1)
