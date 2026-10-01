/**
 * The Muse look, as one stylesheet the plugin puts in the page's head. Two
 * layers: the harness's `--dsw-*` design tokens re-bound to the Muse palette
 * (so every harness surface — composer, bubbles, menus — follows without being
 * touched), and the `nm-*` classes of the chrome we draw ourselves: the icon
 * rail and chats column, the pinned agent header, the devices page, the
 * settings dialog and the first-run cards. Everything is scoped under
 * `html[data-nanomuse]`, set by the plugin, so the harness looks like itself
 * again the moment the plugin is gone.
 */

const STYLE_ID = 'nanomuse-muse-style'

/** The agent's accent, from the account's chosen colour when it has one. */
export function setAccent(color: string | undefined): void {
  const root = document.documentElement
  if (color && /^#[0-9a-f]{6}$/i.test(color)) root.style.setProperty('--nm-accent', color)
  else root.style.removeProperty('--nm-accent')
}

const CSS = `
html[data-nanomuse] {
  --nm-accent: #c8743a;
  --nm-rail: 56px;
  --nm-radius: 14px;
}
/* Light: warm paper, the chats column a shade deeper, user bubbles tinted. */
html[data-nanomuse] body {
  --dsw-alias-bg-base: #ffffff;
  --dsw-specific-sidebar-fill: #f4f4f6;
  --dsw-specific-bubble: #f1f1f4;
  --dsw-specific-bubble-highlight: #e6e6ec;
  --dsw-specific-input-major: #ffffff;
  --dsw-alias-brand-primary: #1d1d1f;
}
/* Dark: near-black, the column and rail darker still, bubbles a step lighter. */
html[data-nanomuse] body[data-ds-dark-theme] {
  --dsw-alias-bg-base: #1c1c1e;
  --dsw-alias-bg-layer-1: #202022;
  --dsw-alias-bg-layer-2: #262628;
  --dsw-alias-bg-layer-3: #2c2c2f;
  --dsw-specific-sidebar-fill: #151517;
  --dsw-specific-bubble: #2c2c30;
  --dsw-specific-bubble-highlight: #38383d;
  --dsw-specific-input-major: #26262a;
  --dsw-alias-brand-primary: #f2f2f4;
}

/* ---- sidebar: icon rail + chats column -------------------------------- */
.nm-sidebar { display: flex; height: 100%; min-height: 0; color: var(--dsw-alias-label-primary); background: var(--dsw-specific-sidebar-fill); }
.nm-rail { width: var(--nm-rail); flex: none; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 0 10px; box-sizing: border-box; }
.nm-rail-top { height: 2px; flex: none; }
html[data-platform='darwin'] .nm-rail-top { height: 26px; }
.nm-rail-avatar { width: 40px; height: 40px; margin: 2px 0 10px; border: 0; padding: 0; border-radius: 50%; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.nm-rail-avatar:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: 2px; }
.nm-rail-btn { position: relative; width: 40px; height: 40px; border: 0; padding: 0; border-radius: 12px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 120ms, color 120ms; }
.nm-rail-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.nm-rail-btn[aria-current], .nm-rail-btn[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.nm-rail-btn:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: -2px; }
.nm-rail-dot { position: absolute; top: 8px; right: 8px; width: 7px; height: 7px; border-radius: 50%; background: var(--nm-accent); box-shadow: 0 0 0 2px var(--dsw-specific-sidebar-fill); }
.nm-rail-spacer { flex: 1; }
.nm-col { flex: 1; min-width: 0; display: flex; flex-direction: column; border-left: 1px solid var(--dsw-alias-interactive-bg-hover); opacity: 1; transition: opacity 150ms; }
.nm-col.nm-fading { opacity: 0; }
.nm-col-head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 8px 4px 16px; font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }
.nm-col-head-actions { display: flex; gap: 2px; }
.nm-icon-btn { width: 30px; height: 30px; border: 0; padding: 0; border-radius: 9px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.nm-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.nm-icon-btn:disabled { opacity: 0.45; cursor: default; }
.nm-col-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nm-col-body > * { flex: 1; min-height: 0; }
.nm-col-foot { flex: none; display: flex; flex-direction: column; gap: 2px; padding: 6px; }
.nm-col-foot:empty { display: none; }

/* ---- the pinned agent header over the conversation -------------------- */
header[data-window-drag]:has(.nm-header) { position: relative; min-height: 104px; }
.nm-header { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 3px; pointer-events: none; z-index: 2; max-width: min(60%, 520px); }
.nm-header > * { pointer-events: auto; }
.nm-header-face { position: relative; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 0; padding: 0; background: transparent; cursor: pointer; box-shadow: 0 0 0 2px transparent; transition: box-shadow 300ms; }
.nm-header-face.nm-live { box-shadow: 0 0 0 2px var(--nm-accent); }
.nm-header-face.nm-wait { box-shadow: 0 0 0 2px var(--dsw-alias-state-warn-primary, #d98c1f); }
.nm-header-face:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: 2px; }
.nm-header-name { font-size: 14px; font-weight: 600; line-height: 1.2; color: var(--dsw-alias-label-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.nm-header-status { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 1.2; color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.nm-header-status.nm-live { color: var(--dsw-alias-label-secondary); }
.nm-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-label-dimmed); flex: none; }
.nm-status-dot.nm-on { background: var(--dsw-alias-state-success-primary, #2f9e5f); }
.nm-status-dot.nm-live { background: var(--nm-accent); animation: nm-pulse 1.2s ease-in-out infinite alternate; }
.nm-status-dot.nm-wait { background: var(--dsw-alias-state-warn-primary, #d98c1f); }
@keyframes nm-pulse { from { opacity: 0.45; transform: scale(0.85); } to { opacity: 1; transform: scale(1.1); } }
.nm-stop { display: inline-flex; align-items: center; gap: 4px; margin-left: 4px; padding: 1px 8px 1px 5px; border-radius: 999px; border: 1px solid var(--dsw-alias-interactive-bg-active); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; cursor: pointer; }
.nm-stop:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nm-stop:disabled { opacity: 0.5; cursor: default; }

/* ---- the devices page ------------------------------------------------- */
.nm-page { height: 100%; min-height: 0; overflow: auto; box-sizing: border-box; padding: 28px 32px 40px; color: var(--dsw-alias-label-primary); }
.nm-page-inner { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.nm-page h1 { font-size: 22px; font-weight: 600; margin: 0; }
.nm-page h2 { font-size: 13px; font-weight: 600; margin: 10px 0 0; color: var(--dsw-alias-label-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
.nm-lead { font-size: 14px; line-height: 1.55; color: var(--dsw-alias-label-secondary); margin: 0; }
.nm-card { background: var(--dsw-alias-bg-layer-2, var(--dsw-specific-sidebar-fill)); border-radius: var(--nm-radius); padding: 4px 14px; }
.nm-row { display: flex; align-items: center; gap: 12px; padding: 11px 0; font-size: 14px; border-bottom: 1px solid var(--dsw-alias-interactive-bg-hover); }
.nm-row:last-child { border-bottom: 0; }
.nm-row-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); flex: none; }
.nm-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.nm-row-title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-row-sub { font-size: 12.5px; line-height: 1.45; color: var(--dsw-alias-label-tertiary); }
.nm-row-sub.nm-wrap { white-space: normal; }

/* ---- settings dialog -------------------------------------------------- */
.nm-settings-overlay { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; }
.nm-settings-mask { position: absolute; inset: 0; background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.3)); }
.nm-settings { position: relative; width: min(880px, calc(100vw - 48px)); height: min(600px, calc(100vh - 48px)); display: flex; border-radius: 18px; overflow: hidden; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); box-shadow: 0 24px 80px rgba(0,0,0,0.35), 0 0 0 1px var(--dsw-alias-interactive-bg-hover); outline: none; }
.nm-settings-nav { width: 220px; flex: none; display: flex; flex-direction: column; background: var(--dsw-specific-sidebar-fill); padding: 18px 10px 12px; box-sizing: border-box; overflow: auto; }
.nm-settings-title { font-size: 16px; font-weight: 600; padding: 0 10px 12px; outline: none; }
.nm-settings-group { font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); padding: 12px 10px 6px; }
.nm-settings-cell { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; text-align: left; padding: 8px 10px; border-radius: 10px; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 14px; cursor: pointer; }
.nm-settings-cell:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.nm-settings-cell.nm-active { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.nm-settings-cell svg { flex: none; }
.nm-settings-cell-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-settings-foot { margin-top: auto; padding-top: 10px; }
.nm-settings-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.nm-settings-head { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 12px 14px 0; min-height: 36px; }
.nm-settings-body { flex: 1; min-height: 0; overflow: auto; padding: 8px 28px 28px; }
.nm-settings-body > * { max-width: 560px; }
.nm-close { width: 30px; height: 30px; border: 0; padding: 0; border-radius: 50%; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.nm-close:hover { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.nm-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.nm-advanced-note { font-size: 12.5px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); margin: 0 0 14px; }

/* ---- first run -------------------------------------------------------- */
.nm-welcome { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 12px 10px 4px; width: min(420px, 86vw); text-align: center; }
.nm-welcome-title { font-size: 24px; font-weight: 600; letter-spacing: -0.01em; margin: 4px 0 0; }
.nm-welcome-sub { font-size: 14px; line-height: 1.55; color: var(--dsw-alias-label-secondary); margin: 0; }
.nm-welcome-actions { display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 6px; }
.nm-welcome-foot { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin-top: 8px; }
.nm-perm { display: flex; flex-direction: column; align-items: center; gap: 12px; width: min(440px, 86vw); padding: 8px 6px 2px; text-align: center; }
.nm-perm-art { width: 96px; height: 96px; border-radius: 28px; display: flex; align-items: center; justify-content: center; background: var(--dsw-alias-interactive-bg-hover); color: var(--nm-accent); }
.nm-perm-title { font-size: 20px; font-weight: 600; margin: 0; }
.nm-perm-text { font-size: 14px; line-height: 1.55; color: var(--dsw-alias-label-secondary); margin: 0; min-height: 66px; }
.nm-perm-state { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--dsw-alias-state-success-primary, #2f9e5f); min-height: 20px; }
.nm-perm-nav { display: flex; align-items: center; justify-content: center; gap: 14px; width: 100%; margin-top: 2px; }
.nm-dots { display: flex; gap: 6px; }
.nm-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-label-dimmed); border: 0; padding: 0; cursor: pointer; }
.nm-dot.nm-active { background: var(--dsw-alias-label-primary); }
.nm-link-btn { border: 0; background: transparent; color: var(--dsw-alias-label-tertiary); font-size: 13px; cursor: pointer; padding: 6px 8px; border-radius: 8px; }
.nm-link-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }

/* ---- menus we draw ---------------------------------------------------- */
.nm-menu { position: fixed; z-index: 80; min-width: 200px; padding: 6px; border-radius: 12px; background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); box-shadow: 0 12px 40px rgba(0,0,0,0.28), 0 0 0 1px var(--dsw-alias-interactive-bg-hover); display: flex; flex-direction: column; gap: 1px; }
.nm-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; text-align: left; padding: 8px 10px; border-radius: 8px; background: transparent; color: inherit; font-size: 13.5px; cursor: pointer; }
.nm-menu-item:hover, .nm-menu-item:focus-visible { background: var(--dsw-alias-interactive-bg-hover); outline: none; }
.nm-menu-item svg { color: var(--dsw-alias-label-secondary); flex: none; }
.nm-menu-item-label { flex: 1; min-width: 0; }
.nm-menu-sep { height: 1px; margin: 4px 6px; background: var(--dsw-alias-interactive-bg-hover); }
.nm-menu-hint { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
`

/** Put the stylesheet in the head once and mark the document as ours. */
export function ensureStyles(): () => void {
  const root = document.documentElement
  root.setAttribute('data-nanomuse', '')
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = CSS
  return () => {
    style?.remove()
    root.removeAttribute('data-nanomuse')
    root.style.removeProperty('--nm-accent')
  }
}
