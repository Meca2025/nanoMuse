/**
 * The agent's face where the harness shows a brand: the sidebar mark, the
 * sidebar name, the hero mark above a blank session, the capsule. The face is
 * the account's — the dragon by default, an emoji on a colour, or one drawn in
 * the avatar studio on the phone whose stills the host pulled — and its mood
 * follows what the agent is doing, the way the Android app's `AgentAvatarDisc`
 * does: idle, working, waiting (for the person), happy, error.
 */
import { createElement, type CSSProperties, type ReactElement } from 'react'
import type { LiveProfile } from './live.ts'

export type Mood = 'idle' | 'working' | 'waiting' | 'happy' | 'error'

/** Document-relative, so it resolves under whatever mount served the page. */
export function stillUrl(profile: LiveProfile | undefined, mood: Mood = 'idle'): string {
  if (profile?.avatar === 'face' && profile.faceId) return `nanomuse/assets/face/${profile.faceId}/${mood}.webp`
  return `nanomuse/assets/dragon-${mood}.webp`
}

export interface AvatarProps {
  size: number
  profile?: LiveProfile | undefined
  mood?: Mood
  className?: string | undefined
  title?: string
}

/** A round still of the agent at the requested size; an emoji face is drawn, not loaded. */
export function Avatar({ size, profile, mood = 'idle', className, title }: AvatarProps): ReactElement {
  const name = title ?? profile?.name ?? 'nanoMuse'
  const common: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'block',
    flex: '0 0 auto',
    transition: 'transform 300ms ease',
    transform: mood === 'working' ? 'scale(1.04)' : 'none',
  }
  if (profile?.avatar === 'emoji') {
    return createElement(
      'span',
      {
        role: 'img',
        'aria-label': name,
        title,
        className,
        style: { ...common, background: profile.color || '#0064d4', fontSize: Math.round(size * 0.58), lineHeight: `${size}px`, textAlign: 'center', userSelect: 'none' },
      },
      profile.emoji || '✨',
    )
  }
  return createElement('img', {
    src: stillUrl(profile, mood),
    alt: name,
    title,
    width: size,
    height: size,
    style: { ...common, objectFit: 'cover', background: 'var(--dsw-alias-surface-sunken, #f1efe9)' },
    className,
    draggable: false,
  })
}

/** The wordmark beside the mark; plain text in the sidebar's own type. */
export function BrandName({ text }: { text: string }): ReactElement {
  return createElement('span', { style: { fontWeight: 600, letterSpacing: '-0.01em' } }, text)
}
