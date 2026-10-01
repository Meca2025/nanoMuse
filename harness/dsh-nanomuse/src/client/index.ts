/**
 * The nanoMuse browser half: the agent's face in the brand slots and the
 * nanoMuse Cloud section in Settings. Everything here is a slot registration
 * — the harness's Web client stays the harness's; we only occupy the seats it
 * declares for a brand and for a settings section.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createElement as h } from 'react'
import { Avatar, BrandName } from './Avatar.tsx'
import { makeCloudSection, type Translate } from './CloudSection.tsx'
import { en, zh } from './locales.ts'

export const name = 'nanomuse-client'
/** Required services: the UI slot registry and the locale table. */
export const inject = ['slots', 'locale']

/** The slot and locale faces we use, named here so the plugin reads plainly. */
interface SlotRegistrar {
  inject(name: string, body: () => unknown): unknown
  register(options: Record<string, unknown>, component: (props: never) => unknown): unknown
}
interface LocaleTable {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  bind(ns: string): (key: string, values?: Record<string, string | number>) => string
}

export function apply(ctx: ClientContext): void {
  const slots = (ctx as unknown as { slots: SlotRegistrar }).slots
  const locale = (ctx as unknown as { locale: LocaleTable }).locale

  ctx.effect(() => locale.register('nanomuse', { en, zh }), 'nanomuse: dictionaries')
  const t = locale.bind('nanomuse') as Translate

  // The sidebar's mark and name.
  slots.inject('sidebar.brand.mark', () =>
    slots.register({ name: 'sidebar.brand.mark' }, ({ size }: { size: number }) => h(Avatar, { size, title: t('brand') })))
  slots.inject('sidebar.brand.name', () =>
    slots.register({ name: 'sidebar.brand.name' }, () => h(BrandName, { text: t('brand') })))

  // The hero above a blank session: the agent, not a logo.
  slots.inject('conversation.hero.brand.mark', () =>
    slots.register({ name: 'conversation.hero.brand.mark' }, ({ size, className }: { size: number; className?: string | undefined }) =>
      h(Avatar, { size, className, title: t('brand') })))

  // Settings → nanoMuse Cloud, after Models (10) and Agents (20).
  const CloudSection = makeCloudSection(t)
  slots.inject('settings.section', () =>
    slots.register({ name: 'settings.section', id: 'nanomuse-cloud', order: 30, label: () => t('nav') }, CloudSection))
}
