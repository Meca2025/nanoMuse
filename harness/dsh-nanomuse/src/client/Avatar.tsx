/**
 * The agent's face where the harness shows a brand: the sidebar mark, the
 * sidebar name and the hero mark above a blank session. The default is the
 * dragon; the face from the account comes later, through the same images.
 */
import { createElement, type CSSProperties } from 'react'

export type Mood = 'idle' | 'happy' | 'waiting' | 'error'

/** Document-relative, so it resolves under whatever mount served the page. */
export function stillUrl(mood: Mood = 'idle'): string {
  return `nanomuse/assets/dragon-${mood}.webp`
}

export interface AvatarProps {
  size: number
  mood?: Mood
  className?: string | undefined
  title?: string
}

/** A round still of the agent at the requested size. */
export function Avatar({ size, mood = 'idle', className, title }: AvatarProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
    background: 'var(--dsw-alias-surface-sunken, #f1efe9)',
  }
  return createElement('img', { src: stillUrl(mood), alt: title ?? 'nanoMuse', title, width: size, height: size, style, className, draggable: false })
}

/** The wordmark beside the mark; plain text in the sidebar's own type. */
export function BrandName({ text }: { text: string }) {
  return createElement('span', { style: { fontWeight: 600, letterSpacing: '-0.01em' } }, text)
}
