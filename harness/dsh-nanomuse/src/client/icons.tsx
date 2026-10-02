/**
 * The few line icons the Muse-style chrome needs, drawn inline so the bundle
 * depends on nothing but React. 24-unit grid, 1.75 stroke, round joins — the
 * same weight as the harness's own glyphs, so ours sit beside them quietly.
 */
import { createElement as h, type ReactNode } from 'react'

export interface IconProps {
  size?: number
  className?: string
  /** Stroke width in grid units; 1.75 is the house weight. */
  stroke?: number
}

function icon(paths: ReactNode[], { size = 18, className, stroke = 1.75 }: IconProps): ReactNode {
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
    focusable: false,
  }, ...paths)
}

export const IconChat = (p: IconProps) => icon([h('path', { key: 1, d: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.4 3.2A.6.6 0 0 1 4.6 19.7V17H6.5A2.5 2.5 0 0 1 4 14.5z' })], p)
export const IconSearch = (p: IconProps) => icon([h('circle', { key: 1, cx: 11, cy: 11, r: 6.5 }), h('path', { key: 2, d: 'm20 20-4.2-4.2' })], p)
export const IconCalendar = (p: IconProps) => icon([h('rect', { key: 1, x: 4, y: 5.5, width: 16, height: 14.5, rx: 2.5 }), h('path', { key: 2, d: 'M4 10h16M8.5 3.5v4M15.5 3.5v4' })], p)
export const IconDevices = (p: IconProps) => icon([h('rect', { key: 1, x: 3, y: 6, width: 13, height: 9.5, rx: 1.8 }), h('path', { key: 2, d: 'M6 19h7' }), h('rect', { key: 3, x: 16.5, y: 9, width: 5, height: 10, rx: 1.4 }), h('path', { key: 4, d: 'M19 16.8h.01' })], p)
export const IconMenu = (p: IconProps) => icon([h('path', { key: 1, d: 'M4 7h16M4 12h16M4 17h16' })], p)
export const IconSettings = (p: IconProps) => icon([h('circle', { key: 1, cx: 12, cy: 12, r: 3 }), h('path', { key: 2, d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' })], p)
export const IconKeyboard = (p: IconProps) => icon([h('rect', { key: 1, x: 3, y: 6, width: 18, height: 12, rx: 2 }), h('path', { key: 2, d: 'M7 10h.01M11 10h.01M15 10h.01M7 14h10' })], p)
export const IconBug = (p: IconProps) => icon([h('path', { key: 1, d: 'M9 9h6v5a3 3 0 0 1-6 0z' }), h('path', { key: 2, d: 'M9 9a3 3 0 0 1 6 0M4 13h3M17 13h3M5 18l3-2M19 18l-3-2M5 8l3 2M19 8l-3 2M12 17v3' })], p)
export const IconPuzzle = (p: IconProps) => icon([h('path', { key: 1, d: 'M10 4.5a1.5 1.5 0 1 1 3 0V6h3a1 1 0 0 1 1 1v3h1.5a1.5 1.5 0 1 1 0 3H17v3a1 1 0 0 1-1 1h-3v-1.5a1.5 1.5 0 1 0-3 0V17H7a1 1 0 0 1-1-1v-3H4.5a1.5 1.5 0 1 1 0-3H6V7a1 1 0 0 1 1-1h3z' })], p)
export const IconPlus = (p: IconProps) => icon([h('path', { key: 1, d: 'M12 5v14M5 12h14' })], p)
export const IconPanelLeft = (p: IconProps) => icon([h('rect', { key: 1, x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.5 }), h('path', { key: 2, d: 'M9.5 4.5v15' })], p)
export const IconStop = (p: IconProps) => icon([h('rect', { key: 1, x: 7, y: 7, width: 10, height: 10, rx: 2, fill: 'currentColor', stroke: 'none' })], p)
export const IconChevronLeft = (p: IconProps) => icon([h('path', { key: 1, d: 'm14.5 6-6 6 6 6' })], p)
export const IconChevronRight = (p: IconProps) => icon([h('path', { key: 1, d: 'm9.5 6 6 6-6 6' })], p)
export const IconCheck = (p: IconProps) => icon([h('path', { key: 1, d: 'm5 12.5 4.5 4.5L19 7.5' })], p)
export const IconClose = (p: IconProps) => icon([h('path', { key: 1, d: 'M6 6l12 12M18 6 6 18' })], p)
export const IconMic = (p: IconProps) => icon([h('rect', { key: 1, x: 9, y: 3.5, width: 6, height: 11, rx: 3 }), h('path', { key: 2, d: 'M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5M9 20.5h6' })], p)
export const IconFolder = (p: IconProps) => icon([h('path', { key: 1, d: 'M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z' })], p)
export const IconHand = (p: IconProps) => icon([h('path', { key: 1, d: 'M8 12.5V6.2a1.4 1.4 0 0 1 2.8 0V11M10.8 10.5V4.9a1.4 1.4 0 0 1 2.8 0V11M13.6 10.8V6.2a1.4 1.4 0 0 1 2.8 0v6.3' }), h('path', { key: 2, d: 'M16.4 12.5a1.4 1.4 0 0 1 2.8 0v2.2c0 3.7-2.6 6.3-6.3 6.3-2.9 0-4.5-1.3-5.6-3.2L4.6 14a1.4 1.4 0 0 1 2.3-1.6L8 13.9' })], p)
export const IconUser = (p: IconProps) => icon([h('circle', { key: 1, cx: 12, cy: 8.5, r: 3.5 }), h('path', { key: 2, d: 'M5 20a7 7 0 0 1 14 0' })], p)
export const IconSliders = (p: IconProps) => icon([h('path', { key: 1, d: 'M5 7h9M18 7h1M5 12h3M12 12h7M5 17h11M20 17h-1' }), h('circle', { key: 2, cx: 16, cy: 7, r: 2 }), h('circle', { key: 3, cx: 10, cy: 12, r: 2 }), h('circle', { key: 4, cx: 18, cy: 17, r: 2 })], p)
export const IconCpu = (p: IconProps) => icon([h('rect', { key: 1, x: 6, y: 6, width: 12, height: 12, rx: 2 }), h('rect', { key: 2, x: 10, y: 10, width: 4, height: 4, rx: 0.8 }), h('path', { key: 3, d: 'M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3' })], p)
export const IconSparkle = (p: IconProps) => icon([h('path', { key: 1, d: 'M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.3l-1.8-5.7-5.7-1.8L10.2 9z' }), h('path', { key: 2, d: 'M19 3v3M17.5 4.5h3' })], p)
export const IconDatabase = (p: IconProps) => icon([h('ellipse', { key: 1, cx: 12, cy: 6, rx: 7, ry: 2.5 }), h('path', { key: 2, d: 'M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5' })], p)
export const IconArchive = (p: IconProps) => icon([h('rect', { key: 1, x: 3.5, y: 4.5, width: 17, height: 4.5, rx: 1.2 }), h('path', { key: 2, d: 'M5 9v9a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18V9M10 13h4' })], p)
export const IconLogOut = (p: IconProps) => icon([h('path', { key: 1, d: 'M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10M15 16l4-4-4-4M19 12H9' })], p)
export const IconBell = (p: IconProps) => icon([h('path', { key: 1, d: 'M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z' }), h('path', { key: 2, d: 'M10 20a2 2 0 0 0 4 0' })], p)
export const IconMore = (p: IconProps) => icon([h('circle', { key: 1, cx: 6, cy: 12, r: 1.2, fill: 'currentColor' }), h('circle', { key: 2, cx: 12, cy: 12, r: 1.2, fill: 'currentColor' }), h('circle', { key: 3, cx: 18, cy: 12, r: 1.2, fill: 'currentColor' })], p)
export const IconLaptop = (p: IconProps) => icon([h('rect', { key: 1, x: 4, y: 5, width: 16, height: 11, rx: 2 }), h('path', { key: 2, d: 'M2.5 19h19' })], p)
export const IconPhone = (p: IconProps) => icon([h('rect', { key: 1, x: 7, y: 3, width: 10, height: 18, rx: 2.2 }), h('path', { key: 2, d: 'M11 17.5h2' })], p)
export const IconPencil = (p: IconProps) => icon([h('path', { key: 1, d: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z' }), h('path', { key: 2, d: 'm13.5 7.5 3 3' })], p)
export const IconShield = (p: IconProps) => icon([h('path', { key: 1, d: 'M12 3.5 5 6.2v5.3c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6.2z' }), h('path', { key: 2, d: 'm9 12 2 2 4-4' })], p)
export const IconClock = (p: IconProps) => icon([h('circle', { key: 1, cx: 12, cy: 12, r: 8.5 }), h('path', { key: 2, d: 'M12 7.5V12l3 2' })], p)
export const IconList = (p: IconProps) => icon([h('path', { key: 1, d: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01' })], p)
export const IconBrain = (p: IconProps) => icon([h('path', { key: 1, d: 'M9.5 4.5a2.5 2.5 0 0 0-2.5 2.5v.5A2.5 2.5 0 0 0 5 10v1a2.5 2.5 0 0 0 1 2v1.5A2.5 2.5 0 0 0 8.5 17H9a3 3 0 0 0 3 3V7.5a3 3 0 0 0-2.5-3z' }), h('path', { key: 2, d: 'M14.5 4.5A2.5 2.5 0 0 1 17 7v.5a2.5 2.5 0 0 1 2 2.5v1a2.5 2.5 0 0 1-1 2v1.5a2.5 2.5 0 0 1-2.5 2.5H15a3 3 0 0 1-3 3V7.5a3 3 0 0 1 2.5-3z' })], p)
export const IconGift = (p: IconProps) => icon([h('rect', { key: 1, x: 4, y: 9, width: 16, height: 11, rx: 1.5 }), h('path', { key: 2, d: 'M4 13h16M12 9v11M12 9c-1.5-3-4.5-3.8-5-2s1.5 2.5 5 2c3.5.5 5.5-.2 5-2s-3.5-1-5 2' })], p)
export const IconTarget = (p: IconProps) => icon([h('rect', { key: 1, x: 4, y: 4, width: 16, height: 16, rx: 3.5 }), h('path', { key: 2, d: 'm8.5 12 2.5 2.5 5-5' })], p)
export const IconFile = (p: IconProps) => icon([h('path', { key: 1, d: 'M6.5 3.5h7l4 4v13h-11z' }), h('path', { key: 2, d: 'M13.5 3.5v4h4' })], p)
export const IconLink = (p: IconProps) => icon([h('path', { key: 1, d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1' }), h('path', { key: 2, d: 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' })], p)
export const IconCopy = (p: IconProps) => icon([h('rect', { key: 1, x: 9, y: 9, width: 11, height: 11, rx: 2 }), h('path', { key: 2, d: 'M5 15V6a2 2 0 0 1 2-2h9' })], p)
export const IconSun = (p: IconProps) => icon([h('circle', { key: 1, cx: 12, cy: 12, r: 4 }), h('path', { key: 2, d: 'M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' })], p)
export const IconMoon = (p: IconProps) => icon([h('path', { key: 1, d: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z' })], p)
export const IconMonitor = (p: IconProps) => icon([h('rect', { key: 1, x: 3, y: 4.5, width: 18, height: 12, rx: 2 }), h('path', { key: 2, d: 'M8 20h8M12 16.5V20' })], p)
export const IconHelp = (p: IconProps) => icon([h('circle', { key: 1, cx: 12, cy: 12, r: 8.5 }), h('path', { key: 2, d: 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01' })], p)
export const IconScale = (p: IconProps) => icon([h('path', { key: 1, d: 'M12 3.5v17M5 20h14M4 7.5h16' }), h('path', { key: 2, d: 'M7 7.5 4 14a3 3 0 0 0 6 0zM17 7.5 14 14a3 3 0 0 0 6 0z' })], p)
export const IconPaperclip = (p: IconProps) => icon([h('path', { key: 1, d: 'm20 11.5-8.3 8.3a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7L9.4 17.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8' })], p)
export const IconArrowUp = (p: IconProps) => icon([h('path', { key: 1, d: 'M12 19V5M5.5 11.5 12 5l6.5 6.5' })], p)
export const IconRefresh = (p: IconProps) => icon([h('path', { key: 1, d: 'M20 11a8 8 0 0 0-14.6-3.5M4 13a8 8 0 0 0 14.6 3.5' }), h('path', { key: 2, d: 'M20 4v4h-4M4 20v-4h4' })], p)
