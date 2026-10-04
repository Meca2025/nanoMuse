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
| Data controls (what the relay keeps of the chats) | ✓ | ✓ 0.1.33 | ✓ | ✓ |
| Own-key presets (DeepSeek, Bailian, …) | ✓ | n/a — upstream's provider list | ◐ Models page | ✓ |

## The agent in the chat

| Feature | Android | iOS | Desktop | Web |
|---|---|---|---|---|
| Status line says what it is on, never "Thinking" | ✓ | ✓ 0.1.32 *"is on it"* | ✓ | ✓ |
| Status line = the step's own words (`step`: *打开携程网站*), never the raw command | ✓ 0.1.33 | ✓ 0.1.33 | ✓ 0.1.33 | ✓ 0.1.33 |
| "Show the agent's steps", off by default | ✓ | ✓ 0.1.32 *(2)* | ✓ | ✓ 0.1.32 |
| Star asked at sign-in | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| Star asked after the first finished task | ✓ | ✓ 0.1.33 *(3)* | ✓ 0.1.32 | ✓ |
| Star asked when the allowance is spent | ✓ | ✓ 0.1.32 | ✓ 0.1.32 | ✓ |
| Star asked after the tenth task and after a new look (gracious copy) | ✓ 0.1.33 | ✓ 0.1.33 | ✓ 0.1.33 | ✓ 0.1.33 |
| First run: "Sign in — free" before anything else | ✓ | ✓ 0.1.32 *(4)* | ✓ | ✓ |
| Approval cards, three tiers, remembered grants | ✓ | upstream's | ✓ | ✓ |
| Approvals answered outside the app while the hands work | ✓ 0.1.33 capsule *Allow / Deny* | n/a *(10)* | — *(17)* | n/a |
| Browser hand-over: a login / code / payment / CAPTCHA goes back to the person, the agent resumes | ✓ 0.1.33 `hand_over` | — *(16)* | ◐ the person takes the mouse *(16)* | — *(16)* |

## Connectors, agents, devices

| Feature | Android | iOS | Desktop | Web |
|---|---|---|---|---|
| Connectors catalogue (75 remote MCP servers, sign in) | ✓ 0.1.32 *(5)* | ✓ 0.1.33 *(6)* | ✓ | — *(7)* |
| Services without dynamic registration (GitHub, Slack, Discord, …) ask for an OAuth client id | ✓ 0.1.33 | ✓ 0.1.33 | ✓ 0.1.33 | — *(7)* |
| MCP servers by hand (URL / command) | ✓ *Your own servers* under Connectors 0.1.33 | ✓ *Your own servers* under Connectors 0.1.33 | ✓ (harness) | ✓ |
| Connections shared across the account's devices | — *(18)* | — *(18)* | — *(18)* | — *(18)* |
| Skills | ✓ upstream | ✓ upstream | — *(8)* | ✓ |
| Coding agents (Cursor, Codex, Claude Code on the computers) | ✓ | — *(9)* | — *(8)* | ✓ |
| Devices of the account, remote control, rename, forget | ✓ | ◐ list, Reach sheet 0.1.33 | ✓ | ✓ |
| Hands — the device's own screen as a hand | ✓ | n/a *(10)* | ✓ (the computer's screen) *(19)* | n/a |
| A black capture is an error with the fix (Screen Recording, Wayland), never a picture | n/a | n/a | ✓ 0.1.33 | n/a |
| macOS permissions read back live; *Open System Settings* after an ask; Screen Recording relaunch notice | n/a | n/a | ✓ 0.1.33 | n/a |
| Mini-Linux sandbox on the device | ✓ | ✓ upstream (iSH) | n/a — the runtime's own sandbox | n/a |

## Face, rooms, look

| Feature | Android | iOS | Desktop | Web |
|---|---|---|---|---|
| Avatar studio: generate, pick, pose; the face shared across devices | ✓ | ✓ 0.1.33 *(11)* | ✓ | ✓ |
| Emoji faces | ◐ falls back to the dragon *(12)* | ◐ falls back to the dragon *(12)* | ✓ | ✓ |
| Theme colour swatches | — | — | — removed 0.1.33 *(13)* | — |
| Accent follows the avatar | ✓ | ✓ | ✓ | ✓ |
| Rooms: Feed · Ideas · Goals · Library | ✓ | ◐ Ideas · Library real, Feed · Goals empty *(11)* | ✓ | ✓ |
| Memory as a room | — settings page *(14)* | — | ✓ | ✓ |
| Live stage / browser viewer while the hands work | ✓ stage | n/a *(10)* | ✓ live stage — movable, resizable, remembered 0.1.33 | ✓ browser viewer |
| Quick chat (global shortcut) | n/a | n/a | ✓ | n/a |
| Widgets | ✓ upstream | ✓ upstream | n/a | n/a |

## Open for a decision (the "next-next" list)

These are the gaps left open on purpose in 0.1.32 and 0.1.33 — either the platform makes them a
different design, or they are large enough that the call is the maintainer's. Numbers match the
notes above; a settled item keeps its number and says how it went.

1. **iOS · Data controls** — done in 0.1.33 (`NanoMuseDataControls.swift`).
2. **iOS · Steps.** The header line (and the face) are there since 0.1.33; the steps of the message
   still running stay visible even with the setting off, finished messages hide them. *Hide them
   too, now that the status line says what is going on?*
3. **iOS · Star after the first task** — done in 0.1.33, as a card pinned under the header (the
   message list is a UICollectionView; nothing can be placed under the last message). A cancelled
   turn counts as finished, the stream has no cancel signal.
4. **iOS · First run.** Still a "Sign in to nanoMuse Cloud — free" entry on upstream's start
   screen, not the phone's four-page first run; the shell (11) did not bring them. Small.
5. **Android · OAuth connectors need a device test.** Discovery, dynamic client registration, PKCE
   and the token written into the entry's `Authorization` header compile and follow the desktop's
   flow line by line, but no connector was signed into on a device before 0.1.32 (no emulator on
   the build machine); the same goes for 0.1.33's client-id path (GitHub, Slack, …) and the
   browser hand-over. Key and open connectors are plain MCP entries and need nothing new. The
   token ends up in `servers.json` next to API keys, as the in-guest client reads it; refresh runs
   at app start and when the page opens, not in the background.
6. **iOS · Connectors** — done in 0.1.33 (`NanoMuseConnectors.swift`, the Android flow ported),
   with the same caveat as 5: compiled, not yet signed into on a device.
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
11. **iOS · The Muse shell** — done in 0.1.33 on the iPhone: face, header with the status line,
    drawer, bottom bar with the rooms, avatar studio, Reach. Left open inside it: **Feed and
    Goals are empty states** (the iPhone has no scheduler or routine runner; Goals offers *Create
    a goal*, Ideas marks routine ideas *not scheduled on iPhone yet*) — a BGTaskScheduler-based
    runner would be approximate at best, the honest route is the hub: have a computer of the
    account run them and the phone show them. The **iPad keeps upstream's split layout**. The
    shell and the header can be switched off through UserDefaults only (`nanomuse.shell.enabled`,
    `nanomuse.header.enabled`); a Settings toggle is a small follow-up. The studio draws through
    the relay only (no own-key image path on iOS).
12. **Android and iOS · Emoji faces.** A face set to an emoji on the web or the desktop shows the
    dragon on the phones. Small.
13. **Theme colour swatches** — settled in 0.1.33: removed from the desktop; one rule everywhere,
    the accent follows the avatar.
14. **Android · Memory as a room.** It is a settings page on the phone, a room elsewhere. Design
    call.
15. **Browser viewer on the desktop.** The live stage shows the hands; a page viewer like the web
    app's is not there. Design call.
16. **Browser hand-over on the desktop and the web.** On the phone the agent's tab is the
    person's tab (`hand_over`, 0.1.33). The desktop's hands drive the computer's own browser, so
    the person simply takes the mouse (the live stage's *Take over*), but the agent is not told
    to wait and resume — a `hand_over` step for the computer tools (pause, notice, *Done*) would
    close that. The web app's browser is the runtime's, headless, so a hand-over there means
    either a page viewer the person can drive or the sign-in done on another device of the
    account. *Decision: both, or the desktop first?*
17. **Desktop · approvals outside the window.** The phone answers *Allow / Deny* on the capsule
    over the other app. On the desktop an approval is a card in the chat; while the hands work
    the window may be behind the app being driven. Options: a system notification with actions
    (macOS only in Electron), a small always-on-top approval window, or the live stage carrying
    the two buttons. *Recommendation: the live stage, as it is already over everything.*
18. **Connections shared across devices.** A service signed into on the Mac does not show on the
    phone. The relay's profile body could carry the list — ids, labels, which device holds the
    credential, never the credential — so another device shows *connected on your Mac* and offers
    to sign in there; secrets stay where they were minted. Needs a profile field and three
    clients. *Decision: do it, or keep connections per device?*
19. **Desktop · hands that do not fight the person.** The hands and the person share one screen,
    mouse and keyboard; *Take over* gives them back, but a long task still means a borrowed
    computer. Silent background work needs a second display the person is not on: a virtual
    display / separate Space on macOS, an Xvfb or second session on Linux, a separate desktop on
    Windows — each a port of its own (a second `DISPLAY` for the runtime, a window mover). The
    0.1.33 fix is honesty instead: a black capture (no Screen Recording, Wayland) is an error with
    the remedy, the stage moves and resizes out of the way. *Decision: invest in a virtual display
    (Linux first — cheapest), or keep the shared screen?*
20. **Services without a public remote MCP server.** Asked for and checked on 2026-10-04: Zoom
    (no dynamic registration and its metadata 404s), LinkedIn, Zoho Invoice, WHOOP, 钉钉, 腾讯文档,
    滴答清单, 网易邮箱, QQ 邮箱, 微信读书 and 企业微信 have none; 飞书 has only the local
    `lark-cli` skill set; Trello comes through Atlassian's server. Options: leave them out; write
    our own bridges (small MCP servers in the runtime over each vendor's REST API — one developer
    account per vendor, and the Chinese ones need ICP-registered callbacks); wait. *Decision:
    which, if any, are worth a bridge?*
21. **Hands on Linux under Wayland.** The capture and the pointer need X11 or XWayland today; a
    Wayland session gives a black frame (now an error with the hint). The portal route
    (`xdg-desktop-portal` ScreenCast + `libei`) would make it work natively, at the cost of a
    permission dialog per session. *Decision: worth it before the Linux desktop is promoted?*

## Keeping this true

- The desktop's connectors catalogue is the source (`harness/dsh-nanomuse/src/connectors-catalogue.ts`);
  `node scripts/connectors-json.mjs` writes the Android asset and the iPhone's bundled copy,
  `--check` (in the harness workflow) fails when either is stale.
- Relay-facing code mirrors the same wire format on every client: `nanomuse/cloud.py` (runtime),
  `harness/dsh-nanomuse/src/relay.ts` (desktop), `io.github.nanomuse.cloud.NanoMuseCloud` (Android),
  `NanoMuse/NanoMuseCloud.swift` + `NanoMuseAccount.swift` (iOS). A new relay field lands in all four.
- The star asks follow one rule everywhere: once per moment per device, never again after
  *Star on GitHub* (`nm.star.*` / `nanomuse.star.*`).
