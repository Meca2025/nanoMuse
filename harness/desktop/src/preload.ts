/**
 * The one bridge between the harness's web client and the Electron shell. The
 * nanoMuse client bundle looks for `window.nanomuseHarness`; in a plain
 * browser (dsh on its own) it is absent and the bundle shows nothing that
 * needs it. Everything here is a request to the main process — the renderer
 * stays sandboxed with no Node access of its own.
 *
 * What goes through: the system permissions the hands need (macOS asks for
 * Accessibility and Screen Recording — the first-run flow shows them with an
 * Allow button, like the Muse desktop's), the System Settings panes, opening a
 * link in the person's browser, keeping the screen awake while the agent works,
 * and the window's base colour following the theme.
 */
import { contextBridge, ipcRenderer } from "electron";

export type PermissionKind = "accessibility" | "screen" | "microphone";
export type PermissionState = "granted" | "denied" | "not-determined" | "not-needed";

const bridge = {
  /** `darwin`, `win32`, `linux`. */
  platform: process.platform,
  /** The app's version, its platform and arch. */
  info: (): Promise<{ version: string; platform: string; arch: string }> => ipcRenderer.invoke("nanomuse:info"),
  /** Where every permission the hands use stands right now. */
  permissions: (): Promise<Record<PermissionKind, PermissionState>> => ipcRenderer.invoke("nanomuse:permissions"),
  /** Ask the system for one permission (its own dialog, or the Settings pane); the new state. */
  requestPermission: (kind: PermissionKind): Promise<PermissionState> => ipcRenderer.invoke("nanomuse:permissions:request", kind),
  /** Open the System Settings pane for one permission (macOS); a no-op elsewhere. */
  openPermissionSettings: (kind: PermissionKind): Promise<void> => ipcRenderer.invoke("nanomuse:permissions:settings", kind),
  /** Open an http(s) link in the default browser. */
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("nanomuse:open-external", url),
  /** Keep the display awake (while the agent works the computer). */
  keepAwake: (on: boolean): Promise<void> => ipcRenderer.invoke("nanomuse:keep-awake", on),
  /** Tell the window which theme the page shows, so its base colour matches on resize. */
  setTheme: (theme: "light" | "dark"): Promise<void> => ipcRenderer.invoke("nanomuse:theme", theme),
};

export type NanomuseHarnessBridge = typeof bridge;

contextBridge.exposeInMainWorld("nanomuseHarness", bridge);
