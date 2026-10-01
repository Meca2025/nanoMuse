# nanoMuse on DeepSeek Harness

> Internal preview. This directory is the start of the next desktop: nanoMuse as a
> set of plugins on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
> (`dsh`), instead of our own Electron shell around the Python runtime. Nothing here is
> released, packaged or linked from the product; the current desktop app in
> [`desktop/`](../desktop/) is what people get. Why and where it goes:
> [docs/harness.md](../docs/harness.md).

`dsh-nanomuse/` is one **bundle** — a package dsh loads into a profile, carrying a patch
over the stock configuration and the plugins the patch names:

| Row                | Half    | What it does                                                                                                                              |
| ------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `nanomuse`         | host    | Serves the face's stills under `/nanomuse/assets/` — the dragon's, and the account's drawn face at `face/<id>/<mood>.webp`.                 |
| `nanomuse-cloud`   | host    | The account: sign-in by phone or e-mail code against the relay, the key in dsh's credential store, the account's chat models written into `dsh-llm-pi-ai` as the `nanoMuse Cloud` provider. The hub client: this computer on the account's device list, answering `info` and `notify` always, `shell`, `files`, `file.get`, `file.put`, `open`, `screen` (the runtime's shapes, in `actions.ts`) and `task` (the phone's `delegate`, run in a dsh session "From <device>" with its approvals relayed back, in `task.ts`) while the remote-control switch is on. The profile pulled from the relay (name, face), the Hands/Reach calls in flight, the calls other devices made here, all streamed to the browser over SSE. Loopback API under `/nanomuse/cloud/`. |
| `nanomuse-reach`   | host    | **Reach**: the tools `devices`, `device_screen`, `device_shell`, `device_files`, `device_open`, `device_notify`, `delegate` over the hub, approvals through dsh's card, *Stop* stopping the delegated job on the other device; a system-prompt context with the agent's name, its look and the devices online. |
| `nanomuse` (client)| browser | The face (dragon, emoji or the drawn one, in five moods) in the sidebar's brand seat and the hero, the name the person gave it, the first run (meet → sign in / own key / later), the *nanoMuse account* section in Settings with the device list and this computer's remote-control switch, the capsule at the top while Hands or Reach work (with Stop), toasts for notices from other devices and for what they did here. |
| `preset-nanomuse`  | patch   | An agent preset with nanoMuse's voice and the same tools as dsh's *Standard*, plus **Hands**: dsh's MCP client on `nanomuse mcp`, the runtime's `computer_screen`/`computer_act` over stdio, and the Reach plugin. New sessions start from it. |
| `system-prompt`, `agent-preset-registry`, `ui-brand-official` | patch | The persona for preset-free compositions, the default preset, and the stock brand mark stepping aside. |

Everything else — the agent loop, tools, skills, goals, plan mode, compaction,
sub-agents, MCP, the web UI — is dsh's, unchanged.

## Run it

Node 22.19+ (24 is what we use) and pnpm. dsh is installed separately; the bundle is
linked into a profile of it, so you can hack on the bundle and restart.

```sh
# 1. a scratch dsh and a scratch home (nothing touches ~/.dsh)
mkdir -p /tmp/nm-dev/dsh && cd /tmp/nm-dev/dsh && npm init -y >/dev/null && npm install @deepseek-ai/dsh@0.2.0-rc.2
export DSH_HOME=/tmp/nm-dev/dsh-home

# 2. build the bundle
cd /path/to/nanoMuse/harness/dsh-nanomuse
pnpm install && pnpm build && pnpm test

# 3. a profile from dsh's web template, with the bundle linked in
/tmp/nm-dev/dsh/node_modules/.bin/dsh --profile nanomuse --from-default-profile web --dump-config >/dev/null
/tmp/nm-dev/dsh/node_modules/.bin/dsh plugin --profile nanomuse add "$PWD"

# 4. boot — against the production relay, or a local one (docs/every-device.md, "Debugging it all on one machine");
#    NANOMUSE_PY points at the runtime that serves the hands when `nanomuse` is not on PATH
NANOMUSE_CLOUD_URL=http://127.0.0.1:8790 NANOMUSE_PY=/path/to/nanoMuse/.venv/bin/nanomuse \
  /tmp/nm-dev/dsh/node_modules/.bin/dsh nanomuse --no-open --port 3082
```

Open the printed `?token=` URL. The first run meets the agent and signs in (a local
relay started with `CODE_SENDER=log` prints the code in its log); Settings → *nanoMuse
account* does the same later. The account's models then appear in the model picker
under *nanoMuse Cloud* and a new session answers through the relay, as nanoMuse. "What
is on my screen?" makes it call `mcp__nanomuse__computer_screen` — the runtime's hands,
started by dsh as a child process (`nanomuse mcp`; a display is needed for a picture) —
with the capsule at the top while it works. `dsh --profile nanomuse --dump-config` shows
the composed configuration with our rows marked `patched by dsh-nanomuse`.

For Reach, put a second device on the same account: a dev runtime from the recipe in
[docs/every-device.md](../docs/every-device.md) ("Debugging it all on one machine"),
signed in with the same identifier, is enough — it appears under *Devices* in the
settings section and in the agent's context, and "list the home folder on Laptop B",
"run `uname -a` on Laptop B" (approval card first) and "ask Laptop B's Muse what time it
is" (`delegate`; its approval requests come back here) exercise the tools. Renaming the
agent or picking an emoji on that runtime changes the desktop's brand mark within
seconds. The other way round, "run `uname -a` on <this computer's name>" in that
runtime's chat runs here (after its own Sentinel approval) and shows as a toast;
"ask kwai's Muse to …" there (`delegate`) runs as a session named *From Laptop B* here,
with any approval it needs shown on Laptop B; the *Remote control* switch under *this
computer* in the settings section turns all of that off — other devices then only see
this computer and can notify it.

After changing `src/`, `pnpm build` and restart dsh (the client half is served from
`lib/client.js`; append `?v=N` to the page URL if the browser keeps the old one).
Changes to `cordis.patch.yml` or `presets/` also need a restart — bundle layers are
read at boot.

## Layout

```
dsh-nanomuse/
  package.json          the bundle: dsh.bundle.patch, dsh.client (platform web, injected client packages)
  cordis.patch.yml      our layer over dsh-base + dsh-web-app
  presets/nanomuse.patch.yml   the agent preset (Standard's tools, nanoMuse's voice)
  src/index.ts          host root row: the stills routes (the dragon's, the account's face)
  src/cloud.ts          host service `nanomuseCloud`: state, credential, provider row, hub + profile owner,
                        the Hands/Reach call tracker (tools/execute hook), SSE, loopback API
  src/hub.ts            the hub as a client: hello/welcome/devices, calls out and in, reconnect (no Cordis)
  src/actions.ts        this computer's hands for the other devices: shell, files, file.get/put, open, screen
                        (the runtime's shapes, limits and error codes)
  src/task.ts           a task from another device run in a dsh session: the session per conversation, the run
                        streamed back as the runtime's event frames, approvals relayed to the asker, stop
  src/profile.ts        the account profile on disk: pull when newer, face stills cached per face id
  src/reach.ts          plugin `nanomuse-reach`: the device_* tools, delegate, the system-prompt context
  src/relay.ts          the relay as a client (plain fetch; tested against a fake relay)
  src/client/
    index.ts            slot registrations: brand mark/name with moods, hero mark, onboarding step,
                        settings section, overlay capsule
    live.ts             the SSE store (profile, hub, calls, notices) behind useLive()
    Avatar.tsx          the face in five moods: dragon stills, emoji on a colour, drawn face from the host
    Onboarding.tsx      the first run: meet → sign in / own key / later → ready
    SignIn.tsx          the two-step form (identifier → code), shared by onboarding and settings
    CloudSection.tsx    Settings → nanoMuse account: account, look, devices (rename, forget, this computer's remote-control switch), relay
    Capsule.tsx         the pill while Hands/Reach work (face, bars, step, label, Stop) and the toasts
    api.ts, locales.ts  the fetch helper and the en/zh copy
  assets/               dragon-{idle,working,waiting,happy,error}.webp
  build.mjs             esbuild: host ESM (split, so HubError is one class) + client lazy-CJS factory + .d.ts
  tests/                node:test — the relay client against a fake relay, the hub client against a fake socket, the actions on a temp dir and fake platforms, the task runner against a fake session controller
```

Secrets never pass through here: the account key lives in dsh's `.credentials.yaml`
(as `NANOMUSE_CLOUD_TOKEN`), the state file `$DSH_HOME/nanomuse/cloud.json` holds the
account's masked hint, model list and this computer's device id only, `profile.json`
the name and look, all mode 0600. The hub key travels in the `hello` frame, as the
browser's does.

## Licence and names

The bundle is GPL-3.0-or-later like the rest of nanoMuse. DeepSeek Harness is MIT and is
not vendored — it is a dependency, installed by the person. "DeepSeek Harness" and
"DSH" are DeepSeek's names: we say *built on DeepSeek Harness*, never use them in ours,
and the shipped About text stays as it is. DeepSeek Harness is a developer preview
(0.2.0-rc); its plugin API will break, and this bundle pins the version it was written
against.
