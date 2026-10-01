/**
 * Fire a harness keyboard command from a menu. The shortcuts service resolves
 * key gestures to commands but offers no public "run this command" call, so a
 * menu item presses the command's default chord: the registry handles a
 * synthetic keydown like a real one.
 */

function isMac(): boolean {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform
  return /mac/i.test(platform)
}

export interface Chord {
  code: string
  key: string
  primary?: boolean
  alt?: boolean
  shift?: boolean
}

/** Dispatch the chord on the focused element (or the body); true when something handled it. */
export function press(chord: Chord): boolean {
  const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body
  const primary = chord.primary ?? false
  const event = new KeyboardEvent('keydown', {
    key: chord.key,
    code: chord.code,
    metaKey: primary && isMac(),
    ctrlKey: primary && !isMac(),
    altKey: chord.alt ?? false,
    shiftKey: chord.shift ?? false,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

/** The harness's keyboard-shortcuts reference (`shortcuts.open`, primary + /). */
export function openShortcutsReference(): boolean {
  return press({ code: 'Slash', key: '/', primary: true })
}

/** The harness's Settings command (`settings.open`); bound on the web only for macOS and Windows. */
export function pressSettingsChord(): boolean {
  return press({ code: 'Comma', key: ',', primary: true, alt: true })
}
