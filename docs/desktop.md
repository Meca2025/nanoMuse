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
  you, read into every chat ([desktop-muse.md](desktop-muse.md#the-rails-other-rooms--feed-ideas-goals-library));
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

The hands need two things from macOS, both granted to **nanoMuse Desktop** (the app
bundle, `io.github.nanomuse.desktop` — the runtime it bundles runs as part of the app and
never appears in the panes): *Screen Recording* for the screenshots and *Accessibility*
for the mouse and the keyboard. At launch the app asks for whichever is missing with the
system's own dialogs (`CGRequestScreenCaptureAccess`, `AXIsProcessTrustedWithOptions`,
through `@computer-use/node-mac-permissions` and `@computer-use/mac-screen-capture-permissions`
— the modules UI-TARS-desktop uses) and opens the Screen Recording pane once, where the
switch is; Settings → Computer use → Permissions asks again on request and shows TCC's own
status for each. Screen Recording reaches freshly started apps only: when the switch flips
while the app runs, it offers *Restart now*, and the restart goes through a proper quit, so
the old host and the old `nanomuse mcp` (started without the permission) go with it.

There is one screenshot path on a Mac: the app's operator. Without Screen Recording,
`desktopCapturer` refuses or the capture is black, and the operator answers `403` with
*macOS: switch on nanoMuse Desktop under System Settings → Privacy & Security → Screen
Recording, then quit and reopen the app.* — the runtime shows that sentence and never falls
back to `mss` / `screencapture` (which would mean a second prompt, for a process you cannot
find in the pane, and a black picture handed to the model). To start the permission flow
over: `tccutil reset ScreenCapture io.github.nanomuse.desktop; tccutil reset Accessibility
io.github.nanomuse.desktop`, then relaunch.

## macOS signing

Without an Apple developer certificate the bundle is ad-hoc signed and macOS asks once.
With the repository secrets `MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD`,
`APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_P8` and
(optionally) `APPLE_TEAM_ID`, `scripts/desktop-app/package-mac.sh` signs with the
Developer ID Application certificate under the hardened runtime
(`harness/desktop/resources/entitlements.mac.plist`), notarizes with notarytool and
staples. The certificate is exported from Keychain Access as a `.p12` and base64-encoded;
the App Store Connect key is the `.p8`'s text.

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
  session they say so and stay off. Choose *Ubuntu on Xorg* on the login screen.
- The log is `~/.nanomuse/desktop/desktop.log`; the launcher's side is in
  `journalctl --user -n 200`.

## The terminal binary

A second shape for machines where a window is in the way: `nanomuse-desktop-terminal`, a
terminal chat with hands on this machine — shell, files, browser, a look at the screen —
and, through the hub, on every other device of the account. One binary per platform,
standard-library Python inside, no runtime to install. Install and commands:
[`desktop/README.md`](../desktop/README.md). Packages come out of
`scripts/build-desktop.py` and the `desktop` workflow, named
`nanomuse-desktop-terminal-<version>-…`: `…-windows-x64-setup.exe`,
`…-macos-arm64.pkg` / `…-macos-x64.pkg`, `…-linux-x64.deb`, plus archives with the bare
binary.

It signs in to the same account as the phone and the desktop, thinks with the relay's
models, and works with the same tool vocabulary the hub speaks: `shell`, `files`,
`file.get`, `file.put`, `open`, `screen`, `notify`, `task`. Its guard (`guard.py`) is
the phone's ShellGuard ladder in Python: reads and builds run quietly; deleting, sending,
paying and system commands ask first, with the risk named. From the terminal, to the
phone: `device_shell`, `device_files`, `device_get`, `device_put`, `device_open`,
`device_screen`, `device_notify` and `delegate`. From the phone to this computer: incoming
`shell` commands go through the guard and, when they ask, the question is sent back to
whoever asked; incoming `task`s run the agent in a conversation of their own. `serve`
keeps it connected in the background without a terminal chat.

`~/.nanomuse/desktop.json` (`$NANOMUSE_HOME` moves it) holds its cloud server, key, device
id and name, model, language and downloads folder; files received land in
`~/Downloads/nanoMuse`. Screenshots use `mss` + Pillow when bundled, else the platform's
own tool (`screencapture`, PowerShell, `gnome-screenshot` / `grim` / `import`).

```
pip install pyinstaller pillow mss
python3 scripts/build-desktop.py          # desktop/dist/
python -m pytest desktop/tests
```

The macOS `.pkg` installs `/usr/local/bin/nanomuse-desktop` and a small "nanoMuse
Desktop.app" that opens it in Terminal; the Windows setup adds the folder to `PATH` and
a Start-menu entry; the `.deb` (package `nanomuse-desktop-terminal`) installs
`/usr/bin/nanomuse-desktop-terminal`, a desktop entry "nanoMuse Desktop (terminal)" with its
own icon, and registers the command as a lower-priority alternative for `nanomuse-desktop`,
so it installs next to the desktop app's `.deb` and the plain name keeps working when the app
is not there. Nothing is signed — macOS asks for right-click → Open once, Windows for "Run
anyway".
