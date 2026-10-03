/**
 * Ideas (点子): what the agent could do for the person right now, in groups
 * — "For you" first, then themes — each row an emoji, a first-person title and
 * two lines of detail; a green check once started. A row opens the idea's card
 * (what it includes, how it works, Start), which opens a chat with the
 * idea's request; ⋯ dismisses it. The header's ⋯ writes a fresh batch.
 */
import { createElement as h, useMemo, useState, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { IconBulb, IconCheckCircle, IconRefresh } from './icons.tsx'
import { nav, roomsCall, useRooms, type Idea } from './rooms.ts'
import { Empty, MoreButton, Sheet } from './ui.tsx'

export function makeIdeasPanel(t: Translate) {
  return function IdeasPanel(): ReactNode {
    const rooms = useRooms()
    const [open, setOpen] = useState<Idea | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [starting, setStarting] = useState(false)
    const items = rooms.ideas.items.filter((i) => !i.dismissed)
    const groups = useMemo(() => {
      const order: string[] = []
      const byGroup = new Map<string, Idea[]>()
      for (const idea of items) {
        const key = idea.group || ''
        if (!byGroup.has(key)) {
          byGroup.set(key, [])
          order.push(key)
        }
        byGroup.get(key)!.push(idea)
      }
      return order.map((key) => ({ name: key, ideas: byGroup.get(key)! }))
    }, [items])

    const fail = (err: unknown) => setError(t('failed', { message: (err as Error).message }))
    const refresh = () => { setError(undefined); roomsCall('ideas/refresh', {}).catch(fail) }
    const start = (idea: Idea) => {
      setStarting(true)
      setError(undefined)
      roomsCall<{ sessionId: string }>('ideas/start', { id: idea.id })
        .then(({ sessionId }) => { setOpen(undefined); nav.openSession(sessionId); nav.showChats() })
        .catch(fail)
        .finally(() => setStarting(false))
    }
    const dismiss = (idea: Idea) => { roomsCall('ideas/dismiss', { id: idea.id }).catch(fail) }

    return h('div', { className: 'nm-room' },
      h('div', { className: 'nm-room-top', 'data-window-drag': true }),
      h('div', { className: 'nm-room-head' },
        h('h1', { className: 'nm-room-title' }, t('railIdeas')),
        h('div', { className: 'nm-room-actions' },
          rooms.busy.ideas ? h('span', { className: 'nm-room-busy' }, h('span', { className: 'nm-spinner nm-spinner-sm' }), t('ideasThinking')) : null,
          h(MoreButton, { label: t('more'), size: 36, items: [{ id: 'refresh', label: t('ideasRefresh'), icon: h(IconRefresh, { size: 16 }), onSelect: refresh }] }))),
      h('div', { className: 'nm-room-body' },
        h('div', { className: 'nm-room-inner nm-ideas' },
          error ? h('div', { className: 'nm-room-error' }, error) : null,
          items.length === 0
            ? h(Empty, { icon: h(IconBulb, { size: 28 }), text: rooms.busy.ideas ? t('ideasThinking') : t('ideasEmpty') },
                h('p', { className: 'nm-empty-sub' }, rooms.ready ? t('ideasEmptyHint') : t('roomNotReady')),
                rooms.ready && !rooms.busy.ideas ? h('button', { type: 'button', className: 'nm-pill nm-pill-sm', onClick: refresh }, t('ideasRefresh')) : null)
            : groups.map((group, index) => h('section', { key: group.name || `g${index}`, className: 'nm-idea-group' },
                group.name ? h('h2', { className: 'nm-room-h2' }, group.name) : null,
                group.ideas.map((idea) => h(IdeaRow, { key: idea.id, t, idea, onOpen: () => setOpen(idea), onDismiss: () => dismiss(idea), onStart: () => start(idea) })))))),
      open ? h(IdeaCard, { t, idea: open, starting, onClose: () => setOpen(undefined), onStart: () => start(open) }) : null)
  }
}

function IdeaRow({ t, idea, onOpen, onDismiss, onStart }: { t: Translate; idea: Idea; onOpen(): void; onDismiss(): void; onStart(): void }): ReactNode {
  return h('div', { className: 'nm-idea', role: 'button', tabIndex: 0, onClick: onOpen, onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } } },
    h('div', { className: 'nm-idea-mark', 'aria-hidden': true }, idea.emoji || '💡'),
    h('div', { className: 'nm-idea-main' },
      h('div', { className: 'nm-idea-title' }, idea.title),
      idea.detail ? h('div', { className: 'nm-idea-detail' }, idea.detail) : null),
    idea.started
      ? h('span', { className: 'nm-idea-done', title: t('ideaStarted') }, h(IconCheckCircle, { size: 20 }))
      : h(MoreButton, { label: t('more'), quiet: true, size: 28, items: [
          { id: 'start', label: t('ideaStart'), onSelect: onStart },
          { id: 'dismiss', label: t('ideaDismiss'), onSelect: onDismiss },
        ] }))
}

function IdeaCard({ t, idea, starting, onClose, onStart }: { t: Translate; idea: Idea; starting: boolean; onClose(): void; onStart(): void }): ReactNode {
  const started = Boolean(idea.started)
  return h(Sheet, { title: idea.title, closeLabel: t('close'), onClose, wide: true,
    footer: h('div', { className: 'nm-sheet-actions' },
      h('span', { style: { flex: 1 } }),
      started
        ? h('button', { type: 'button', className: 'nm-pill nm-pill-sm', onClick: () => { nav.openSession(idea.started!); nav.showChats(); onClose() } }, t('ideaOpenChat'))
        : h('button', { type: 'button', className: 'nm-pill nm-pill-sm', disabled: starting, onClick: onStart }, starting ? t('ideaStarting') : t('ideaStart'))) },
    h('div', { className: 'nm-idea-card' },
      idea.detail ? h('p', { className: 'nm-sheet-lead' }, idea.detail) : null,
      idea.includes.length
        ? h('section', null, h('h3', null, t('ideaIncludes')), h('ul', null, idea.includes.map((line, i) => h('li', { key: i }, line))))
        : null,
      idea.how ? h('section', null, h('h3', null, t('ideaHow')), h('p', null, idea.how)) : null,
      h('section', null, h('h3', null, t('ideaPrompt')), h('blockquote', { className: 'nm-idea-prompt' }, idea.prompt))))
}
