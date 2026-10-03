/**
 * The Electron shell's bridge, when the page runs inside nanoMuse Desktop
 * (`harness/desktop/src/preload.ts` puts it on `window`). In a browser, or in
 * dsh's own desktop, it is absent and every caller here falls back to what a
 * web page can do: nothing for the system permissions, `window.open` for links.
 */

export type PermissionKind = 'accessibility' | 'screen' | 'microphone'
export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'not-needed'

export interface HarnessBridge {
  platform: string
  info(): Promise<{ version: string; platform: string; arch: string }>
  permissions(): Promise<Record<PermissionKind, PermissionState>>
  requestPermission(kind: PermissionKind): Promise<PermissionState>
  openPermissionSettings(kind: PermissionKind): Promise<void>
  openExternal(url: string): Promise<void>
  keepAwake(on: boolean): Promise<void>
  setTheme(theme: 'light' | 'dark'): Promise<void>
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
