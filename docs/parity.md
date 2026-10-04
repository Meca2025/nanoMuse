# Feature parity across the clients

nanoMuse is one agent on every device: the phone (Android, iOS), the computer (nanoMuse Desktop —
the `dsh-nanomuse` harness bundle in the Electron shell) and the browser (nanoMuse Web, served by
the runtime). The rule since 0.1.32 is the **union**: whatever one client can do, every client
does, unless the platform itself forbids it (the computer does not build a mini-Linux the way the
phone does; iOS does not let an app drive another). This page is the ledger — what each client
has, what is platform-specific by design, and what is still open for a decision.

Legend: **✓** done · **◐** partial (what is missing is in the note) · **—** not on this client ·
**n/a** platform-specific, not meant to be.

## Account (nanoMuse Cloud)

| Feature | Android | iOS | Desktop | Web |
|---|---|---|---|---|
| Sign in with a code (phone / e-mail) | ✓ | ✓ | ✓ | ✓ |
| Sign in with a password | ✓ | ✓ 0.1.32 | ✓ | ✓ |
| Invite code at sign-in | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| Amounts from the relay (`/v1/config`) before sign-in | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| Allowance in yuan, 80 % heads-up | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| "Ways on" when the pool is spent (own key · invite · star) | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| Invite code and link, earnings | ✓ | ✓ 0.1.32 | ✓ | ✓ |
| Usage by kind and by model, today / all time | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| Set / change / remove the password | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| Signed-in devices, revoke one, sign out everywhere | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| Account timeline (sign-ins, settings, refusals) | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| Delete account | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| Data controls (what the relay keeps of the chats) | ✓ | — *(1)* | ✓ | ✓ |
| Own-key presets (DeepSeek, Bailian, …) | ✓ | n/a — upstream's provider list | ◐ Models page | ✓ |

## The agent in the chat

| Feature | Android | iOS | Desktop | Web |
|---|---|---|---|---|
| Status line says what it is on, never "Thinking" | ✓ | ✓ 0.1.32 *"is on it"* | ✓ | ✓ |
| "Show the agent's steps", off by default | ✓ | ✓ 0.1.32 *(2)* | ✓ | ✓ 0.1.32 |
| Star asked at sign-in | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| Star asked after the first finished task | ✓ | — *(3)* | ✓ 0.1.32 | ✓ |
| Star asked when the allowance is spent | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| First run: "Sign in — free" before anything else | ✓ | ✓ 0.1.32 *(4)* | ✓ | ✓ |
| Approval cards, three tiers, remembered grants | ✓ | upstream's | ✓ | ✓ |

## Connectors, agents, devices

| Feature | Android | iOS | Desktop | Web |
|---|---|---|---|---|
| Connectors catalogue (69 remote MCP servers, sign in) | ✓ 0.1.32 *(5)* | — *(6)* | ✓ | — *(7)* |
| MCP servers by hand (URL / command) | ✓ upstream | ✓ upstream | ✓ (harness) | ✓ |
| Skills | ✓ upstream | ✓ upstream | — *(8)* | ✓ |
| Coding agents (Cursor, Codex, Claude Code on the computers) | ✓ | — *(9)* | — *(8)* | ✓ |
| Devices of the account, remote control, rename, forget | ✓ | ◐ list only | ✓ | ✓ |
| Hands — the device's own screen as a hand | ✓ | n/a *(10)* | ✓ (the computer's screen) | n/a |
| Mini-Linux sandbox on the device | ✓ | ✓ upstream (iSH) | n/a — the runtime's own sandbox | n/a |

## Face, rooms, look

| Feature | Android | iOS | Desktop | Web |
|---|---|---|---|---|
| Avatar studio: generate, pick, pose; the face shared across devices | ✓ | — *(11)* | ✓ | ✓ |
| Emoji faces | ◐ falls back to the dragon *(12)* | — | ✓ | ✓ |
| Theme colour swatches | — *(13)* | — | ✓ | — accent follows the avatar *(13)* |
| Rooms: Feed · Ideas · Goals · Library | ✓ | — *(11)* | ✓ | ✓ |
| Memory as a room | — settings page *(14)* | — | ✓ | ✓ |
| Live stage / browser viewer while the hands work | ✓ stage | — | ✓ live stage | ✓ browser viewer |
| Quick chat (global shortcut) | n/a | n/a | ✓ | n/a |
| Widgets | ✓ upstream | ✓ upstream | n/a | n/a |

## Open for a decision (the "next-next" list)

These are the gaps left open on purpose in 0.1.32 — either the platform makes them a different
design, or they are large enough that the call is the maintainer's. Numbers match the notes above.

1. **iOS · Data controls.** The relay's switch (`contribute`) and the sample count. Small; left
   out only to keep the 0.1.32 iOS change reviewable. *Recommendation: add.*
2. **iOS · Steps.** With no status line under a face on iOS, the steps of the message still running
   stay visible even with the setting off; only finished messages hide them. Keep, or port the
   header line (and the face) first?
3. **iOS · Star after the first task.** Needs a hook at the end of the first assistant turn in
   upstream's chat view. *Recommendation: with the Muse shell port (11).*
4. **iOS · First run.** A "Sign in to nanoMuse Cloud — free" entry on upstream's start screen, not
   the phone's four-page first run. The four pages come with (11).
5. **Android · OAuth connectors need a device test.** Discovery, dynamic client registration, PKCE
   and the token written into the entry's `Authorization` header compile and follow the desktop's
   flow line by line, but no connector was signed into on a device before 0.1.32 (no emulator on
   the build machine). Key and open connectors are plain MCP entries and need nothing new. The
   token ends up in `servers.json` next to API keys, as the in-guest client reads it; refresh runs
   at app start and when the page opens, not in the background.
6. **iOS · Connectors.** Upstream's MCP OAuth on iOS is the same static flow as Android's; the
   catalogue and discovery would port from `io.github.nanomuse.connectors` nearly as is. *After 5
   is confirmed on a device.*
7. **Web · Connectors.** The runtime would have to run the OAuth flow itself and hold the tokens
   (the desktop does it in the harness host). The web app has MCP servers by hand. *Decision: run
   the flow in the runtime (`nanomuse mcp` already bridges connectors), or point the web app at a
   desktop on the account?*
8. **Desktop · Skills and coding agents pages.** The harness has its own skills; the coding agents
   live on the computer the desktop runs on, so a page would show the local CLIs. *Recommendation:
   coding agents page yes (the web app has one), skills no (duplicate).*
9. **iOS · Coding agents.** Over the hub, like Android — the client is platform-neutral. Medium.
10. **iOS · Hands.** iOS does not let an app drive another; App Intents / Shortcuts are the door.
    Not planned as "hands".
11. **iOS · The Muse shell** — face, header with the status line, rooms, avatar studio, Reach. The
    largest open item; the Android shell is the reference (`io.github.nanomuse.ui`).
12. **Android · Emoji faces.** A face set to an emoji on the web or the desktop shows the dragon
    on the phone. Small.
13. **Theme colour swatches** exist on the desktop only; the phone follows the system, the web app's
    accent follows the avatar. *Decision: one rule for all three?*
14. **Android · Memory as a room.** It is a settings page on the phone, a room elsewhere. Design
    call.
15. **Browser viewer on the desktop.** The live stage shows the hands; a page viewer like the web
    app's is not there. Design call.

## Keeping this true

- The desktop's connectors catalogue is the source (`harness/dsh-nanomuse/src/connectors-catalogue.ts`);
  `node scripts/connectors-json.mjs` writes the Android asset, `--check` fails when it is stale.
- Relay-facing code mirrors the same wire format on every client: `nanomuse/cloud.py` (runtime),
  `harness/dsh-nanomuse/src/relay.ts` (desktop), `io.github.nanomuse.cloud.NanoMuseCloud` (Android),
  `NanoMuse/NanoMuseCloud.swift` + `NanoMuseAccount.swift` (iOS). A new relay field lands in all four.
- The star asks follow one rule everywhere: once per moment per device, never again after
  *Star on GitHub* (`nm.star.*` / `nanomuse.star.*`).
