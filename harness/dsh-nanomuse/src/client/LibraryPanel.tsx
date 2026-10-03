/**
 * The Library (构件): everything the agent delivered, by kind — a second column
 * (search; Artifacts: all, documents, web; Media: images, videos, podcasts;
 * System files at the bottom) beside a grid of cards with a preview and
 * "kind · when". Create opens a chat where the agent makes a new document,
 * page, video or episode and presents the file; a card opens the viewer —
 * Markdown rendered and editable in place, pictures, video and audio played,
 * a web page framed — with Open (the system app) and Reveal.
 */
import { createElement as h, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { IconCheck, IconChevronLeft, IconDoc, IconExternal, IconFile, IconFilter, IconFolder, IconGlobe, IconImage, IconPencil, IconPlus, IconSearch, IconShapes, IconTrash, IconVideo, IconWave } from './icons.tsx'
import type { Words } from './locales.ts'
import { fileUrl, nav, roomsCall, useRooms, type LibraryItem, type LibraryKind } from './rooms.ts'
import { ago, Empty, Markdown, MoreButton, plain, Sheet } from './ui.tsx'

type Shelf = 'all' | LibraryKind

const SHELVES: { id: Shelf; label: Words; icon: (p: { size: number }) => ReactNode; create?: Words; empty: Words }[] = [
  { id: 'all', label: 'libAll', icon: IconShapes, empty: 'libEmptyAll' },
  { id: 'document', label: 'libDocuments', icon: IconDoc, create: 'libCreateDocument', empty: 'libEmptyDocuments' },
  { id: 'web', label: 'libWeb', icon: IconGlobe, create: 'libCreateWeb', empty: 'libEmptyWeb' },
]
const MEDIA: typeof SHELVES = [
  { id: 'image', label: 'libImages', icon: IconImage, empty: 'libEmptyImages' },
  { id: 'video', label: 'libVideos', icon: IconVideo, create: 'libCreateVideo', empty: 'libEmptyVideos' },
  { id: 'audio', label: 'libPodcasts', icon: IconWave, create: 'libCreatePodcast', empty: 'libEmptyPodcasts' },
]

const KIND_WORD: Record<LibraryKind, Words> = { document: 'kindDocument', web: 'kindWeb', image: 'kindImage', video: 'kindVideo', audio: 'kindAudio', file: 'kindFile' }
const KIND_ICON: Record<LibraryKind, (p: { size: number }) => ReactNode> = { document: IconDoc, web: IconGlobe, image: IconImage, video: IconVideo, audio: IconWave, file: IconFile }
const TEXT = /\.(md|markdown|txt|csv|json|tex|html?|svg)$/i

export function makeLibraryPanel(t: Translate) {
  return function LibraryPanel(): ReactNode {
    const rooms = useRooms()
    const [shelf, setShelf] = useState<Shelf>('all')
    const [query, setQuery] = useState('')
    const [sort, setSort] = useState<'newest' | 'name'>('newest')
    const [selecting, setSelecting] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [openId, setOpenId] = useState<string | undefined>()
    const [creating, setCreating] = useState<LibraryKind | undefined>()
    const [error, setError] = useState<string | undefined>()
    const current = [...SHELVES, ...MEDIA].find((s) => s.id === shelf) ?? SHELVES[0]!
    const open = rooms.library.find((i) => i.id === openId)

    const items = useMemo(() => {
      const q = query.trim().toLowerCase()
      const list = rooms.library.filter((i) => (shelf === 'all' || i.kind === shelf) && (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)))
      return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list
    }, [rooms.library, shelf, query, sort])

    const fail = (err: unknown) => setError(t('failed', { message: (err as Error).message }))
    const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
    const removeSelected = () => {
      const ids = [...selected]
      setSelecting(false)
      setSelected(new Set())
      void Promise.all(ids.map((id) => roomsCall('library/delete', { id }))).catch(fail)
    }
    const openSystem = (item: LibraryItem, reveal = false) => { roomsCall('library/open', { id: item.id, reveal }).catch(fail) }

    if (open) return h(Viewer, { t, item: open, lang: rooms.lang, onBack: () => setOpenId(undefined), onOpen: () => openSystem(open), onReveal: () => openSystem(open, true), onRemove: () => { setOpenId(undefined); roomsCall('library/delete', { id: open.id }).catch(fail) }, onFail: fail })

    const column = h('aside', { className: 'nm-lib-col' },
      h('div', { className: 'nm-lib-col-top', 'data-window-drag': true }),
      h('label', { className: 'nm-lib-search' }, h(IconSearch, { size: 15 }), h('input', { type: 'search', value: query, placeholder: t('libSearch'), onChange: (e: FormEvent<HTMLInputElement>) => setQuery(e.currentTarget.value) })),
      h('div', { className: 'nm-lib-group' }, t('libArtifacts')),
      SHELVES.map((s) => h(ShelfButton, { key: s.id, t, shelf: s, active: shelf === s.id, onClick: () => { setShelf(s.id); setSelecting(false) } })),
      h('div', { className: 'nm-lib-group' }, t('libMedia')),
      MEDIA.map((s) => h(ShelfButton, { key: s.id, t, shelf: s, active: shelf === s.id, onClick: () => { setShelf(s.id); setSelecting(false) } })),
      h('div', { className: 'nm-lib-spacer' }),
      h('button', { type: 'button', className: 'nm-lib-shelf', onClick: () => { roomsCall('library/folder', {}).catch(fail) } }, h(IconFolder, { size: 17 }), h('span', null, t('libSystemFiles'))))

    const head = h('div', { className: 'nm-room-head' },
      h('h1', { className: 'nm-room-title' }, selecting ? t('libSelected', { n: selected.size }) : t(current.label)),
      h('div', { className: 'nm-room-actions' },
        selecting
          ? h('button', { type: 'button', className: 'nm-pill nm-pill-sm nm-pill-danger', disabled: selected.size === 0, onClick: removeSelected }, h(IconTrash, { size: 14 }), ' ', t('libRemove'))
          : null,
        h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: () => { setSelecting((v) => !v); setSelected(new Set()) } }, selecting ? t('cancel') : t('libSelect')),
        h(MoreButton, { label: t('libSort'), size: 36, items: [
          { id: 'newest', label: t('libSortNewest'), icon: sort === 'newest' ? h(IconCheck, { size: 14 }) : h('span', { style: { width: 14 } }), onSelect: () => setSort('newest') },
          { id: 'name', label: t('libSortName'), icon: sort === 'name' ? h(IconCheck, { size: 14 }) : h('span', { style: { width: 14 } }), onSelect: () => setSort('name') },
        ] }),
        current.create
          ? h('button', { type: 'button', className: 'nm-pill nm-pill-sm', disabled: !rooms.ready, onClick: () => setCreating(current.id as LibraryKind) }, h(IconPlus, { size: 15 }), ' ', t(current.create))
          : null))

    const grid = items.length === 0
      ? h(Empty, { icon: h(current.icon, { size: 28 }), text: t(current.empty) }, query ? null : h('p', { className: 'nm-empty-sub' }, rooms.ready ? t('libEmptyHint') : t('roomNotReady')))
      : h('div', null,
          h('div', { className: 'nm-lib-recent' }, query ? t('libResults') : t('libRecent')),
          h('div', { className: 'nm-lib-grid' },
            items.map((item) => h(Card, { key: item.id, t, item, selecting, selected: selected.has(item.id), onClick: () => (selecting ? toggle(item.id) : setOpenId(item.id)), onOpen: () => openSystem(item), onReveal: () => openSystem(item, true), onRemove: () => { roomsCall('library/delete', { id: item.id }).catch(fail) } }))))

    return h('div', { className: 'nm-room nm-lib' },
      column,
      h('div', { className: 'nm-lib-main' },
        h('div', { className: 'nm-room-top', 'data-window-drag': true }),
        head,
        h('div', { className: 'nm-room-body' }, h('div', { className: 'nm-room-inner nm-lib-inner' }, error ? h('div', { className: 'nm-room-error' }, error) : null, grid))),
      creating ? h(CreateSheet, { t, kind: creating, onClose: () => setCreating(undefined), onCreated: (sessionId) => { setCreating(undefined); nav.openSession(sessionId); nav.showChats() } }) : null)
  }
}

function ShelfButton({ t, shelf, active, onClick }: { t: Translate; shelf: (typeof SHELVES)[number]; active: boolean; onClick(): void }): ReactNode {
  return h('button', { type: 'button', className: `nm-lib-shelf${active ? ' nm-active' : ''}`, 'aria-current': active ? 'page' : undefined, onClick }, h(shelf.icon, { size: 17 }), h('span', null, t(shelf.label)))
}

function Card({ t, item, selecting, selected, onClick, onOpen, onReveal, onRemove }: { t: Translate; item: LibraryItem; selecting: boolean; selected: boolean; onClick(): void; onOpen(): void; onReveal(): void; onRemove(): void }): ReactNode {
  const Icon = KIND_ICON[item.kind]
  return h('div', { className: `nm-lib-card${selected ? ' nm-selected' : ''}`, role: 'button', tabIndex: 0, onClick, onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } },
    h('div', { className: 'nm-lib-preview' },
      item.kind === 'image' ? h('img', { src: fileUrl(item.id), alt: item.name, loading: 'lazy' })
        : item.kind === 'video' ? h('video', { src: fileUrl(item.id), muted: true, preload: 'metadata' })
        : item.kind === 'document' && TEXT.test(item.name) ? h(TextPreview, { id: item.id })
        : h('div', { className: 'nm-lib-preview-icon' }, h(Icon, { size: 30 })),
      selecting ? h('span', { className: `nm-lib-tick${selected ? ' nm-on' : ''}` }, selected ? h(IconCheck, { size: 13, stroke: 2.5 }) : null) : null),
    h('div', { className: 'nm-lib-caption' },
      h('span', { className: 'nm-lib-caption-icon' }, h(Icon, { size: 16 })),
      h('div', { className: 'nm-lib-caption-main' },
        h('div', { className: 'nm-lib-name' }, item.name),
        h('div', { className: 'nm-lib-sub' }, `${t(KIND_WORD[item.kind])} · ${ago(t, item.at)}`)),
      selecting ? null : h(MoreButton, { label: t('more'), quiet: true, size: 26, items: [
        { id: 'open', label: t('libOpen'), icon: h(IconExternal, { size: 15 }), onSelect: onOpen },
        { id: 'reveal', label: t('libReveal'), icon: h(IconFolder, { size: 15 }), onSelect: onReveal },
        'sep',
        { id: 'remove', label: t('libRemove'), icon: h(IconTrash, { size: 15 }), danger: true, onSelect: onRemove },
      ] })))
}

/** The first lines of a text file, small, as the card's picture. */
function TextPreview({ id }: { id: string }): ReactNode {
  const [text, setText] = useState('')
  useEffect(() => {
    let live = true
    roomsCall<{ text: string }>(`library/file?id=${encodeURIComponent(id)}`).then((r) => { if (live) setText(plain(r.text, 420)) }).catch(() => undefined)
    return () => { live = false }
  }, [id])
  return h('div', { className: 'nm-lib-preview-text' }, text)
}

function Viewer({ t, item, lang, onBack, onOpen, onReveal, onRemove, onFail }: { t: Translate; item: LibraryItem; lang: string; onBack(): void; onOpen(): void; onReveal(): void; onRemove(): void; onFail(err: unknown): void }): ReactNode {
  const textual = TEXT.test(item.name) && item.kind !== 'web' && item.kind !== 'image'
  const [text, setText] = useState<string | undefined>()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'binary'>(textual ? 'loading' : 'ready')
  useEffect(() => {
    if (!textual) return
    let live = true
    roomsCall<{ text: string }>(`library/file?id=${encodeURIComponent(item.id)}`)
      .then((r) => { if (live) { setText(r.text); setDraft(r.text); setState('ready') } })
      .catch((err: Error) => { if (live) setState(/no longer/i.test(err.message) ? 'gone' : 'binary') })
    return () => { live = false }
  }, [item.id, textual])
  const save = () => {
    roomsCall('library/write', { id: item.id, text: draft }).then(() => { setText(draft); setEditing(false) }).catch(onFail)
  }
  const Icon = KIND_ICON[item.kind]
  const markdown = /\.(md|markdown)$/i.test(item.name)
  let body: ReactNode
  if (state === 'gone') body = h(Empty, { icon: h(Icon, { size: 28 }), text: t('libGone') })
  else if (item.kind === 'image') body = h('div', { className: 'nm-view-media' }, h('img', { src: fileUrl(item.id), alt: item.name }))
  else if (item.kind === 'video') body = h('div', { className: 'nm-view-media' }, h('video', { src: fileUrl(item.id), controls: true }))
  else if (item.kind === 'audio') body = h('div', { className: 'nm-view-media nm-view-audio' }, h(IconWave, { size: 40 }), h('audio', { src: fileUrl(item.id), controls: true }))
  else if (item.kind === 'web') body = h('iframe', { className: 'nm-view-frame', src: fileUrl(item.id), sandbox: 'allow-same-origin', title: item.name })
  else if (state === 'loading') body = h('div', { className: 'nm-view-loading' }, h('span', { className: 'nm-spinner' }))
  else if (state === 'binary' || text === undefined) body = h(Empty, { icon: h(Icon, { size: 28 }), text: t('libBinary') }, h('button', { type: 'button', className: 'nm-pill nm-pill-sm', onClick: onOpen }, t('libOpen')))
  else if (editing) body = h('textarea', { className: 'nm-view-editor', value: draft, spellCheck: false, onChange: (e: FormEvent<HTMLTextAreaElement>) => setDraft(e.currentTarget.value) })
  else body = markdown ? h(Markdown, { text, className: 'nm-view-md' }) : h('pre', { className: 'nm-view-pre' }, text)

  return h('div', { className: 'nm-room nm-view' },
    h('div', { className: 'nm-room-top', 'data-window-drag': true }),
    h('div', { className: 'nm-view-bar' },
      h('button', { type: 'button', className: 'nm-icon-btn', 'aria-label': t('goBack'), title: t('goBack'), onClick: onBack }, h(IconChevronLeft, { size: 20 })),
      h('span', { className: 'nm-view-icon' }, h(Icon, { size: 16 })),
      h('span', { className: 'nm-view-name' }, item.name),
      h('span', { className: 'nm-view-sub' }, `${t(KIND_WORD[item.kind])} · ${new Date(item.at).toLocaleString(lang || undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`),
      h('span', { style: { flex: 1 } }),
      textual && state === 'ready'
        ? (editing
            ? h('div', { className: 'nm-view-edit-actions' },
                h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: () => { setDraft(text ?? ''); setEditing(false) } }, t('cancel')),
                h('button', { type: 'button', className: 'nm-pill nm-pill-sm', onClick: save }, t('libDone')))
            : h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: () => setEditing(true) }, h(IconPencil, { size: 14 }), ' ', t('libEdit')))
        : null,
      h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: onOpen }, h(IconExternal, { size: 14 }), ' ', t('libOpen')),
      h(MoreButton, { label: t('more'), size: 30, items: [
        { id: 'reveal', label: t('libReveal'), icon: h(IconFolder, { size: 15 }), onSelect: onReveal },
        { id: 'chat', label: t('libOpenChat'), onSelect: () => { if (item.sessionId) { nav.openSession(item.sessionId); nav.showChats() } } },
        'sep',
        { id: 'remove', label: t('libRemove'), icon: h(IconTrash, { size: 15 }), danger: true, onSelect: onRemove },
      ] })),
    h('div', { className: 'nm-view-body' }, body))
}

function CreateSheet({ t, kind, onClose, onCreated }: { t: Translate; kind: LibraryKind; onClose(): void; onCreated(sessionId: string): void }): ReactNode {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const labels: Partial<Record<LibraryKind, [Words, Words]>> = { document: ['libCreateDocument', 'libBriefDocument'], web: ['libCreateWeb', 'libBriefWeb'], video: ['libCreateVideo', 'libBriefVideo'], audio: ['libCreatePodcast', 'libBriefPodcast'] }
  const [title, placeholder] = labels[kind] ?? labels.document!
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setError(undefined)
    roomsCall<{ sessionId: string }>('library/create', { kind, text: text.trim() }).then((r) => onCreated(r.sessionId)).catch((err: unknown) => setError(t('failed', { message: (err as Error).message }))).finally(() => setBusy(false))
  }
  return h(Sheet, { title: t(title), closeLabel: t('close'), onClose,
    footer: h('div', { className: 'nm-sheet-actions' },
      h('span', { style: { flex: 1 } }),
      h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', onClick: onClose }, t('cancel')),
      h('button', { type: 'submit', form: 'nm-lib-create', className: 'nm-pill nm-pill-sm', disabled: busy || !text.trim() }, busy ? t('libCreating') : t('libCreate'))) },
    h('form', { id: 'nm-lib-create', className: 'nm-sheet-form', onSubmit: submit },
      h('p', { className: 'nm-sheet-lead' }, t('libCreateLead')),
      h('textarea', { className: 'nm-textarea', rows: 4, value: text, placeholder: t(placeholder), maxLength: 4000, onChange: (e: FormEvent<HTMLTextAreaElement>) => setText(e.currentTarget.value), 'data-modal-autofocus': true }),
      error ? h('div', { className: 'nm-room-error' }, error) : null))
}
