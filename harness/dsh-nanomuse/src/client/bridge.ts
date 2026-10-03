/**
 * The Electron shell's bridge, when the page runs inside nanoMuse Desktop
 * (`harness/desktop/src/preload.ts` puts it on `window`). In a browser, or in
 * dsh's own desktop, it is absent and every caller here falls back to what a
 * web page can do: nothing for the system permissions, `window.open` for links.
 */

export type PermissionKind = 'accessibility' | 'screen' | 'microphone'
export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'not-needed'

/** App behaviour, as the shell keeps it: the values, the quick-chat key's name, what this platform can do. */
export interface DesktopPrefs {
  openAtLogin: boolean
  menuBar: boolean
  quickChat: boolean
  quickChatKey: string
  supports: { openAtLogin: boolean; menuBar: boolean; quickChat: boolean }
}

export interface HarnessBridge {
  platform: string
  info(): Promise<{ version: string; platform: string; arch: string }>
  permissions(): Promise<Record<PermissionKind, PermissionState>>
  requestPermission(kind: PermissionKind): Promise<PermissionState>
  openPermissionSettings(kind: PermissionKind | 'files'): Promise<void>
  openExternal(url: string): Promise<void>
  keepAwake(on: boolean): Promise<void>
  setTheme(theme: 'light' | 'dark'): Promise<void>
  // since 0.1.30 — absent in older shells
  prefs?(): Promise<DesktopPrefs>
  setPrefs?(patch: Partial<Pick<DesktopPrefs, 'openAtLogin' | 'menuBar' | 'quickChat'>>): Promise<DesktopPrefs>
  reportBug?(): Promise<{ screenshot: string; url: string }>
  reveal?(path: string): Promise<void>
  onQuickChat?(listener: () => void): () => void
}

export function bridge(): HarnessBridge | undefined {
  const candidate = (globalThis as { nanomuseHarness?: HarnessBridge }).nanomuseHarness
  return candidate && typeof candidate.permissions === 'function' ? candidate : undefined
}

/** Whether the system gates the hands' permissions here (macOS under the Electron shell). */
export function gatedPermissions(): boolean {
  return bridge()?.platform === 'darwin'
}

/** Open a link the way the shell prefers: the person's browser, never a window of ours. */
export function openLink(url: string): void {
  const b = bridge()
  if (b) void b.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}

/** `⌥ Space`-style words for an Electron accelerator. */
export function keyLabel(accelerator: string, platform = bridge()?.platform ?? ''): string {
  const mac = platform === 'darwin'
  const names: Record<string, string> = { Alt: mac ? '⌥' : 'Alt', Ctrl: mac ? '⌃' : 'Ctrl', Control: mac ? '⌃' : 'Ctrl', Shift: mac ? '⇧' : 'Shift', Cmd: '⌘', Command: '⌘', CmdOrCtrl: mac ? '⌘' : 'Ctrl', Super: mac ? '⌘' : 'Win', Space: mac ? 'Space' : 'Space' }
  return accelerator.split('+').map((k) => names[k] ?? k).join(mac ? ' ' : '+')
}
