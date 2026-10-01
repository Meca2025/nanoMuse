/**
 * The nanoMuse browser half: the agent's face and name in the brand slots (the
 * account's, with a mood), the first-run welcome, the nanoMuse Cloud section in
 * Settings and the capsule over the frame while the hands work. Everything here
 * is a slot registration — the harness's Web client stays the harness's; we
 * only occupy the seats it declares for a brand, an onboarding step, a settings
 * section and a frame-wide overlay.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createElement as h } from 'react'
import type { Translate } from './api.ts'
import { Avatar, BrandName, type Mood } from './Avatar.tsx'
import { makeCapsule } from './Capsule.tsx'
import { makeCloudSection } from './CloudSection.tsx'
import { useLive } from './live.ts'
import { en, zh } from './locales.ts'
import { makeOnboarding, type OnboardingOwnerProps } from './Onboarding.tsx'

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

/** The session-status selector hook the slot host passes every occupant. */
type UseSessionStatus = <S>(selector: (snapshot: ReadonlyMap<string, { running: boolean | undefined; pendingInteraction: unknown }>) => S) => S

interface SessionFace {
  cancel(): Promise<unknown>
}
interface SessionsService {
  using<T>(target: string, options: { source: string }, operation: (reference: { ready: Promise<unknown>; binding: { session: SessionFace } }) => Promise<T>): Promise<T>
}

/** The agent's mood from what its sessions are doing: waiting beats working beats idle. */
function useMood(useSessionStatus: UseSessionStatus | undefined): Mood {
  if (typeof useSessionStatus !== 'function') return 'idle'
  return useSessionStatus((snapshot) => {
    let mood: Mood = 'idle'
    for (const status of snapshot.values()) {
      if (status.pendingInteraction !== undefined) return 'waiting'
      if (status.running === true) mood = 'working'
    }
    return mood
  })
}

export function apply(ctx: ClientContext): void {
  const slots = (ctx as unknown as { slots: SlotRegistrar }).slots
  const locale = (ctx as unknown as { locale: LocaleTable }).locale

  ctx.effect(() => locale.register('nanomuse', { en, zh }), 'nanomuse: dictionaries')
  const t = locale.bind('nanomuse') as Translate

  // The sidebar's mark and name: the account's face, with a mood, and the account's name.
  slots.inject('sidebar.brand.mark', () =>
    slots.register({ name: 'sidebar.brand.mark' }, ({ size, useSessionStatus }: { size: number; useSessionStatus?: UseSessionStatus }) => {
      const live = useLive()
      const mood = useMood(useSessionStatus)
      return h(Avatar, { size, profile: live.profile, mood, title: live.profile.name })
    }))
  slots.inject('sidebar.brand.name', () =>
    slots.register({ name: 'sidebar.brand.name' }, () => {
      const live = useLive()
      return h(BrandName, { text: live.profile.name || t('brand') })
    }))

  // The hero above a blank session: the agent, not a logo.
  slots.inject('conversation.hero.brand.mark', () =>
    slots.register({ name: 'conversation.hero.brand.mark' }, ({ size, className }: { size: number; className?: string | undefined }) => {
      const live = useLive()
      return h(Avatar, { size, className, profile: live.profile, title: live.profile.name })
    }))

  // The first run: meet the agent, sign in or use your own key — in the shipped step's seat.
  const Onboarding = makeOnboarding(t)
  slots.inject('settings.onboarding', () =>
    slots.register({ name: 'settings.onboarding', id: 'deepseek-official', order: 0 }, (props: OnboardingOwnerProps) => h(Onboarding, props)))

  // Settings → nanoMuse Cloud, after Models (10) and Agents (20).
  const CloudSection = makeCloudSection(t)
  slots.inject('settings.section', () =>
    slots.register({ name: 'settings.section', id: 'nanomuse-cloud', order: 30, label: () => t('nav') }, CloudSection))

  // The capsule over the frame while the hands work; Stop cancels that session's turn.
  const stop = async (sessionId: string): Promise<void> => {
    const sessions = (ctx as unknown as { get(name: string): unknown }).get('sessions') as SessionsService | undefined
    if (!sessions || !sessionId) return
    await sessions.using(sessionId, { source: 'controllerOperation' }, async (reference) => {
      await reference.ready
      await reference.binding.session.cancel()
    })
  }
  const Capsule = makeCapsule({ t, stop })
  slots.inject('shell.overlay', () =>
    slots.register({ name: 'shell.overlay', id: 'nanomuse.capsule' }, Capsule))
}
