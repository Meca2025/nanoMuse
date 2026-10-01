# nanoMuse on DeepSeek Harness

> **Status: internal preview, not released.** The code is in [`harness/`](../harness/)
> on a private branch; nothing links to it from the product, the downloads or the site.
> The desktop app people install is still [`desktop/`](desktop.md). This page is the
> design and the plan.

## The decision

The desktop app today is our own harness: an Electron shell around the Python runtime,
which carries its own agent loop, tool registry, skills, schedule, memory, sub-agents and
web UI — the same code as the phone and the browser demo, which is why it exists. Every
one of those parts has a counterpart in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(`dsh`): an open-source (MIT) agent harness built as a plugin system on
[Cordis](https://github.com/cordiverse/cordis), with a web app, a desktop app, an MCP
client, skills, goals, plan mode, compaction, delegation, approval policies, computer use
and a model layer that takes any OpenAI-compatible endpoint from configuration. It is at
0.2.0-rc, a developer preview whose plugin API will break, and it has the community a
project of ours will not have for years.

So the next desktop is **dsh plus nanoMuse plugins**: what makes nanoMuse nanoMuse — the
account, the face, the voice, Hands, Reach, the Sentinel — goes in as plugins; the loop,
the tools and the UI are dsh's. We stop maintaining a second harness for the desktop.
The phone keeps the Python runtime (dsh is Node and does not run on Android), the browser
demo keeps it too for now, and the account is the bridge between them, as it is today.

## What runs

The first slice is a dsh **bundle**, `dsh-nanomuse` ([`harness/dsh-nanomuse/`](../harness/dsh-nanomuse/)),
linked into a profile created from dsh's own web template:

- **Account.** A host service `nanomuseCloud` signs in against the relay with the same
  two calls the phone and the desktop use (`/v1/auth/code`, `/v1/auth/verify`), keeps the
  key in dsh's credential store as `NANOMUSE_CLOUD_TOKEN`, and writes the account's chat
  models into dsh's model adapter (`dsh-llm-pi-ai`) as a provider called *nanoMuse
  Cloud* with the relay's `/v1` as its base URL. No model adapter of ours: the relay
  speaks OpenAI Chat Completions, dsh speaks it back. Sign-out removes both again. A
  loopback API (`/nanomuse/cloud/{status,code,verify,refresh,sign-out}`, same-origin
  only) serves the settings section.
- **Face and name.** The browser half fills dsh's slots: the dragon in the sidebar brand
  seat and the hero, the *nanoMuse* wordmark, and a *nanoMuse account* section in
  Settings (phone or e-mail → code → signed in, with the masked identifier, the
  allowance and the models). The stock brand plugin is disabled by the patch; the stills
  are served by the host half.
- **Voice.** dsh's web sessions compose from an *agent preset*, and a preset's persona
  wins over the global one, so the bundle declares a preset `nanomuse` — the same plugin
  list as dsh's *Standard* with nanoMuse's persona — and makes it the default. The
  person can still pick *Standard*, *PTC* or *Minimal*.

Verified end to end on a scratch install against a local relay: sign in, the two chat
models appear under *nanoMuse Cloud* in the picker without a restart, a new session
starts as *nanoMuse*, and "who are you?" is answered through the relay in nanoMuse's
voice. [`harness/README.md`](../harness/README.md) has the recipe.

## Where each part of nanoMuse goes

| nanoMuse today (Python runtime)                         | On dsh                                                                                                                                       | State      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Cloud account, provider provisioning ([cloud.md](cloud.md)) | `dsh-nanomuse/cloud` service + `llm-pi-ai` provider + credential store                                                                    | done       |
| Persona, agent name ([design.md](design.md))            | Agent preset `nanomuse` (`@deepseek-ai/dsh-persona`); the account's chosen name later from the profile                                        | done       |
| The face in the UI ([avatar.md](avatar.md))             | Slots `sidebar.brand.*`, `conversation.hero.brand.mark`; stills from the host                                                                 | done       |
| Avatar studio, face sync across devices                 | A settings page (slot `settings.section`) + host routes; the account's face pulled from the relay's profile, moods from agent events          | phase 2    |
| First run                                               | dsh's first-run dialog asks for a DeepSeek key; ours should offer the Cloud sign-in first (a client plugin replacing that step)               | phase 2    |
| Sentinel ([sentinel.md](sentinel.md))                   | dsh approval policies and the `tools/pre-execute` waterfall; our categories become an approval preset; the visible gate stays                | phase 2    |
| Hands — GUI control of this computer ([gui.md](gui.md)) | dsh's computer-use seam (`ctx.computerUse.register`, one provider) with a native driver, or an MCP bridge to the Python hands as the interim | phase 3    |
| Reach — the phone and other devices ([hub.md](hub.md), [every-device.md](every-device.md)) | A hub client service + `device_*` tools (`ctx.tools.register`) in TypeScript; the phone side unchanged                 | phase 3    |
| Skills, schedule, goals, memory, sub-agents             | dsh's own (`skill`, `schedule`, `goals`, compaction, delegation) — ours are not ported                                                       | by design  |
| Web UI, zh-CN                                           | dsh's web app (it ships zh); our strings in the bundle's locale table                                                                        | done       |
| The desktop shell                                       | dsh's desktop app for now (Electron, DeepSeek Harness branding in About); our own shell and installer are the last step                       | phase 4    |
| Browser demo at nanomuse.cn/web                         | Stays on the Python runtime                                                                                                                  | unchanged  |
| The phone                                               | Stays on the Python runtime; meets the desktop through the account and Reach                                                                 | unchanged  |

## What we learned building the slice

- A bundle patch replaces a row's whole `config`, so rows we touch restate every key they
  need; `insert:` adds rows. Bundle layers are read at boot (restart after editing them);
  the profile's own patch hot-reloads.
- The preset's plugin list is a copy of dsh's *Standard* for the pinned version, because
  presets are declared whole. When dsh moves, diff against
  `@deepseek-ai/dsh-web-app/presets/standard.patch.yml`. Our own capabilities go into
  that list as plugins — that is the point.
- The hero headline (*Into the Unknown*) is a locale string in dsh's `conversation`
  namespace; a second dictionary for the same namespace and locale throws, so it cannot
  be replaced from a plugin today. Ask upstream for a slot, or live with it.
- Two slot registrations at the same rank throw, which is how the stock brand mark was
  found; disabling its row (`ui-brand-official`) is cleaner than out-ranking it.
- The model picker lists provider models by id (`qwen3.8-flash`), as it does for
  DeepSeek's own; the display name is in the provider row for when dsh uses it.
- `dsh plugin add` needs pnpm on `PATH` and links the checkout, so `pnpm build` and a
  restart is the whole loop. Node 22.19+.

## Names and licences

DeepSeek Harness is MIT; it is a dependency, not vendored, and its notice travels with
it. Our bundle is GPL-3.0-or-later like the rest of nanoMuse, so the "no closed
component" promise holds. "DeepSeek Harness" and "DSH" are DeepSeek's names: we say
*built on DeepSeek Harness*, never use them in ours, and the shipped About text and
brand assets stay as they are. The usual notices — Muse is Meta's trademark, nanoMuse is
a community project with no affiliation — apply unchanged.

## Phases

1. **This slice** — account, face, voice; verified on a scratch install. *Done, internal.*
2. **Daily-driver on dsh** — first-run sign-in, avatar studio and face sync, the Sentinel
   as an approval preset, the account's name; the person can live in it for ordinary
   work on files and the web.
3. **The nanoMuse features** — Hands as a computer-use provider (native, or the Python
   hands over MCP first), Reach as a hub client with the `device_*` tools; this is what
   makes it nanoMuse rather than a re-skinned dsh.
4. **Ship** — our own shell and installers, the downloads, the docs; `desktop/` retired.

Until phase 4, `desktop/` is the desktop app and keeps getting its fixes.
