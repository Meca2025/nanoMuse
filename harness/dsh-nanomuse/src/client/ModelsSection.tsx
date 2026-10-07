/**
 * Settings → Models (0.1.41, "Choice"): the four things a model does for the person, one
 * row each — Chat, Operating the screen, Making pictures, Making clips — with a picker per
 * row. Every picker lists nanoMuse Cloud first while signed in (its recommended model
 * marked), then one group per own provider the person added, each group filtered to the
 * models that can do the row's job (the host's `GET /models`). A row nothing configured can
 * do shows the gate's one sentence and *Add a provider*; the page ends with *Add a provider*
 * too, which opens the own-key rows on Settings → Account. The pickers used to sit on the
 * Account page (`OwnKey.tsx` `ModelPickers`); that page now links here.
 */
import { createElement as h, Fragment, useCallback, useEffect, useState, type ReactNode } from 'react'
import { call, errorStyle, muted, type Translate } from './api.ts'
import { settingsBus } from './bus.ts'
import { IconHand, IconImage, IconMessage, IconVideo } from './icons.tsx'
import { useLive } from './live.ts'
import { ACCOUNT_SECTION, MODELS_SECTION, providersNamed, useProviders, type ModelOption } from './OwnKey.tsx'

export { MODELS_SECTION }

export type Slot = 'chat' | 'hands' | 'image' | 'video'
export const SLOTS: readonly Slot[] = ['chat', 'hands', 'image', 'video']

export interface SlotView {
  provider: string
  providerLabel: string
  model: string
  options: ModelOption[]
  chosen: boolean
  /** The clips are switched off (the video slot only). */
  off?: boolean
}

/** `GET /models`. */
export interface ModelsView {
  signedIn: boolean
  slots: Record<Slot, SlotView>
  handsExcluded: string[]
}

const SEP = '\u0000'
const ROUTE: Record<Slot, string> = { chat: 'chat-model', hands: 'hands-model', image: 'image-model', video: 'video-model' }
/** The capability the gate's sentence names providers for. */
const CAPABILITY: Record<Slot, 'chat' | 'vision' | 'image' | 'video'> = { chat: 'chat', hands: 'vision', image: 'image', video: 'video' }

export function slotTitle(t: Translate, slot: Slot): string {
  return slot === 'chat' ? t('mlChat') : slot === 'hands' ? t('mlHands') : slot === 'image' ? t('mlImage') : t('mlVideo')
}

function slotSub(t: Translate, slot: Slot): string {
  return slot === 'chat' ? t('mlChatSub') : slot === 'hands' ? t('mlHandsSub') : slot === 'image' ? t('mlImageSub') : t('mlVideoSub')
}

function slotIcon(slot: Slot): ReactNode {
  return slot === 'chat' ? h(IconMessage, { size: 18 }) : slot === 'hands' ? h(IconHand, { size: 18 }) : slot === 'image' ? h(IconImage, { size: 18 }) : h(IconVideo, { size: 18 })
}

/** `GET /models`, again whenever the host's live state says the rows, the sign-in or a choice moved. */
export function useModels(): { view: ModelsView | undefined; error: string | undefined; reload(): void; setView(view: ModelsView): void } {
  const live = useLive()
  const [view, setView] = useState<ModelsView | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])
  const own = live.ownKeys
  const key = `${own?.count ?? 0}|${own?.chatgpt.signedIn ?? false}|${own?.capabilities.join(',') ?? ''}|${live.cloud.signedIn}|${live.handsModel}`
  useEffect(() => {
    let alive = true
    call<ModelsView>('models')
      .then((v) => { if (alive) { setView(v); setError(undefined) } })
      .catch((err: unknown) => { if (alive) setError((err as Error).message) })
    return () => { alive = false }
  }, [tick, key])
  return { view, error, reload, setView }
}

/**
 * One picker: `nanoMuse Cloud` first (its recommended model marked), then one group per own
 * provider. The value is `<provider>\0<model>`; a current model the list does not carry (an
 * older choice, a model the provider stopped listing) is shown as its own option so the
 * picker never looks empty.
 */
export function SlotPicker({ t, slot, view, disabled, onPick }: { t: Translate; slot: Slot; view: SlotView; disabled: boolean; onPick(provider: string, model: string): void }): ReactNode {
  const value = view.off ? 'off' : view.model ? `${view.provider}${SEP}${view.model}` : ''
  const known = value === 'off' || view.options.some((o) => `${o.provider}${SEP}${o.id}` === value)
  const groups = new Map<string, ModelOption[]>()
  for (const o of view.options) groups.set(o.providerLabel, [...(groups.get(o.providerLabel) ?? []), o])
  return h('select', {
    className: 'nm-field nm-select',
    value,
    disabled,
    'aria-label': slotTitle(t, slot),
    'data-testid': `nm-ml-${slot}`,
    onChange: (e: { currentTarget: HTMLSelectElement }) => {
      const [provider, model] = e.currentTarget.value.split(SEP)
      if (slot === 'video' && e.currentTarget.value === 'off') onPick('', 'off')
      else if (provider && model) onPick(provider, model)
    },
  },
    known ? null : h('option', { value }, value ? `${view.providerLabel || view.provider} · ${view.model}` : t('mdPick')),
    slot === 'video' ? h('option', { value: 'off' }, t('mdVideoOff')) : null,
    [...groups.entries()].map(([label, options]) => h('optgroup', { key: label, label }, options.map((o) => h('option', { key: `${o.provider}${SEP}${o.id}`, value: `${o.provider}${SEP}${o.id}` }, o.recommended ? `${o.name} · ${t('mlRecommended')}` : o.name)))))
}

export function openAccountWays(): void {
  settingsBus.openSection?.(ACCOUNT_SECTION)
}

export function makeModelsSection(t: Translate) {
  return function ModelsSection(): ReactNode {
    const { view, error, reload, setView } = useModels()
    const providers = useProviders(t)
    const [busy, setBusy] = useState<Slot | null>(null)
    const [said, setSaid] = useState<Partial<Record<Slot, string>>>({})
    const [failed, setFailed] = useState<string | undefined>()
    const pick = (slot: Slot, provider: string, model: string) => {
      setBusy(slot)
      setFailed(undefined)
      call<SlotView>(ROUTE[slot], model === 'off' ? { model: 'off' } : { model, provider })
        .then((row) => {
          if (view && (slot === 'image' || slot === 'video') && row && 'options' in row) setView({ ...view, slots: { ...view.slots, [slot]: row } })
          setSaid((prev) => ({ ...prev, [slot]: slot === 'chat' ? t('mlAppliesNew') : slot === 'hands' ? t('mlHandsLive') : t('mlSaved') }))
          reload()
        })
        .catch((err: unknown) => setFailed(t('failed', { message: (err as Error).message })))
        .finally(() => setBusy(null))
    }
    if (error) return h('div', { className: 'nm-section' }, h('div', { style: errorStyle }, error))
    if (!view) return h('div', { className: 'nm-section' }, h('p', null, t('mlLead')), h('div', { style: muted }, t('loading')))
    const gate = providers.view
    const addLink = h('button', { type: 'button', className: 'nm-ob-link nm-inline', onClick: openAccountWays }, t('mlAddProvider'))
    const rows = SLOTS.map((slot) => {
      const row = view.slots[slot]
      const empty = row.options.length === 0 && !row.model && !row.off
      let sub: ReactNode
      if (empty) {
        // the gate's sentence: who could, where the person is; the harness's stock DeepSeek without a key counts as nothing
        const sentence = gate ? t(slot === 'chat' ? 'ownKeyNoChat' : slot === 'hands' ? 'ownKeyNoVision' : slot === 'image' ? 'ownKeyNoImage' : 'ownKeyNoVideo', { providers: providersNamed(t, gate, CAPABILITY[slot]) }) : ''
        sub = h(Fragment, null, sentence, sentence ? ' ' : null, addLink)
      } else if (said[slot]) sub = said[slot]
      else sub = slotSub(t, slot)
      return h('div', { key: slot, className: 'nm-row', 'data-testid': `nm-ml-row-${slot}` },
        h('span', { className: 'nm-row-icon' }, slotIcon(slot)),
        h('div', { className: 'nm-row-main' },
          h('span', { className: 'nm-row-title' }, slotTitle(t, slot)),
          h('span', { className: 'nm-row-sub nm-wrap' }, sub),
          slot === 'hands' && view.handsExcluded.length ? h('span', { className: 'nm-row-sub nm-wrap', style: muted }, t('mlHandsExcluded', { providers: view.handsExcluded.join(t('langTag') === 'zh' ? '、' : ', ') })) : null),
        empty ? null : h(SlotPicker, { t, slot, view: row, disabled: busy !== null, onPick: (provider, model) => pick(slot, provider, model) }))
    })
    return h('div', { className: 'nm-section', 'data-testid': 'nm-models-section' },
      h('p', null, t('mlLead')),
      h('div', { className: 'nm-card' }, rows),
      failed ? h('div', { style: errorStyle }, failed) : null,
      h('div', { style: { marginTop: 10 } }, h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: openAccountWays }, t('mlAddProvider'))))
  }
}
