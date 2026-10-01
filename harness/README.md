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
| `nanomuse`         | host    | Serves the face's stills under `/nanomuse/assets/`.                                                                                        |
| `nanomuse-cloud`   | host    | The account: sign-in by phone or e-mail code against the relay, the key in dsh's credential store, the account's chat models written into `dsh-llm-pi-ai` as the `nanoMuse Cloud` provider. Loopback API under `/nanomuse/cloud/`. |
| `nanomuse` (client)| browser | The dragon in the sidebar's brand seat and the hero, the *nanoMuse* wordmark, the *nanoMuse account* section in Settings.                  |
| `preset-nanomuse`  | patch   | An agent preset with nanoMuse's voice and the same tools as dsh's *Standard*, plus **Hands**: dsh's MCP client on `nanomuse mcp`, the runtime's `computer_screen`/`computer_act` over stdio. New sessions start from it. |
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

Open the printed `?token=` URL. Settings → *nanoMuse account* signs in; the account's
models then appear in the model picker under *nanoMuse Cloud* and a new session
answers through the relay, as nanoMuse. "What is on my screen?" makes it call
`mcp__nanomuse__computer_screen` — the runtime's hands, started by dsh as a child
process (`nanomuse mcp`; a display is needed for a picture). `dsh --profile nanomuse
--dump-config` shows the composed configuration with our rows marked `patched by
dsh-nanomuse`.

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
  src/index.ts          host root row: the stills route
  src/cloud.ts          host service `nanomuseCloud`: state, credential, provider row, loopback API
  src/relay.ts          the relay as a client (plain fetch; tested against a fake relay)
  src/client/           browser half: slots (brand mark/name, hero mark, settings section), locales (en, zh)
  assets/               dragon-{idle,happy,waiting,error}.webp
  build.mjs             esbuild: host ESM + client lazy-CJS factory + .d.ts
  tests/                node:test
```

Secrets never pass through here: the account key lives in dsh's `.credentials.yaml`
(as `NANOMUSE_CLOUD_TOKEN`), the state file `$DSH_HOME/nanomuse/cloud.json` holds the
account's masked hint and model list only, both mode 0600.

## Licence and names

The bundle is GPL-3.0-or-later like the rest of nanoMuse. DeepSeek Harness is MIT and is
not vendored — it is a dependency, installed by the person. "DeepSeek Harness" and
"DSH" are DeepSeek's names: we say *built on DeepSeek Harness*, never use them in ours,
and the shipped About text stays as it is. DeepSeek Harness is a developer preview
(0.2.0-rc); its plugin API will break, and this bundle pins the version it was written
against.
