/**
 * About nanoMuse and the update check (0.1.34). The version line reads
 * "nanoMuse Desktop <app> · harness <bundle>": the app's number from the Electron
 * shell (`nanomuse:info`), the bundle's from package.json at build time. The host
 * asks GitHub for the latest release (nanomuse.cn/dl when GitHub is out of
 * reach), compares, and the row says "New: 0.1.x — Download" with the installer
 * for this computer, or "You have the latest". The host checks once a day by
 * itself; the result puts a dot on ••• and an "Update to 0.1.x" row in the menu.
 */
import { createElement as h, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { pickAsset } from '../desk.ts'
import { call, type Translate } from './api.ts'
import { bridge, openLink } from './bridge.ts'
import { useLive, type UpdateInfo } from './live.ts'
import { DOCS_URL, ISSUES_URL, REPO_URL } from './panels.ts'
import { Sheet } from './ui.tsx'

export const RELEASES_URL = 'https://github.com/nano-muse/nanoMuse/releases'

interface AppInfo {
  version: string
  platform: string
  arch: string
}

let appInfo: AppInfo | undefined
let appInfoAsked = false
const infoListeners = new Set<() => void>()

/** The shell's version, platform and arch; undefined in a plain browser or until the shell answers. */
export function useAppInfo(): AppInfo | undefined {
  return useSyncExternalStore(
    (l) => {
      infoListeners.add(l)
      if (!appInfoAsked) {
        appInfoAsked = true
        void bridge()?.info().then((i) => { appInfo = i; for (const x of infoListeners) x() }).catch(() => undefined)
      }
      return () => infoListeners.delete(l)
    },
    () => appInfo,
    () => appInfo,
  )
}

/** "nanoMuse Desktop 0.1.34 · harness 0.1.34" under the shell; the bundle alone in a browser. */
export function versionLine(t: Translate, bundle: string, app: AppInfo | undefined): string {
  return app ? t('abVersionLine', { app: app.version || '—', bundle: bundle || '—' }) : t('abVersionBundle', { bundle: bundle || '—' })
}

/** The About sheet's open/close, for the ••• menu. */
export const aboutBus: { open?: (() => void) | undefined } = {}

export function useUpdateCheck(): { info: UpdateInfo | null; checking: boolean; check(): void } {
  const live = useLive()
  const [checking, setChecking] = useState(false)
  const [fresh, setFresh] = useState<UpdateInfo | null>(null)
  const check = () => {
    setChecking(true)
    call<UpdateInfo>('update?force=1').then(setFresh).catch(() => undefined).finally(() => setChecking(false))
  }
  return { info: fresh ?? live.update, checking, check }
}

/** The row under About: what runs, what is new, the button that does the right thing. */
export function UpdateRow({ t, bundle }: { t: Translate; bundle: string }): ReactNode {
  const app = useAppInfo()
  const { info, checking, check } = useUpdateCheck()
  const asset = info && app ? pickAsset(info.assets, app.platform, app.arch) : undefined
  let sub: string
  if (checking) sub = t('gnChecking')
  else if (!info) sub = t('gnUpdatesSub')
  else if (info.source === 'none') sub = t('abCheckFailed')
  else if (info.newer) sub = t('abNewVersion', { version: info.latest })
  else sub = t('abLatest')
  const action = info?.newer
    ? h('button', { type: 'button', className: 'nm-pill nm-pill-sm', onClick: () => openLink(asset?.url ?? info.page) }, asset ? t('abDownload') : t('abWhatsNew'))
    : h('button', { type: 'button', className: 'nm-pill nm-pill-ghost nm-pill-sm', disabled: checking, onClick: check }, checking ? t('gnChecking') : t('gnCheckUpdates'))
  return h('div', { className: 'nm-row' },
    h('div', { className: 'nm-row-main' },
      h('span', { className: 'nm-row-title' }, versionLine(t, bundle, app)),
      h('span', { className: 'nm-row-sub' }, sub)),
    action)
}

export function makeAboutSheet(t: Translate, bundle: string) {
  return function AboutSheet(): ReactNode {
    const [open, setOpen] = useState(false)
    useEffect(() => {
      aboutBus.open = () => setOpen(true)
      return () => { aboutBus.open = undefined }
    }, [])
    if (!open) return null
    return h(Sheet, { title: t('aboutTitle'), onClose: () => setOpen(false), closeLabel: t('close') },
      h('p', { className: 'nm-fine' }, t('abLead')),
      h('div', { className: 'nm-card' },
        h(UpdateRow, { t, bundle }),
        h('div', { className: 'nm-row' },
          h('div', { className: 'nm-row-main' },
            h('span', { className: 'nm-row-title' }, t('legalLicense')),
            h('span', { className: 'nm-row-sub nm-wrap' }, t('legalLicenseText'))))),
      h('div', { className: 'nm-card' },
        link(t('gnStar'), REPO_URL),
        link(t('abReleases'), RELEASES_URL),
        link(t('abDocs'), DOCS_URL),
        link(t('abIssues'), ISSUES_URL)))
  }
}

function link(label: string, url: string): ReactNode {
  return h('button', { type: 'button', className: 'nm-row nm-row-button', onClick: () => openLink(url) },
    h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, label), h('span', { className: 'nm-row-sub' }, url.replace(/^https:\/\//, ''))))
}
