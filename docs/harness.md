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
- **Hands, the first of our capabilities as a plugin.** The preset mounts dsh's MCP
  client on `nanomuse mcp` ([cli.md](cli.md#audit-and-config)): the runtime's
  `computer_screen` and `computer_act` served over stdio, with their own descriptions
  and schemas, arriving in dsh as `mcp__nanomuse__computer_screen` and
  `…computer_act`. Screenshots travel as MCP images, so a vision model sees the screen.
  What the Sentinel does in the runtime the bridge does at the model's level: a step the
  runtime would ask the person about (Enter or a submit, a heavy shortcut, a click on a
  word from the sensitive list) is refused with the reason until the call carries
  `confirmed: true`, which the model may set only after the person agreed in the
  conversation; dsh's own approval policy can add a real gate in front of the tool.
  `NANOMUSE_PY` names the runtime's executable when it is not on `PATH`; without a
  runtime the preset simply has no hands.

Verified end to end on a scratch install against a local relay: sign in, the two chat
models appear under *nanoMuse Cloud* in the picker without a restart, a new session
starts as *nanoMuse*, "who are you?" is answered through the relay in nanoMuse's voice,
and "what is on my screen?" is answered after one `mcp__nanomuse__computer_screen` call
with a correct description of the desktop. [`harness/README.md`](../harness/README.md)
has the recipe.

The second slice adds what the Android app has around the chat, modelled on what
[every-device.md](every-device.md) lists for the phone:

- **The first run.** dsh's own first-run dialog asks for a DeepSeek key. The bundle
  registers its step in that seat (the shipped id `deepseek-official` in the
  `settings.onboarding` slot), so a fresh install meets the agent instead: the face, the
  one-line slogan, what Hands, Reach and the Muse style are, then *sign in with a phone
  number or e-mail (free)*, *use my own API key* (opens Models) or *later*. The step
  completes itself when a model can already answer — the account, a DeepSeek key, a
  provider the person added — unless it is reopened on purpose.
- **Name, face and moods from the account.** The host pulls the relay's profile
  (`/v1/me/profile`) when the hub says it changed and keeps it under
  `$DSH_HOME/nanomuse/`; a drawn face's five stills are cached once per face id and served
  at `/nanomuse/assets/face/<id>/<mood>.webp`. The sidebar brand mark and the hero wear
  it — the dragon stills, an emoji on its colour, or the drawn face — *working* while a
  session runs and *waiting* while one asks something; the brand name is the name the
  person gave it on any device. A system-prompt context tells the model that name, so
  "what is your name?" is answered with it. Renaming on the phone shows up on the
  desktop within the hub's round trip, no restart.
- **Reach.** A hub client (`hub.ts`, plain WebSocket, the key in the `hello` frame)
  puts this computer on the account's device list as `pc-dsh-<id>` and answers `info` and
  `notify` (a toast). A second plugin, `dsh-nanomuse/reach`, registers the tools the
  phone and the runtime have: `devices`, `device_screen` (the still admitted as an image
  when the model takes images), `device_shell` and `device_open` (dsh's approval card
  first, with the command or URL in it), `device_files`, `device_notify`, and `delegate` —
  the other device's own Muse runs the task, and when *it* asks for an approval the
  question comes back here as an approval card and the answer travels back over the hub.
  Settings → *nanoMuse account* lists the devices with online dots, renames this
  computer and forgets offline ones.
- **The capsule.** While Hands or Reach work, a pill at the top of the window shows the
  face, moving bars, *Hands · step N* or *Reach · step N*, what it is doing ("on Laptop
  B: uname -a", "asking Laptop B's Muse"), and *Stop*, which cancels the turn the way
  the composer's stop does; the in-flight call ends with *aborted: the call was
  stopped*. The host learns about the calls through dsh's `tools/execute` hook and
  streams them, with the profile, the hub state and the notices, to the client over one
  SSE connection (`/nanomuse/cloud/events`).

Verified on the same scratch install with a second runtime on the account as *Laptop B*:
the first run through to *Start*; `devices` and `device_files` on Laptop B; `device_shell`
with the approval card and the result; `delegate` with Laptop B's approval requests
relayed and answered (allow and reject) and *Stop* ending it; a `notify` from another
device shown as a toast; the name and emoji set on Laptop B worn by the desktop's brand
mark and hero within seconds, and "我叫小蓝" when asked.

## Where each part of nanoMuse goes

| nanoMuse today (Python runtime)                         | On dsh                                                                                                                                       | State      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Cloud account, provider provisioning ([cloud.md](cloud.md)) | `dsh-nanomuse/cloud` service + `llm-pi-ai` provider + credential store                                                                    | done       |
| Persona, agent name ([design.md](design.md))            | Agent preset `nanomuse` (`@deepseek-ai/dsh-persona`); the account's chosen name from the profile, in the brand seat and a system-prompt context | done       |
| The face in the UI ([avatar.md](avatar.md))             | Slots `sidebar.brand.*`, `conversation.hero.brand.mark`; stills from the host; moods from the session status; the capsule while the hands work | done       |
| Face sync across devices                                | `profile.ts` pulls the relay's profile on the hub's `profile` frame; drawn-face stills cached and served by the host                            | done       |
| Avatar studio (drawing a new face here)                 | A settings page over the relay's image model; today a face is drawn on the phone and worn here                                                | phase 3    |
| First run                                               | Our step in dsh's `settings.onboarding` seat: meet, sign in (free), own key, later                                                             | done       |
| Sentinel ([sentinel.md](sentinel.md))                   | dsh approval policies and the `tools/pre-execute` waterfall; our categories become an approval preset; the visible gate stays                | phase 3    |
| Hands — GUI control of this computer ([gui.md](gui.md)) | The Python hands over MCP (`nanomuse mcp`, mounted in the preset) — done; a native TypeScript driver behind dsh's computer-use seam (`ctx.computerUse.register`) later, so no Python is needed | done (bridge) |
| Reach — the phone and other devices ([hub.md](hub.md), [every-device.md](every-device.md)) | `hub.ts` + `dsh-nanomuse/reach`: `devices`, `device_screen/shell/files/open/notify`, `delegate` with relayed approvals; this computer answers `info` and `notify`; the phone side unchanged | done       |
| Being controlled from the phone (shell, files, screen, a task run here) | Handlers on the hub client for the remaining actions, behind dsh's approval; today the desktop only answers `info` and `notify`     | phase 3    |
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
- The `settings.onboarding` coordinator mounts one step at a time and only while the
  main view is a blank session; it hands the step a fresh `complete` closure on every
  render, so a step must decide once, on mount, or a re-render throws the person back to
  its first view while they are typing a code.
- `tools/execute` is an around-hook (`ctx.on('tools/execute', (exec, next) => …)`), which
  is enough to know when a Hands or Reach call starts and ends without touching the
  tools; the capsule and the step counter hang off it.
- Images a tool returns must go through the attachment store (`attachments.saveImages`)
  and only when `llm.resolveModelInfo(...).inputModalities` includes `image`; otherwise
  the tool says what it saw in words — the MCP client does the same.
- The hub has no cancel frame: stopping a `delegate` here ends the call, but the other
  device's Muse finishes (or times out at its own approval) on its own. A `cancel` call
  is the protocol change to make when the desktop also answers `task`.

## Names and licences

DeepSeek Harness is MIT; it is a dependency, not vendored, and its notice travels with
it. Our bundle is GPL-3.0-or-later like the rest of nanoMuse, so the "no closed
component" promise holds. "DeepSeek Harness" and "DSH" are DeepSeek's names: we say
*built on DeepSeek Harness*, never use them in ours, and the shipped About text and
brand assets stay as they are. The usual notices — Muse is Meta's trademark, nanoMuse is
a community project with no affiliation — apply unchanged.

## Phases

1. **This slice** — account, face, voice, and Hands over MCP; verified on a scratch
   install. *Done, internal.*
2. **The Muse style and Reach** — the first run, the account's name, face and moods,
   the capsule with Stop, the hub client, the `device_*` tools and `delegate` with
   relayed approvals, the device list in Settings. *Done, internal.*
3. **Daily-driver** — the desktop answers the phone (`shell`, `files`, `screen`, `task`
   behind dsh's approval), the Sentinel as an approval preset, the avatar studio here,
   Hands without Python (a native driver behind dsh's computer-use seam); the person can
   live in it for ordinary work on files and the web.
4. **Ship** — our own shell and installers, the downloads, the docs; `desktop/` retired.

Until phase 4, `desktop/` is the desktop app and keeps getting its fixes.
