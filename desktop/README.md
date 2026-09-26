# nanoMuse Desktop

The computer's Muse. It works on this machine — shell, files, browser, a look at the screen —
and, through the nanoMuse hub, on every other device signed in to the same account: your
phone, your other computers, from any network. Those devices reach this one the same way.

Standard-library Python, one binary per platform, no runtime to install.

## Install

Grab the package for your platform from the release (or the `desktop` workflow's artifacts):

| Platform | Package | What it does |
|---|---|---|
| Windows | `nanomuse-desktop-<ver>-windows-x64-setup.exe` | Installs to `%LOCALAPPDATA%\Programs\nanoMuse Desktop`, adds it to `PATH`, Start-menu entry. Unsigned: SmartScreen shows "More info → Run anyway" once. |
| macOS | `nanomuse-desktop-<ver>-macos-arm64.pkg` (Apple silicon) / `…-macos-x64.pkg` (Intel) | Installs `/usr/local/bin/nanomuse-desktop` and `nanoMuse Desktop.app`, which opens a terminal with the Muse in it. Unsigned: right-click → Open the first time, or `xattr -d com.apple.quarantine`. |
| Linux | `nanomuse-desktop-<ver>-linux-x64.deb` or `.tar.gz` | `sudo dpkg -i …deb`, or unpack and run `install.sh` (→ `~/.local/bin`). |

Or, with Python 3.11+: `pip install ./desktop` and you have `nanomuse-desktop` on the path;
`pip install './desktop[screen]'` adds screenshots without helper programs.

## First run

```
nanomuse-desktop
```

It asks for the nanoMuse Cloud server (the trial one your account is on), your phone number or
e-mail, the code it sends — and you are talking to the computer's Muse in the terminal. It
joins the hub at the same time, so your phone sees this computer within seconds.

`nanomuse-desktop run --open` also opens the web console in the browser, where all your devices
are side by side.

## Commands

```
nanomuse-desktop                       sign in if needed, connect, chat on the terminal
nanomuse-desktop serve                 connect and stay in the background (no terminal chat)
nanomuse-desktop ask "…" [--on <dev>]  one question, here or to another device's Muse
nanomuse-desktop devices               who is on the hub
nanomuse-desktop call <dev> <action> [json]   a raw action: info · shell · files · file.get ·
                                              file.put · open · screen · notify · task · stop
nanomuse-desktop rename <name>         this computer's name on the hub
nanomuse-desktop set remote_control|approvals|model|language|cloud_base|downloads <value>
nanomuse-desktop console               open the web console for this computer
nanomuse-desktop status / sign-in / sign-out
```

In the chat, just say it: "list the downloads folder", "on my phone, take a screenshot",
"tell the phone's Muse to read me the last notification", "on the Mac mini, build the project
and paste the log".

## Safety

Every shell command — this computer's or one sent to another device — is judged first
(`guard.py`, the same ladder as the phone's ShellGuard): reads and builds run quietly;
deleting, sending, paying, and system-level commands ask. Approvals for what *this* computer
does are answered where the question came from: on this terminal, or on the phone or web
console that asked. `set approvals allow` turns the questions off for this computer only.

`set remote_control off` makes this computer answer `info` and nothing else; it still sees and
drives the other devices.

## Config

`~/.nanomuse/desktop.json` (or `$NANOMUSE_HOME/desktop.json`): cloud server, key, device id and
name, model, language, downloads folder. Files received from other devices land in
`~/Downloads/nanoMuse` by default.

## Build

```
pip install pyinstaller pillow mss
python3 scripts/build-desktop.py
```

`desktop/dist/` then holds the binary, the archive and the platform's installer (`.exe` via Inno
Setup when `iscc` is on the path, `.pkg` via `pkgbuild`, `.deb` via `dpkg-deb`). The `desktop`
GitHub workflow builds all four targets and, on a `desktop-v*` tag, publishes a release.

Tests: `python -m pytest desktop/tests`.
