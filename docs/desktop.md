# nanoMuse Desktop

The computer's Muse, in a window: nanoMuse built on
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`), laid out
like the Muse desktop ([desktop-muse.md](desktop-muse.md)), with the account, the face,
Hands on this computer's screen and Reach to every other device of the account as
plugins ([harness.md](harness.md)). Windows 10+, macOS 12+ and Linux x64; one
installer each, nothing to install first — the harness, the nanoMuse bundle and the
runtime for the hands are inside.

| | |
| --- | --- |
| Windows | `nanoMuse-Desktop-<version>-win-x64.exe` (NSIS; no certificate, so SmartScreen asks for *Run anyway*) |
| macOS | `nanoMuse-Desktop-<version>-mac-arm64.dmg` / `-mac-x64.dmg` (and `.zip`); ad-hoc signed unless a release was signed and notarized, then *Open Anyway* once in System Settings → Privacy & Security |
| Linux | `nanoMuse-Desktop-<version>-linux-x64.deb` (preferred) / `.AppImage` / `.tar.gz` — see [Linux notes](#linux-notes) |

Every release carries them (`.github/workflows/desktop-app.yml`; `SHA256SUMS-desktop.txt`
beside them). The code is under [`harness/`](../harness/): the bundle of plugins in
`harness/dsh-nanomuse`, the Electron shell in `harness/desktop`; how to build it yourself is
in [harness/README.md](../harness/README.md). Up to 0.1.29 the same installers wrapped the
Python runtime and the web app in an Electron shell of their own (`desktop/app`) and the
harness build shipped beside them as *nanoMuse Harness*; from 0.1.30 there is the one
desktop, and it installs over the old one (same application id).

## What it is

A dsh Host started by the shell as a child process, showing the harness's web app in a
window of ours: the rail (Chats, Search, Feed, Ideas, Goals, Library, Devices, the
hamburger), the chats column with the main chat and the side chats, the face and name
pinned over the conversation with a live status line and *Stop*, Muse's permission card
over the harness's approvals, the live stage (the screen the agent is working on,
picture-in-picture, with a caption and *Take over*), the profile panel with memory,
Muse's Settings pages (Connectors, Computer use, File system access, Dictation,
Permissions, Data controls with export and reset), the full-window first run. The agent
is dsh's — its agent loop, tools, skills, goals, plan mode, compaction, sub-agents, MCP
— speaking as nanoMuse through the `nanomuse` preset, with:

- **the account**: a phone number or an e-mail and a code (or a password, with a friend's
  invite code) against [nanoMuse Cloud](cloud.md); the key in dsh's credential store; the
  account's models as the *nanoMuse Cloud* provider of the harness's own OpenAI-compatible
  adapter — nothing of ours sits in the model path; Settings → Account is the whole account
  as the phone has it — the pool in yuan with the ways on when it runs low, the invite code,
  usage by kind and by model, the password, the devices holding a key, the timeline, deletion
  — read through the host's pass-through routes (`/nanomuse/cloud/me`, `/sessions`,
  `/account-events`, `/password`, `/sign-out-all`, `/delete-account`, `/config`);
- **Hands** on this computer: `nanomuse mcp` from the bundled runtime over stdio, the
  runtime's `computer_screen` and `computer_act` tools with their approvals, so "what is
  on my screen?" and "open the settings and turn the volume down" work out of the box.
  The mouse, the keyboard and the screenshot are the app's own (`src/operator.ts`, a
  port of UI-TARS-desktop's operator on `@computer-use/nut-js`), answered to the runtime
  over a loopback HTTP server with a per-launch token (`NANOMUSE_OPERATOR_URL` /
  `NANOMUSE_OPERATOR_TOKEN` in the runtime's environment; `GET /info`, `POST
  /screenshot`, `POST /execute`) — one capture path and one pointer space on every
  platform, no `xdotool` or `pyautogui` needed, and coordinates that are pixels of the
  picture the model saw ([gui.md](gui.md#hands-on-the-computer-the-picture-is-the-unit)).
  The runtime's own backends remain the fallback when the app is not the one running it.
  The connectors the runtime's `config.toml` turns on (mailbox, calendar, address book)
  arrive over the same server, and Settings → Connectors shows how to set each one up;
- **the rooms**: Feed, Ideas, Goals and Library as Muse has them, kept by the host in
  `nanomuse/rooms.json` and written by the agent in hidden chats (feed and ideas) or
  chats of their own (goals, with the harness's schedule plugin for their automations;
  Library creations under `~/nanoMuse/Library`), plus memory — what it remembers about
  you, read into every chat ([desktop-muse.md](desktop-muse.md#rail-rooms));
- **Reach**: this computer on the account's device list over the [hub](hub.md); the
  tools `devices`, `device_screen`, `device_shell`, `device_files`, `device_open`,
  `device_notify` and `delegate` for the phone and the other computers; the phone's
  `delegate` landing here as a dsh session "From <device>" with its approvals relayed
  back; remote control (`shell`, `files`, `open`, `screen`) behind a switch.

## Config and data

`~/.nanomuse/desktop` (`NANOMUSE_DESKTOP_HOME` moves it) is the app's dsh home: the
profile under `profiles/nanomuse` (the bundle list, the person's own `cordis.patch.yml`
where Settings and the sign-in write the `nanoMuse Cloud` provider), dsh's credential
store with the account key, the sessions, `desktop.log` with the shell's and the Host's
lines, and `port` — the loopback port the Host had last time, tried first on the next
launch (then 38421, then any free one) so the window's origin, and with it everything
the browser side keeps in that origin's storage, stays the same from launch to launch. A
home kept by nanoMuse Harness 0.1.28–0.1.29 under `~/.nanomuse/harness`
is taken over once. `NANOMUSE_CLOUD_URL` points the account at another relay;
`NANOMUSE_PY` points the preset at another runtime for the hands. The CLI's own `~/.dsh`
is not touched. `nanomuse/hands.json` under the home (mode 0600) is the hands model the
person picked in Settings → nanoMuse Cloud — provider, model, base URL and the account's token
— read by the preset into the runtime's `NANOMUSE_GUI_*` environment at the next start,
and removed on sign-out; `nanomuse/rooms.json` keeps the rooms (feed, goals with their
steps and progress, which ideas were tried, the library index, memory).

## macOS permissions

The hands need two things from macOS: *Screen Recording* for the screenshots and
*Accessibility* for the mouse and the keyboard. Since 0.1.38 both belong to a small app of
their own, **nanoMuse Computer Use** (`nanoMuse.app/Contents/Helpers/nanoMuse Computer
Use.app`, bundle id `io.github.nanomuse.desktop.computer-use`): that is the row you switch
on in System Settings → Privacy & Security → Screen Recording and → Accessibility. nanoMuse
Desktop itself holds neither.

Why a second app. macOS attributes a permission request to the *responsible process* — the
one LaunchServices started, together with everything it spawned. A child process of the
app is the app, as far as the panes are concerned, which is why the bundled runtime never
appeared in them; an app bundle started through `open` is responsible for itself and gets
its own row, named for what it does (Qt's write-up *The Curious Case of the Responsible
Process* walks through the attribution; Codex's *Codex Computer Use.app* is the same
arrangement). The helper is a few hundred lines of Swift (`harness/desktop/mac/computer-use/`)
on a loopback HTTP server with a per-launch token: it reports its two grants, asks for them
with the system's own dialogs (`CGRequestScreenCaptureAccess`,
`AXIsProcessTrustedWithOptions`), takes the picture — with **ScreenCaptureKit** on macOS 14
and later (`SCShareableContent` → the main display → `SCContentFilter` →
`SCScreenshotManager.captureImage`, at the display's pixel size with the cursor in it), with
`CGDisplayCreateImage` on 12 and 13 — not Chromium's `desktopCapturer`, whose black and
absent frames were the 0.1.36 trouble — and moves the mouse and types with `CGEvent` (text
of any script goes in as the characters themselves, so 中文 types without the clipboard).
Why ScreenCaptureKit: on macOS 26 and 27 `CGDisplayCreateImage` returns nothing even with
Screen Recording granted, which 0.1.39 logged as `helper screenshot failed (no screenshot:
noImage)` and then covered with a `desktopCapturer` frame that was black or stale. The app
starts the helper at launch — to read the grants and to ask for the missing ones — and
quits it when it quits; the helper also leaves on its own when the app is gone. It has no
window and no Dock icon; Activity Monitor lists it as *nanoMuse Computer Use*.

What you do, once, on a Mac that has not granted anything yet (checked on macOS 27.0.1,
Apple silicon):

1. Open nanoMuse from the Applications folder (drag it there from the disk image first — see
   *The quarantine flag* below). Settings → Computer use → Permissions, or the first time the
   hands are about to be used: a short dialog of ours says what is being asked and why.
2. **Screen Recording.** The system's dialog appears — *"nanoMuse Computer Use" would like to
   record this computer's screen and audio* — with *Open System Settings*. The pane (called
   *Screen & System Audio Recording* on macOS 15 and later) lists **nanoMuse Computer Use**;
   switch it on. macOS may offer to *Quit & Reopen* the helper: either answer is fine, the
   app starts the helper again by itself and the next screenshot is the real screen. Nothing
   of nanoMuse itself restarts; the conversation goes on.
3. **Accessibility.** The system's dialog again, then the switch next to **nanoMuse Computer
   Use** in the Accessibility pane; macOS asks for your password or Touch ID to flip it. It
   takes effect at once.

The Permissions page shows both rows live, names the helper as the thing to switch on, and
its *Try it* buttons take a test screenshot and move the mouse through the real chain (the
app → the runtime → the helper), so what passes there passes in a chat. Switch a grant off in
the pane and the hands say so on their next step: *macOS: switch on nanoMuse Computer Use
under System Settings → Privacy & Security → Screen Recording. The helper restarts by itself;
the app does not need to.* (`403` from the operator; the runtime never falls back to `mss` or
`screencapture`).

**How the Screen Recording check works.** The helper's `/status` says `granted`, `denied` or
`unknown`. `CGPreflightScreenCaptureAccess` is asked first — TCC's own answer, no prompt —
and a *no* is `denied`. On macOS 14 and later a *yes* is confirmed with ScreenCaptureKit
(`SCShareableContent`): when that throws `userDeclined` or `noDisplayList` the grant is not
really there and the status is `denied` with the reason; another error is `unknown` with the
reason, and the next screenshot tries anyway and reports what ScreenCaptureKit said. So
`granted` means a picture will come back, not just that a switch is on. Requesting stays the
system's own dialog (`CGRequestScreenCaptureAccess`) plus the deep link to the pane.

**When the picture fails, you are told.** With the helper bundle in the app, the operator
never takes a `desktopCapturer` frame in the helper's place — a black or stale picture would
reach the model as if it were the screen. What the chat and `computer_screen` say instead:

- Screen Recording missing for the helper: *macOS: switch on nanoMuse Computer Use under
  System Settings → Privacy & Security → Screen Recording. The helper restarts by itself; the
  app does not need to.* (the `403`; Settings → Computer use says the same).
- ScreenCaptureKit failed with the grant in place: *no screenshot: nanoMuse Computer Use
  could not take the picture — no screenshot: ScreenCaptureKit userDeclined (-3801): …* — the
  SCK error by name and code, followed by the system's text (`noDisplayList`,
  `failedToStart`, `internalError`, … — a reader can look the code up).
- The helper did not start (quarantine kept, no port, App Translocation): *no screenshot:
  nanoMuse Computer Use did not start (…)* with the reason the `helper:` log lines give;
  Settings → Computer use shows the same reason as *not available*.

The pre-0.1.38 `desktopCapturer` path remains only for a build without the helper bundle
(below).

**Checking it on a Mac.** `~/.nanomuse/desktop/desktop.log` has the chain:

- `helper: nanoMuse Computer Use <version> (pid …) at http://127.0.0.1:… — screen granted,
  accessibility true, capture ScreenCaptureKit` — the helper is up and, on macOS 14+, says
  which path takes the picture (`CoreGraphics` on 12 and 13).
- `permissions: accessibility=granted screen=granted (nanoMuse Computer Use <version>,
  capture ScreenCaptureKit)` — the grants as the app read them at launch; a `screen=denied`
  here with the switch on in the pane carries ScreenCaptureKit's reason after the version.
- `operator: helper screenshot failed (…) — not falling back to desktopCapturer` — the
  picture failed, the line says why, and the chat got the same words. There is no `using the
  Electron path` any more.

Then Settings → Computer use → *Try it*: the test screenshot is the helper's picture, or the
error above.

**The quarantine flag.** The disk image you download carries macOS's quarantine flag, and so
does every file copied out of it, the helper included. Opening nanoMuse settles the flag for
nanoMuse — Gatekeeper's dialog, *Open Anyway* — but not for the helper, which LaunchServices
starts as an app of its own. A quarantined, unapproved helper is started from a *translocated*
copy — a read-only mount under `/private/var/folders/…/AppTranslocation/<random>/d/` whose
name changes on every launch — and Gatekeeper's own *could not verify* dialog can come up
for it as well, with the helper never answering. That is what 0.1.38 did: the helper ran (Activity Monitor showed it),
Accessibility could be granted, and no *nanoMuse Computer Use* row ever appeared in the
Screen Recording pane, because tccd had recorded a path that no longer existed. Since 0.1.39
the app removes the flag from the helper before the first launch (`xattr -dr
com.apple.quarantine` on `Contents/Helpers/nanoMuse Computer Use.app`; the log says
`helper: removed the quarantine flag…`), after which the helper starts in place and its rows
stay. This needs the bundle to be writable — your own copy in Applications is. Run from the
disk image or straight from Downloads, nanoMuse itself is translocated, the helper cannot be
fixed and is not started; the log says *move it to the Applications folder and open it
again*, and the hands use the app's own path meanwhile (below).

More to know:

- Screen Recording reaches freshly started processes only — that process is the helper. When
  the switch flips while the app runs, the app restarts the helper by itself (the log says
  `restarting the helper for the new grant`); the *Restart* button on the Permissions page
  restarts the helper too, never the app, and two clicks are one restart.
- The picture is the main display, at most 2 Mpx (a 3456×2234 Retina panel comes down to
  1758×1137), coordinates in points. Only the main display is captured and driven. Holding a
  key across actions (`press` / `release`, UI-TARS's names) works since 0.1.39.
- *Window mode* — the hands working inside one application's window — lists the windows
  and takes the window's picture through the helper too (`GET /windows`, `POST /window`;
  ScreenCaptureKit's `SCContentFilter(desktopIndependentWindow:)` on macOS 14+), so the
  helper's Screen Recording row covers it. The events are still posted from the runtime
  (`CGEventPostToPid`), which macOS attributes to **nanoMuse** itself: window mode needs
  the *nanoMuse* row in the Accessibility pane on top of the helper's two, and falls back to
  the whole screen with a notice when it is missing. Without the helper bundle the runtime
  captures windows itself (`CGWindowListCreateImage`; the runtime's log says `window mode:
  the runtime captures windows itself …`) and needs the *nanoMuse* Screen Recording row as
  well. Settings → Computer use says whether window mode is available.
- macOS 15 and later asks again from time to time whether an app that captures the screen
  without the system's picker may go on; answer *Allow* for nanoMuse Computer Use.
- To start the permission flow over: `tccutil reset ScreenCapture
  io.github.nanomuse.desktop.computer-use; tccutil reset Accessibility
  io.github.nanomuse.desktop.computer-use`, then Settings → Computer use → Permissions again.
  A grant left on *nanoMuse Desktop* / *nanoMuse* from an earlier version is used by window
  mode only (above) and can otherwise be switched off.

Without the helper bundle — a build without it, a development run before `build.sh` — the
app works as before 0.1.38: the grants are nanoMuse Desktop's own
(`io.github.nanomuse.desktop`), read through `@computer-use/node-mac-permissions` and
`@computer-use/mac-screen-capture-permissions`, the picture comes from `desktopCapturer`
and the input from `@computer-use/nut-js`, and a Screen Recording grant needs the app
restarted (*Restart now*). A bundle that is there but did not start (the log's `helper:`
lines say why) is not that case: the hands refuse with the reason until it starts, rather
than moving to the app's own grants that nobody switched on. The Permissions page names
whichever is in use.

The honest caveat: macOS keys a grant to the app's code signature. With a Developer ID
signature the helper's *designated requirement* (identifier + team) is the same from build
to build, so the grant survives updates. The project's certificate is still pending with
the Account Holder, so today's builds are ad-hoc signed: an ad-hoc signature is keyed to the
binary's hash, and every new build of the helper starts the two grants over (as it did for
the app itself). Until the certificate is there, expect to switch the helper on again after
each update — and, when developing, after each `build.sh`: a helper you rebuilt is a new
app to tccd, so `npm start` asks for both grants again each time the Swift changed (the
TypeScript can change freely).

## macOS signing

Without an Apple developer certificate the bundle is ad-hoc signed and macOS asks once.
With the repository secrets `MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD`,
`APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_P8` and
(optionally) `APPLE_TEAM_ID`, `scripts/desktop-app/package-mac.sh` signs with the
Developer ID Application certificate under the hardened runtime
(`harness/desktop/resources/entitlements.mac.plist`), notarizes with notarytool and
staples. The certificate is exported from Keychain Access as a `.p12` and base64-encoded;
the App Store Connect key is the `.p8`'s text.

The helper, *nanoMuse Computer Use.app*, is built on the macOS runner by
`harness/desktop/mac/computer-use/build.sh` (plain `swiftc`, arm64 and x86_64 joined with
`lipo`, deployment target macOS 12.3 — the first with ScreenCaptureKit, which the binary
links; the SCK capture runs on 14+, CoreGraphics before) before electron-builder copies it into
`Contents/Helpers` (`mac.extraFiles` in `electron-builder.yml`). `package-mac.sh` signs it
first, as a bundle of its own — same identity, hardened runtime, its own identifier
`io.github.nanomuse.desktop.computer-use`, none of the app's entitlements — and then the
outer app. A local macOS build wants `build.sh` run before `npm run dist:dir`; without it
electron-builder only warns that the source is missing and the app ships without the
helper, on the pre-0.1.38 path.

## Linux notes

- **The `.deb` is the one to prefer** (Debian, Ubuntu and their derivatives): it installs
  `/opt/nanoMuse/nanomuse-desktop`, the icon set and the desktop entry, and the launcher
  finds it. `sudo apt install ./nanoMuse-Desktop-<version>-linux-x64.deb`.
- **The AppImage needs FUSE.** It mounts itself at start; when the machine has no
  `libfuse2`, or `fusermount` is not permitted (containers, some corporate images — the log
  says `fusermount: mount failed: Operation not permitted` / `Cannot mount AppImage, please
  check your FUSE setup`), run it unpacked instead:
  `./nanoMuse-Desktop-<version>-linux-x64.AppImage --appimage-extract-and-run`, or take the
  **`.tar.gz`** — the same app as a plain folder: unpack it anywhere and run
  `./nanomuse-desktop` from it (no FUSE, no root).
- **The icon does nothing.** The app allows one instance at a time: a click on the launcher
  while a copy is already running tells *that* copy to show its window. Up to 0.1.36 a copy
  whose window had been closed stayed alive for the tray and did not answer — the click
  looked dead. Since 0.1.37 the running copy opens its window again on the click; a copy
  from before that is still in the tray — quit it there (*Quit*), or
  `pkill -f /opt/nanoMuse/nanomuse-desktop`, and click again. Closing the window keeps the
  app in the tray only while the menu-bar switch (Settings → General → App behavior) is on;
  with it off, closing the window quits. **Ctrl+Q** quits from the window either way (Help →
  Quit; the menu bar shows on Alt).
- **No tray icon on Ubuntu 20.04.** GNOME 3.36's appindicator extension (v33) does not take
  the registration Electron 44 sends (a bus name with an object path appended), so the icon
  falls back to an XEmbed tray GNOME Shell does not show — the app is in the tray, invisibly.
  Ubuntu 22.04 and newer show it. On 20.04 use Ctrl+Q, or switch the menu-bar option off so
  that closing the window quits.
- **Wayland.** The hands drive the mouse and read the screen through X11; on a Wayland
  session they say so and stay off — Settings → Computer use's *Take a test shot* and the
  first "what is on my screen?" both answer *the hands are off on this computer: Wayland
  session: … Log in with Xorg …* — and the runtime does not try `xdotool` or `pyautogui`
  behind the app's back (under XWayland they would start and move nothing you can see).
  Choose *Ubuntu on Xorg* on the login screen. The session type is read from
  `XDG_SESSION_TYPE`; a Wayland compositor started by hand shows as `WAYLAND_DISPLAY`
  without a `DISPLAY`, which counts too.
- **Hands on this computer** (X11). Nothing to grant: the app's own operator moves the
  pointer and types through libnut (XTEST) and takes the picture through Electron's
  capturer, and the runtime's `nanomuse mcp` reaches it over loopback — no `xdotool`,
  `pyautogui` or `mss` is needed, and none is used while the app's operator answers. The
  pointer moves on the X display the app was started on (`DISPLAY`), in root pixels: on a
  HiDPI desktop that is the logical size × the scale factor (a 1920×1080 scale-2 display is
  3840×2160 to the hands), and the picture the model sees is that root scaled down to at
  most 1600 wide and 2 Mpx. The frame the app draws around the screen while the hands work
  (the glow) takes no clicks: it steps aside for every pointer action — hidden before the
  pointer moves, back right after with the marker where the click landed, so it blinks for
  about 150 ms per click — and its X11 input region, which Chromium clears whenever the
  window's bounds change, is set again after every such change; should a click ever reach
  the glow anyway, the app sets the region again on the spot and writes one line to the
  log (`glow: the pointer reached the glow …`). Typing and keys do not move the pointer,
  so the glow stays up for them and focus is untouched. A window manager is needed for a
  sensible picture (without one Electron's capturer can return a black frame — the runtime
  then falls back to its own capture). Steps that act on your behalf (Enter, a submit, heavy shortcuts, clicks on words
  from the sensitive list) wait for the card in the chat or on the live stage; *Allow once*
  runs the step, *Always allow in <app>* keeps the hands going in that app until you revoke
  it under Settings → Permissions. Text outside ASCII is typed through the clipboard
  (`xclip`/`xsel` are not needed — Electron's clipboard is used) and Ctrl+V; the previous
  clipboard content is put back afterwards.
- The log is `~/.nanomuse/desktop/desktop.log` (each operator action is a line, `operator:
  click at 1249,1096`); the launcher's side is in `journalctl --user -n 200`.
