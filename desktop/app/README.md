# nanoMuse for the desktop (Electron shell)

The app you see is the web app the runtime serves (`web/` → `nanomuse/server/static`),
loaded from `127.0.0.1` with the runtime's token. This package adds what a browser tab
cannot do:

- starts `nanomuse serve` when it is not running (or attaches to the one that is);
- a tray that keeps the runtime going when the window is closed;
- a global **Stop** — `Ctrl/Cmd+Shift+Esc` — that takes the mouse back from the hands;
- the **stage**: a transparent, click-through window over the display that draws the ring
  and the ripple where the hands are about to click (UI-TARS-desktop's ScreenMarker, the
  Android `HandsStage`), with a pill saying what is going on and how to stop it.

Design notes and the wider picture: [`docs/every-device.md`](../../docs/every-device.md),
[`docs/desktop.md`](../../docs/desktop.md).

## Develop

```bash
cd desktop/app
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install   # the mirror is optional
npm run check          # typecheck + build (main, preload, stage renderer)
npm run start          # build, then open the window against the runtime
npm run stage-demo     # build, then play a scripted hands run into the stage
```

Environment the shell reads:

| variable | meaning |
| --- | --- |
| `NANOMUSE_PORT` | the runtime's port (default `8787`) |
| `NANOMUSE_HOME` | the runtime's data dir, where `server_token` lives (default `~/.nanomuse`) |
| `NANOMUSE_CONFIG` | passed to `nanomuse serve -c …` when the shell has to start it |
| `NANOMUSE_BIN` | the `nanomuse` executable; otherwise `../../.venv/bin/nanomuse`, then `PATH` |

Flags for checks without a person at the screen: `--screenshot=/tmp/win.png` writes the
window and quits; with `--stage-demo` it writes the stage instead.

Nothing here is packaged yet (no electron-builder); the standard-library
`desktop/nanomuse_desktop` binary remains the zero-install way to get a window.
