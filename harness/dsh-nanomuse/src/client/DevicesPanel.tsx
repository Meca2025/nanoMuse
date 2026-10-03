/**
 * The Devices page in the harness's `main` seat (the rail's fourth icon):
 * this computer on the account's hub — its name, whether other devices may
 * reach it — and every other device signed in to the account, with what each
 * one can do from here. The same facts Settings → nanoMuse shows in brief,
 * laid out as a page, the way the phone's Devices screen does.
 */
import { Button, Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useState, type FormEvent, type ReactNode } from 'react'
import { call, errorStyle, type Translate } from './api.ts'
import { IconCpu, IconDevices, IconRefresh } from './icons.tsx'
import { useLive, type LiveDevice } from './live.ts'

function ago(t: Translate, seconds: number): string {
  if (!seconds) return ''
  const delta = Math.max(0, Date.now() / 1000 - seconds)
  if (delta < 90) return t('justNow')
  if (delta < 3600) return t('minutesAgo', { n: Math.round(delta / 60) })
  if (delta < 86400) return t('hoursAgo', { n: Math.round(delta / 3600) })
  return t('daysAgo', { n: Math.round(delta / 86400) })
}

export function makeDevicesPanel(t: Translate) {
  return function DevicesPanel(): ReactNode {
    const live = useLive()
    const hub = live.hub
    const [renaming, setRenaming] = useState(false)
    const [name, setName] = useState(hub.deviceName)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | undefined>()
    const others = hub.devices.filter((d) => d.id !== hub.deviceId && d.kind !== 'web')

    const run = (work: () => Promise<unknown>) => {
      setBusy(true)
      setError(undefined)
      work().catch((err: unknown) => setError(t('failed', { message: (err as Error).message }))).finally(() => setBusy(false))
    }
    const rename = (event: FormEvent) => {
      event.preventDefault()
      run(() => call('devices/rename', { name }).then(() => setRenaming(false)))
    }

    const stateLine = !live.cloud.signedIn
      ? t('devicesSignedOut')
      : hub.connected ? t('hubConnected') : (hub.lastError ? t('hubOffline', { reason: hub.lastError }) : t('hubConnecting'))

    return h('div', { className: 'nm-page' },
      h('div', { className: 'nm-page-inner' },
        h('h1', null, t('railDevices')),
        h('p', { className: 'nm-lead' }, t('devicesLead')),
        h('h2', null, t('thisComputer')),
        h('div', { className: 'nm-card' },
          h('div', { className: 'nm-row' },
            h('span', { className: 'nm-row-icon' }, h(IconCpu, { size: 18 })),
            renaming
              ? h('form', { className: 'nm-row-main', style: { flexDirection: 'row', alignItems: 'center', gap: 8 }, onSubmit: rename },
                  h(Input, { value: name, onChange: (e: FormEvent<HTMLInputElement>) => setName(e.currentTarget.value), maxLength: 60, autoFocus: true, 'aria-label': t('deviceName') }),
                  h(Button, { variant: 'primary', size: 'sm', type: 'submit', disabled: busy || !name.trim() }, t('save')),
                  h(Button, { variant: 'ghost', size: 'sm', type: 'button', onClick: () => setRenaming(false) }, t('cancel')))
              : h('div', { className: 'nm-row-main' },
                  h('span', { className: 'nm-row-title' }, hub.deviceName || t('thisComputer')),
                  h('span', { className: 'nm-row-sub' }, h(Dot, { on: hub.connected }), ' ', stateLine)),
            renaming ? null : h(Button, { variant: 'ghost', size: 'sm', onClick: () => { setName(hub.deviceName); setRenaming(true) } }, t('rename'))),
          h('div', { className: 'nm-row' },
            h('span', { className: 'nm-row-icon' }, h(IconDevices, { size: 18 })),
            h('div', { className: 'nm-row-main' },
              h('span', { className: 'nm-row-title' }, t('remoteControl')),
              h('span', { className: 'nm-row-sub nm-wrap' }, hub.remoteControl ? t('remoteControlOn') : t('remoteControlOff'))),
            h(Switch, { checked: hub.remoteControl, disabled: busy, label: t('remoteControl'), onChange: (on: boolean) => run(() => call('devices/remote-control', { on })) })),
          hub.remoteControl || hub.trusted.length === 0
            ? null
            : h('div', { className: 'nm-row', style: { flexDirection: 'column', alignItems: 'stretch', gap: 6 } },
                h('span', { className: 'nm-row-sub' }, t('trustedDevices')),
                ...hub.trusted.map((td) => h('div', { key: td.id, style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  h('span', { className: 'nm-row-title', style: { flex: 1 } }, td.name),
                  h(Button, { variant: 'ghost', size: 'sm', disabled: busy, onClick: () => run(() => call('devices/trust', { device_id: td.id, on: false })) }, t('trustForget')))))),
        h('h2', null, t('otherDevices')),
        h('div', { className: 'nm-card' },
          others.length === 0
            ? h('div', { className: 'nm-row' }, h('span', { className: 'nm-row-sub nm-wrap' }, live.cloud.signedIn ? t('devicesNone') : t('devicesSignedOut')))
            : others.map((d) => h(DeviceRow, { key: d.id, t, device: d, busy, onForget: () => run(() => call('devices/forget', { device_id: d.id })) }))),
        error ? h('div', { style: errorStyle }, error) : null,
        h('p', { className: 'nm-lead', style: { fontSize: 13 } }, t('devicesHint')),
        h('div', null,
          h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => run(() => call('refresh', {})) }, h(IconRefresh, { size: 14 }), ' ', t('refresh')))))
  }
}

function Dot({ on }: { on: boolean }): ReactNode {
  return h('span', { className: `nm-status-dot${on ? ' nm-on' : ''}`, style: { display: 'inline-block', verticalAlign: 'middle' } })
}

function DeviceRow({ t, device: d, busy, onForget }: { t: Translate; device: LiveDevice; busy: boolean; onForget(): void }): ReactNode {
  const kind = t(d.kind === 'phone' ? 'kindPhone' : 'kindComputer')
  const can = d.controllable ? t('deviceReachable') : t('deviceNotReachable')
  return h('div', { className: 'nm-row' },
    h('span', { className: 'nm-row-icon' }, h(IconDevices, { size: 18 })),
    h('div', { className: 'nm-row-main' },
      h('span', { className: 'nm-row-title' }, d.name),
      h('span', { className: 'nm-row-sub' }, h(Dot, { on: d.online }), ' ', [kind, d.os, d.online ? t('online') : `${t('offline')}${d.last_seen ? ` · ${ago(t, d.last_seen)}` : ''}`, d.online ? can : ''].filter(Boolean).join(' · '))),
    d.online ? null : h(Button, { variant: 'ghost', size: 'sm', disabled: busy, onClick: onForget }, t('forget')))
}
