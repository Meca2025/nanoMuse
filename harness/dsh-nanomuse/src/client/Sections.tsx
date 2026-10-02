/**
 * The settings pages the Muse desktop has and the harness does not: Computer
 * use (the system permissions the hands need, with the way to the System
 * Settings panes, and the screen-awake switch), Help & support (the places to
 * read and to report) and Legal (the licences, the Meta disclaimer, the
 * acknowledgements, the policies). Plus the Developer rows the General page
 * ends with: the switch that brings the harness's own controls back.
 */
import { createElement as h, useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Translate } from './api.ts'
import { bridge, gatedPermissions, openLink, type PermissionKind, type PermissionState } from './bridge.ts'
import { IconBug, IconCheck, IconChevronRight, IconFile, IconLink, IconScale, IconShield } from './icons.tsx'
import { useLive } from './live.ts'
import { ISSUES_URL } from './panels.ts'
import { setPrefs, usePrefs } from './prefs.ts'

const SITE_URL = 'https://nanomuse.cn/'
const DOCS_URL = 'https://github.com/nano-muse/nanoMuse/blob/main/docs/harness.md'
const DISCUSS_URL = 'https://github.com/nano-muse/nanoMuse/discussions'
const PRIVACY_URL = 'https://github.com/nano-muse/nanoMuse/blob/main/docs/privacy.md'
const TERMS_URL = 'https://github.com/nano-muse/nanoMuse/blob/main/docs/terms.md'
const LICENSE_URL = 'https://github.com/nano-muse/nanoMuse/blob/main/LICENSE'

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange(next: boolean): void; label: string; disabled?: boolean }): ReactNode {
  return h('button', { type: 'button', role: 'switch', className: 'nm-switch', 'aria-checked': checked, 'aria-label': label, disabled, onClick: () => onChange(!checked) })
}

function LinkRow({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub?: string; onClick(): void }): ReactNode {
  return h('button', { type: 'button', className: 'nm-row-link', onClick },
    h('span', { className: 'nm-row-icon' }, icon),
    h('span', { className: 'nm-row-main' },
      h('span', { className: 'nm-row-title' }, title),
      sub ? h('span', { className: 'nm-row-sub' }, sub) : null),
    h(IconChevronRight, { size: 16, className: 'nm-row-chevron' }))
}

export function makeComputerSection(t: Translate) {
  return function ComputerSection(): ReactNode {
    const live = useLive()
    const prefs = usePrefs()
    const name = live.profile.name || t('brand')
    const gated = gatedPermissions()
    const [states, setStates] = useState<Partial<Record<PermissionKind, PermissionState>>>({})
    const refresh = useCallback(() => {
      void bridge()?.permissions().then(setStates).catch(() => undefined)
    }, [])
    useEffect(() => {
      if (!gated) return undefined
      refresh()
      const timer = window.setInterval(refresh, 2000)
      return () => window.clearInterval(timer)
    }, [gated, refresh])
    const row = (kind: PermissionKind, title: string, sub: string) => {
      const granted = states[kind] === 'granted'
      return h('div', { key: kind, className: 'nm-row' },
        h('div', { className: 'nm-row-main' },
          h('span', { className: 'nm-row-title' }, title),
          h('span', { className: 'nm-row-sub' }, sub)),
        granted
          ? h('span', { className: 'nm-ob-granted', 'aria-label': t('obAllowed') }, h(IconCheck, { size: 16 }))
          : h('button', { type: 'button', className: 'nm-pill nm-pill-sm', onClick: () => { void bridge()?.requestPermission(kind).then(() => refresh()) } }, t('obAllow')))
    }
    return h('div', { className: 'nm-section' },
      h('p', null, t('cuLead', { name })),
      h('h2', null, t('cuPermissions')),
      gated
        ? h('div', { className: 'nm-card' },
            row('accessibility', t('obAccessibility'), t('obAccessibilitySub')),
            row('screen', t('obScreen'), t('obScreenSub')),
            h('div', { className: 'nm-row', style: { gap: 12, flexWrap: 'wrap' } },
              h('button', { type: 'button', className: 'nm-ob-link', style: { padding: 0 }, onClick: () => { void bridge()?.openPermissionSettings('accessibility') } }, t('cuOpenSettingsAccessibility')),
              h('button', { type: 'button', className: 'nm-ob-link', style: { padding: 0 }, onClick: () => { void bridge()?.openPermissionSettings('screen') } }, t('cuOpenSettingsScreen'))))
        : h('p', null, t('cuNotGated')),
      h('div', { className: 'nm-card' },
        h('div', { className: 'nm-row' },
          h('div', { className: 'nm-row-main' }, h('span', { className: 'nm-row-title' }, t('cuAwake'))),
          h(Switch, { checked: prefs.keepAwake, label: t('cuAwake'), disabled: bridge() === undefined, onChange: (next) => setPrefs({ keepAwake: next }) })),
        h('div', { className: 'nm-row' },
          h('span', { className: 'nm-row-icon' }, h(IconShield, { size: 18 })),
          h('div', { className: 'nm-row-main' },
            h('span', { className: 'nm-row-title' }, t('cuRisk')),
            h('span', { className: 'nm-row-sub nm-wrap' }, t('cuRiskNote'))))))
  }
}

export function makeHelpSection(t: Translate, version: string) {
  return function HelpSection(): ReactNode {
    return h('div', { className: 'nm-section' },
      h('div', { className: 'nm-card' },
        h(LinkRow, { icon: h(IconFile, { size: 18 }), title: t('helpDocs'), onClick: () => openLink(DOCS_URL) }),
        h(LinkRow, { icon: h(IconLink, { size: 18 }), title: t('helpSite'), sub: 'nanomuse.cn', onClick: () => openLink(SITE_URL) }),
        h(LinkRow, { icon: h(IconLink, { size: 18 }), title: t('helpDiscuss'), onClick: () => openLink(DISCUSS_URL) }),
        h(LinkRow, { icon: h(IconBug, { size: 18 }), title: t('helpIssue'), onClick: () => openLink(ISSUES_URL) })),
      h('div', { className: 'nm-card' },
        h('div', { className: 'nm-row' },
          h('div', { className: 'nm-row-main' },
            h('span', { className: 'nm-row-title' }, t('helpVersion')),
            h('span', { className: 'nm-row-sub' }, t('versionLine', { version }))))))
  }
}

export function makeLegalSection(t: Translate) {
  return function LegalSection(): ReactNode {
    return h('div', { className: 'nm-section' },
      h('div', { className: 'nm-card' },
        h('div', { className: 'nm-row' },
          h('span', { className: 'nm-row-icon' }, h(IconScale, { size: 18 })),
          h('div', { className: 'nm-row-main' },
            h('span', { className: 'nm-row-title' }, t('legalLicense')),
            h('span', { className: 'nm-row-sub nm-wrap' }, t('legalLicenseText')))),
        h('div', { className: 'nm-row' },
          h('div', { className: 'nm-row-main' },
            h('span', { className: 'nm-row-title' }, t('legalMeta')),
            h('span', { className: 'nm-row-sub nm-wrap' }, t('legalMetaText')))),
        h('div', { className: 'nm-row' },
          h('div', { className: 'nm-row-main' },
            h('span', { className: 'nm-row-title' }, t('legalThanks')),
            h('span', { className: 'nm-row-sub nm-wrap' }, t('legalThanksText'))))),
      h('div', { className: 'nm-card' },
        h(LinkRow, { icon: h(IconFile, { size: 18 }), title: t('legalPrivacy'), onClick: () => openLink(PRIVACY_URL) }),
        h(LinkRow, { icon: h(IconFile, { size: 18 }), title: t('legalTerms'), onClick: () => openLink(TERMS_URL) }),
        h(LinkRow, { icon: h(IconScale, { size: 18 }), title: 'GPL-3.0-or-later', onClick: () => openLink(LICENSE_URL) })))
  }
}

/** The Developer rows at the end of General: the harness's own controls, on request. */
export function DeveloperRows({ t }: { t: Translate }): ReactNode {
  const prefs = usePrefs()
  return h('div', { className: 'nm-card', style: { marginTop: 14 } },
    h('div', { className: 'nm-row' },
      h('div', { className: 'nm-row-main' },
        h('span', { className: 'nm-row-title' }, t('stDeveloper')),
        h('span', { className: 'nm-row-sub nm-wrap' }, t('stShowHarness'))),
      h(Switch, { checked: prefs.showHarness, label: t('stShowHarness'), onChange: (next) => setPrefs({ showHarness: next }) })))
}
