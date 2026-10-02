/**
 * The Muse look, as one stylesheet the plugin puts in the page's head. Three
 * layers: the harness's `--dsw-*` design tokens re-bound to the Muse palette
 * (so every harness surface — menus, dialogs, cards — follows without being
 * touched); the harness's conversation restyled through its stable DOM hooks
 * (`data-composer-card`, `data-chat-flow-kind`, `data-approval-key`…) into
 * Muse's pill composer, tinted user bubbles and grey agent bubbles — only
 * while the Developer switch is off (`html[data-nm-muse]`); and the `nm-*`
 * classes of the chrome we draw ourselves: the icon rail and chats column,
 * the pinned agent header, the profile drawer, the devices page, the settings
 * dialog and the first run. Everything is scoped under `html[data-nanomuse]`,
 * set by the plugin, so the harness looks like itself again the moment the
 * plugin is gone.
 *
 * The colours are the Muse desktop's, sampled: one near-black (#171717) for
 * the window, the rail, the columns and the main area alike; fields and
 * cards a step lighter (#2b2b2b / #2d2d2d); the selected row #232323; agent
 * bubbles a quiet grey; user bubbles the accent colour toned down into the
 * dark. In the light the paper is #f9f9f9, fields white, bubbles #e3e4e6.
 */

const STYLE_ID = 'nanomuse-muse-style'

/** The agent's accent, from the account's chosen colour when it has one. */
export function setAccent(color: string | undefined): void {
  const root = document.documentElement
  if (color && /^#[0-9a-f]{6}$/i.test(color)) root.style.setProperty('--nm-accent', color)
  else root.style.removeProperty('--nm-accent')
}

/** Whether the harness's own controls show (`false`: the Muse composer and column). */
export function setMuseMode(on: boolean): void {
  const root = document.documentElement
  if (on) root.setAttribute('data-nm-muse', '')
  else root.removeAttribute('data-nm-muse')
}

const CSS = `
html[data-nanomuse] {
  --nm-accent: #c8743a;
  --nm-blue: #2f6fd0;
  --nm-blue-hover: #2a63ba;
  --nm-rail: 66px;
  --nm-radius: 14px;
  --nm-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
}
/* Light: paper, white fields, grey bubbles, the user's tinted with the accent. */
html[data-nanomuse] body {
  --nm-base: #f9f9f9;
  --nm-field: #ffffff;
  --nm-field-border: #e3e4e6;
  --nm-card: #ffffff;
  --nm-selected: #f0f0f1;
  --nm-hover: #f1f1f2;
  --nm-divider: #ececec;
  --nm-agent-bubble: #e9e9eb;
  --nm-user-bubble: color-mix(in srgb, var(--nm-accent) 22%, #ffffff);
  --nm-send: #111111;
  --nm-send-idle: #c9c9cc;
  --dsw-alias-bg-base: #f9f9f9;
  --dsw-alias-bg-layer-1: #f2f2f2;
  --dsw-alias-bg-layer-2: #ececec;
  --dsw-alias-bg-layer-3: #e3e4e6;
  --dsw-specific-sidebar-fill: #f9f9f9;
  --dsw-specific-bubble: #e9e9eb;
  --dsw-specific-bubble-highlight: #dedfe2;
  --dsw-specific-input-major: #ffffff;
  --dsw-alias-brand-primary: #1d1d1f;
}
/* Dark: one near-black, fields and cards a step lighter, bubbles a quiet grey. */
html[data-nanomuse] body[data-ds-dark-theme] {
  --nm-base: #171717;
  --nm-field: #2b2b2b;
  --nm-field-border: #2b2b2b;
  --nm-card: #2d2d2d;
  --nm-selected: #262626;
  --nm-hover: #222222;
  --nm-divider: #242424;
  --nm-agent-bubble: #242424;
  --nm-user-bubble: color-mix(in srgb, var(--nm-accent) 42%, #171717);
  --nm-send: #e8e8e8;
  --nm-send-idle: #3a3a3a;
  --dsw-alias-bg-base: #171717;
  --dsw-alias-bg-layer-1: #1d1d1d;
  --dsw-alias-bg-layer-2: #232323;
  --dsw-alias-bg-layer-3: #2d2d2d;
  --dsw-specific-sidebar-fill: #171717;
  --dsw-specific-bubble: #242424;
  --dsw-specific-bubble-highlight: #2f2f2f;
  --dsw-specific-input-major: #2b2b2b;
  --dsw-alias-brand-primary: #f2f2f4;
}
html[data-nanomuse] body { font-family: var(--nm-font); }

/* ---- shared controls --------------------------------------------------- */
.nm-pill { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 22px; border: 0; border-radius: 999px; background: var(--nm-blue); color: #fff; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 120ms, opacity 120ms; }
.nm-pill:hover:not(:disabled) { background: var(--nm-blue-hover); }
.nm-pill:disabled { opacity: 0.45; cursor: default; }
.nm-pill:focus-visible { outline: 2px solid var(--nm-blue); outline-offset: 2px; }
.nm-pill-ghost { background: var(--nm-card); color: var(--dsw-alias-label-primary); box-shadow: inset 0 0 0 1px var(--nm-field-border); }
.nm-pill-ghost:hover:not(:disabled) { background: var(--nm-selected); }
.nm-pill-sm { min-height: 30px; padding: 0 14px; font-size: 13px; }
.nm-field { box-sizing: border-box; width: 100%; height: 44px; padding: 0 14px; border: 1px solid var(--nm-field-border); border-radius: 12px; background: var(--nm-field); color: var(--dsw-alias-label-primary); font: inherit; font-size: 15px; outline: none; transition: border-color 120ms, box-shadow 120ms; }
.nm-field::placeholder { color: var(--dsw-alias-label-tertiary); }
.nm-field:focus { border-color: var(--nm-blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--nm-blue) 25%, transparent); }
.nm-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 12px; background: var(--dsw-alias-bg-layer-2); }
.nm-seg-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; height: 32px; padding: 0 10px; border: 0; border-radius: 9px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.nm-seg-btn:hover { color: var(--dsw-alias-label-primary); }
.nm-seg-btn.nm-active { background: var(--nm-card); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.18); }
.nm-spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid color-mix(in srgb, var(--nm-blue) 25%, transparent); border-top-color: var(--nm-blue); animation: nm-spin 0.8s linear infinite; }
@keyframes nm-spin { to { transform: rotate(360deg); } }
.nm-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.nm-icon-btn { width: 30px; height: 30px; border: 0; padding: 0; border-radius: 9px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.nm-icon-btn:hover { background: var(--nm-hover); color: var(--dsw-alias-label-primary); }
.nm-icon-btn:disabled { opacity: 0.45; cursor: default; }
.nm-icon-btn-sm { width: 24px; height: 24px; border-radius: 7px; }

/* ---- sidebar: icon rail + chats column -------------------------------- */
.nm-sidebar { display: flex; height: 100%; min-height: 0; color: var(--dsw-alias-label-primary); background: var(--nm-base); }
.nm-rail { width: var(--nm-rail); flex: none; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 0 12px; box-sizing: border-box; }
.nm-rail-top { height: 2px; flex: none; }
html[data-platform='darwin'] .nm-rail-top { height: 30px; }
.nm-rail-avatar { width: 44px; height: 44px; margin: 2px 0 10px; border: 0; padding: 0; border-radius: 50%; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.nm-rail-avatar:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: 2px; }
.nm-rail-btn { position: relative; width: 44px; height: 44px; border: 0; padding: 0; border-radius: 13px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 120ms, color 120ms; }
.nm-rail-btn:hover { background: var(--nm-hover); color: var(--dsw-alias-label-primary); }
.nm-rail-btn[aria-current], .nm-rail-btn[aria-expanded="true"] { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
.nm-rail-btn:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: -2px; }
.nm-rail-dot { position: absolute; top: 9px; right: 9px; width: 7px; height: 7px; border-radius: 50%; background: var(--nm-accent); box-shadow: 0 0 0 2px var(--nm-base); }
.nm-rail-spacer { flex: 1; }
.nm-col { flex: 1; min-width: 0; display: flex; flex-direction: column; border-right: 1px solid var(--nm-divider); opacity: 1; transition: opacity 150ms; }
.nm-col.nm-fading { opacity: 0; }
.nm-col-top { height: 10px; flex: none; }
html[data-platform='darwin'] .nm-col-top { height: 36px; }
.nm-col-head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 8px 4px 16px; font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }
.nm-col-head-actions { display: flex; gap: 2px; }
.nm-col-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nm-col-body > * { min-height: 0; }
.nm-col-body > :last-child { flex: 1; }
.nm-col-foot { flex: none; display: flex; flex-direction: column; gap: 2px; padding: 6px; }
.nm-col-foot:empty { display: none; }

.nm-chats { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.nm-chats-head { flex: none; display: flex; align-items: center; gap: 4px; padding: 0 8px 8px 10px; }
.nm-chats-search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border-radius: 10px; background: var(--nm-field); border: 1px solid var(--nm-field-border); color: var(--dsw-alias-label-tertiary); cursor: text; }
.nm-chats-search:focus-within { border-color: var(--nm-blue); }
.nm-chats-search input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13.5px; outline: none; }
.nm-chats-search input::placeholder { color: var(--dsw-alias-label-tertiary); }
.nm-chats-search input::-webkit-search-cancel-button { -webkit-appearance: none; }
.nm-chats-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 8px; display: flex; flex-direction: column; gap: 1px; }
.nm-chats-section { display: flex; align-items: center; justify-content: space-between; padding: 14px 4px 4px 10px; font-size: 13px; color: var(--dsw-alias-label-tertiary); }
.nm-chats-empty { padding: 6px 10px; font-size: 12.5px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.nm-chat-row { position: relative; display: flex; align-items: center; border-radius: 9px; min-height: 34px; }
.nm-chat-row:hover { background: var(--nm-hover); }
.nm-chat-row.nm-selected { background: var(--nm-selected); }
.nm-chat-open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 8px 0 10px; border: 0; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; text-align: left; cursor: pointer; border-radius: 9px; }
.nm-chat-open:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: -2px; }
.nm-chat-row.nm-main .nm-chat-title { font-weight: 500; }
.nm-chat-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-chat-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--nm-accent); flex: none; }
.nm-chat-dot.nm-live { animation: nm-pulse 1.2s ease-in-out infinite alternate; }
.nm-chat-mark { flex: none; font-size: 12px; color: var(--dsw-alias-state-warn-primary, #d98c1f); }
.nm-chat-more { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; border: 0; padding: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; opacity: 0; }
.nm-chat-row:hover .nm-chat-more, .nm-chat-more:focus-visible, .nm-chat-more[aria-expanded="true"] { opacity: 1; }
.nm-chat-more:hover { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
.nm-chat-row:hover .nm-chat-title { padding-right: 22px; }
.nm-chat-edit { flex: 1; min-width: 0; height: 30px; margin: 2px 4px; padding: 0 8px; border: 1px solid var(--nm-blue); border-radius: 7px; background: var(--nm-field); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; outline: none; }

/* ---- the pinned agent header over the conversation -------------------- */
header[data-window-drag]:has(.nm-header) { position: relative; min-height: 108px; }
.nm-header { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 3px; pointer-events: none; z-index: 2; max-width: min(60%, 520px); }
.nm-header > * { pointer-events: auto; }
.nm-header-face { position: relative; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 0; padding: 0; background: transparent; cursor: pointer; box-shadow: 0 0 0 2px transparent; transition: box-shadow 300ms; }
.nm-header-face.nm-live { box-shadow: 0 0 0 2px var(--nm-accent); }
.nm-header-face.nm-wait { box-shadow: 0 0 0 2px var(--dsw-alias-state-warn-primary, #d98c1f); }
.nm-header-face:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: 2px; }
.nm-header-name { font-size: 14px; font-weight: 600; line-height: 1.2; color: var(--dsw-alias-label-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.nm-header-status { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 1.2; color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.nm-header-status.nm-live { color: var(--dsw-alias-label-secondary); }
.nm-header-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 8px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); }
.nm-header-chip.nm-live { background: color-mix(in srgb, var(--nm-blue) 28%, var(--dsw-alias-bg-layer-2)); }
.nm-header-chip.nm-wait { background: color-mix(in srgb, #d98c1f 25%, var(--dsw-alias-bg-layer-2)); }
.nm-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-label-dimmed); flex: none; }
.nm-status-dot.nm-on { background: var(--dsw-alias-state-success-primary, #2f9e5f); }
.nm-status-dot.nm-live { background: var(--nm-accent); animation: nm-pulse 1.2s ease-in-out infinite alternate; }
.nm-status-dot.nm-wait { background: var(--dsw-alias-state-warn-primary, #d98c1f); }
@keyframes nm-pulse { from { opacity: 0.45; transform: scale(0.85); } to { opacity: 1; transform: scale(1.1); } }
.nm-stop { display: inline-flex; align-items: center; gap: 4px; margin-left: 4px; padding: 1px 8px 1px 5px; border-radius: 999px; border: 1px solid var(--dsw-alias-interactive-bg-active); background: var(--nm-base); color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; cursor: pointer; }
.nm-stop:hover { background: var(--nm-hover); }
.nm-stop:disabled { opacity: 0.5; cursor: default; }
.nm-invite { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px 0 10px; border: 0; border-radius: 999px; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; cursor: pointer; }
.nm-invite:hover { background: var(--dsw-alias-bg-layer-2); }
.nm-invite-card { display: flex; flex-direction: column; gap: 14px; }
.nm-invite-code { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; background: var(--dsw-alias-bg-layer-2); font-size: 22px; font-weight: 600; letter-spacing: 0.12em; }
.nm-invite-code .nm-pill { margin-left: auto; letter-spacing: 0; }
.nm-invite-link { font-size: 13px; color: var(--dsw-alias-label-secondary); word-break: break-all; }

/* ---- the Muse conversation: the harness's DOM, Muse's shapes ----------- */
/* The composer card becomes one pill: + | the text | send. */
html[data-nm-muse] [data-composer-card] { display: flex !important; flex-direction: row !important; flex-wrap: wrap; align-items: flex-end; gap: 2px 4px; padding: 5px 5px 5px 6px !important; border-radius: 26px !important; background: var(--nm-field) !important; box-shadow: 0 0 0 1px var(--nm-field-border), 0 6px 24px rgba(0,0,0,0.10) !important; }
html[data-nm-muse] [data-composer-card] > [data-input-scroll] { flex: 1 1 120px; min-width: 0; order: 0; margin: 0 !important; }
html[data-nm-muse] [data-composer-card] > [data-input-scroll] [contenteditable] { min-height: 34px !important; padding: 5px 6px 5px 8px !important; }
html[data-nm-muse] [data-composer-card] [data-composer-placeholder] { inset: 5px 6px auto 8px !important; }
html[data-nm-muse] [data-composer-card] > div:last-child { display: contents; }
html[data-nm-muse] [data-composer-card] > div:last-child > div:first-child { order: -1; gap: 2px; }
html[data-nm-muse] [data-composer-card] > div:last-child > div:last-child { order: 1; margin-left: 0 !important; }
html[data-nm-muse] [data-composer-card] > [class*="_rail"] { flex-basis: 100%; order: -2; }
html[data-nm-muse] [data-composer-card] > [class*="_accessory"] { flex-basis: 100%; order: -3; padding-top: 4px !important; }
html[data-nm-muse] [data-composer-card] [class*="_modes"] { display: none !important; }
html[data-nm-muse] [data-composer-card] [class*="_standardControls"] { display: none !important; }
html[data-nm-muse] [data-composer-card] [class*="_activity"] { display: none !important; }
html[data-nm-muse] [data-composer-card] [class*="_add"] { width: 34px; height: 34px; border-radius: 50%; color: var(--dsw-alias-label-secondary); }
html[data-nm-muse] [data-composer-card] [class*="_primary"] { width: 34px; height: 34px; transform: none !important; background: var(--nm-send) !important; color: var(--nm-base) !important; }
html[data-nm-muse] [data-composer-card] [class*="_primary"]:disabled { background: var(--nm-send-idle) !important; opacity: 1 !important; color: var(--nm-base) !important; }
html[data-nm-muse] [data-composer-card] ~ [class*="_dock"] { display: none !important; }
/* The user's words: a tinted bubble on the right. The agent's: a quiet grey one. */
html[data-nm-muse] [data-chat-flow-kind="user"] [class*="_bubble"] { background: var(--nm-user-bubble) !important; color: var(--dsw-alias-label-primary); border-radius: 18px !important; padding: 9px 14px !important; }
html[data-nm-muse] [data-chat-flow-kind="assistant-step"] > [class*="_root"] > [class*="_body"] { width: fit-content; max-width: 100%; box-sizing: border-box; background: var(--nm-agent-bubble); border-radius: 20px; padding: 10px 16px; }
html[data-nm-muse] [data-chat-flow-kind="assistant-step"] > [class*="_root"] > [class*="_body"]:empty { display: none; }
/* The approval card: a dark rounded card with a shield, Allow in blue. */
html[data-nanomuse] [data-approval-key] > div { background: var(--nm-card) !important; border-radius: 18px !important; box-shadow: 0 10px 30px rgba(0,0,0,0.18) !important; padding: 14px 16px !important; }
html[data-nanomuse] [data-approval-key] > div > :first-child { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
html[data-nanomuse] [data-approval-key] > div > :first-child::before { content: ''; display: inline-block; width: 16px; height: 16px; margin-right: 6px; vertical-align: -3px; background: currentColor; -webkit-mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 5 6.2v5.3c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6.2z"/><path d="m9 12 2 2 4-4"/></svg>') center / contain no-repeat; mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 5 6.2v5.3c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6.2z"/><path d="m9 12 2 2 4-4"/></svg>') center / contain no-repeat; }
html[data-nanomuse] [data-approval-key] [data-approval-scroll] > :first-child { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
html[data-nanomuse] [data-approval-key] > div > :last-child button { border-radius: 999px !important; min-height: 36px; padding: 0 20px !important; font-weight: 500; }

/* ---- the profile drawer ------------------------------------------------ */
.nm-pf { position: fixed; top: 0; right: 0; bottom: 0; width: 310px; z-index: 60; display: flex; flex-direction: column; background: var(--nm-base); color: var(--dsw-alias-label-primary); border-left: 1px solid var(--nm-divider); box-shadow: -12px 0 40px rgba(0,0,0,0.18); outline: none; animation: nm-slide-in 180ms ease-out; }
@keyframes nm-slide-in { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.nm-pf-top { flex: none; display: flex; align-items: center; padding: 10px 10px 0; min-height: 40px; }
html[data-platform='darwin'] .nm-pf-top { padding-top: 12px; }
.nm-pf-head { flex: none; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 6px 20px 16px; }
.nm-pf-face { position: relative; }
.nm-pf-pen { position: absolute; right: -2px; bottom: 0; width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--nm-base); background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.nm-pf-pen:hover { background: var(--nm-blue); color: #fff; }
.nm-pf-menu { position: absolute; left: 50%; top: calc(100% + 6px); transform: translateX(-50%); min-width: 160px; }
.nm-pf-name { font-size: 18px; font-weight: 600; margin-top: 4px; }
.nm-pf-status { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--dsw-alias-label-secondary); }
.nm-pf .nm-seg { align-self: center; margin: 0 20px 10px; }
.nm-pf-body { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 16px 20px; }
.nm-pf-day { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: var(--dsw-alias-label-tertiary); padding: 10px 4px 6px; }
.nm-pf-rows { display: flex; flex-direction: column; gap: 2px; }
.nm-pf-row { display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-radius: 10px; }
.nm-pf-row:hover { background: var(--nm-hover); }
.nm-pf-row-icon { width: 32px; height: 32px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); flex: none; }
.nm-pf-row-icon.nm-live { color: var(--nm-accent); }
.nm-pf-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.nm-pf-row-title { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-pf-row-sub { font-size: 12px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-pf-row-sub.nm-wrap { white-space: normal; line-height: 1.45; }
.nm-pf-empty { font-size: 13px; line-height: 1.55; color: var(--dsw-alias-label-tertiary); margin: 6px 4px; }
.nm-pf-stack { display: flex; flex-direction: column; gap: 10px; }
.nm-pf-label { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-tertiary); }
.nm-pf-actions { display: flex; gap: 8px; }
.nm-pf-preview { display: flex; justify-content: center; padding: 6px 0; }
.nm-pf-choices { display: flex; flex-wrap: wrap; gap: 6px; }
.nm-pf-choice { width: 36px; height: 36px; border-radius: 10px; border: 2px solid transparent; background: var(--dsw-alias-bg-layer-2); font-size: 20px; cursor: pointer; }
.nm-pf-choice.nm-active { border-color: var(--nm-blue); }
.nm-pf-swatch { width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; box-shadow: 0 0 0 1px rgba(0,0,0,0.12); }
.nm-pf-swatch.nm-active { border-color: var(--dsw-alias-label-primary); }

/* ---- the devices page ------------------------------------------------- */
.nm-page { height: 100%; min-height: 0; overflow: auto; box-sizing: border-box; padding: 28px 32px 40px; color: var(--dsw-alias-label-primary); }
.nm-page-inner { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.nm-page h1 { font-size: 22px; font-weight: 600; margin: 0; }
.nm-page h2 { font-size: 13px; font-weight: 600; margin: 10px 0 0; color: var(--dsw-alias-label-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
.nm-lead { font-size: 14px; line-height: 1.55; color: var(--dsw-alias-label-secondary); margin: 0; }
.nm-card { background: var(--nm-card); border-radius: var(--nm-radius); padding: 4px 14px; }
.nm-row { display: flex; align-items: center; gap: 12px; padding: 11px 0; font-size: 14px; border-bottom: 1px solid var(--nm-divider); }
.nm-row:last-child { border-bottom: 0; }
.nm-row-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); flex: none; }
.nm-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.nm-row-title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-row-sub { font-size: 12.5px; line-height: 1.45; color: var(--dsw-alias-label-tertiary); }
.nm-row-sub.nm-wrap { white-space: normal; }
.nm-row-chevron { color: var(--dsw-alias-label-tertiary); flex: none; }
.nm-row-link { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 0; border: 0; border-bottom: 1px solid var(--nm-divider); background: transparent; color: inherit; font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.nm-row-link:last-child { border-bottom: 0; }
.nm-row-link:hover .nm-row-title { color: var(--nm-blue); }
.nm-switch { position: relative; width: 40px; height: 24px; border-radius: 999px; border: 0; padding: 0; background: var(--dsw-alias-bg-layer-3); cursor: pointer; transition: background 120ms; flex: none; }
.nm-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 120ms; }
.nm-switch[aria-checked="true"] { background: var(--nm-blue); }
.nm-switch[aria-checked="true"]::after { transform: translateX(16px); }
.nm-switch:disabled { opacity: 0.5; cursor: default; }

/* ---- settings dialog -------------------------------------------------- */
.nm-settings-overlay { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; }
.nm-settings-mask { position: absolute; inset: 0; background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.3)); }
.nm-settings { position: relative; width: min(900px, calc(100vw - 48px)); height: min(620px, calc(100vh - 48px)); display: flex; border-radius: 18px; overflow: hidden; background: var(--nm-base); color: var(--dsw-alias-label-primary); box-shadow: 0 24px 80px rgba(0,0,0,0.35), 0 0 0 1px var(--nm-divider); outline: none; }
.nm-settings-nav { width: 212px; flex: none; display: flex; flex-direction: column; background: var(--nm-base); border-right: 1px solid var(--nm-divider); padding: 18px 10px 12px; box-sizing: border-box; overflow: auto; }
.nm-settings-title { font-size: 16px; font-weight: 600; padding: 0 10px 12px; outline: none; }
.nm-settings-group { font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); padding: 12px 10px 6px; }
.nm-settings-cell { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; text-align: left; padding: 8px 10px; border-radius: 10px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 14px; cursor: pointer; }
.nm-settings-cell:hover { background: var(--nm-hover); color: var(--dsw-alias-label-primary); }
.nm-settings-cell.nm-active { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
.nm-settings-cell.nm-danger { color: var(--dsw-alias-state-error-primary, #d2453d); }
.nm-settings-cell svg { flex: none; }
.nm-settings-cell-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-settings-foot { margin-top: auto; padding-top: 10px; }
.nm-settings-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.nm-settings-head { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 12px 14px 0; min-height: 36px; }
.nm-settings-body { flex: 1; min-height: 0; overflow: auto; padding: 8px 28px 28px; }
.nm-settings-body > * { max-width: 560px; }
.nm-settings-body .nm-page { padding: 0; height: auto; overflow: visible; }
.nm-settings-body .nm-page h1 { display: none; }
.nm-general { display: flex; flex-direction: column; }
.nm-close { width: 30px; height: 30px; border: 0; padding: 0; border-radius: 50%; background: var(--nm-hover); color: var(--dsw-alias-label-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.nm-close:hover { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
.nm-advanced-note { font-size: 12.5px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); margin: 0 0 14px; }
.nm-section { display: flex; flex-direction: column; gap: 16px; }
.nm-section h2 { font-size: 13px; font-weight: 600; margin: 8px 0 -8px; color: var(--dsw-alias-label-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
.nm-section p { font-size: 13.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary); margin: 0; }

/* ---- the first run: the whole window ----------------------------------- */
.nm-ob { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; background: var(--nm-base); color: var(--dsw-alias-label-primary); font-family: var(--nm-font); outline: none; animation: nm-fade-in 220ms ease-out; }
.nm-ob.nm-ob-fading { opacity: 0; transition: opacity 240ms ease-in; }
@keyframes nm-fade-in { from { opacity: 0; } to { opacity: 1; } }
.nm-ob-drag { position: absolute; top: 0; left: 0; right: 0; height: 40px; }
.nm-ob-center { display: flex; flex-direction: column; align-items: center; gap: 18px; width: min(360px, calc(100vw - 48px)); text-align: center; animation: nm-rise 260ms ease-out; }
@keyframes nm-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.nm-ob-title { font-size: 26px; font-weight: 600; letter-spacing: -0.01em; margin: 6px 0 2px; line-height: 1.25; }
.nm-ob-title-sm { font-size: 22px; }
.nm-ob-sub { font-size: 14px; line-height: 1.55; color: var(--dsw-alias-label-secondary); margin: -6px 0 0; }
.nm-ob-cta { min-width: 132px; margin-top: 6px; }
.nm-ob-wide { width: 100%; }
.nm-ob-form { gap: 14px; }
.nm-ob-form .nm-ob-title { margin-bottom: 8px; }
.nm-ob-fine { font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-tertiary); margin: -4px 0 0; }
.nm-ob-fine a { color: var(--dsw-alias-label-secondary); text-decoration: underline; text-underline-offset: 2px; }
.nm-ob-links { display: flex; align-items: center; gap: 10px; margin-top: 2px; }
.nm-ob-sep { color: var(--dsw-alias-label-dimmed); }
.nm-ob-link { border: 0; background: transparent; padding: 6px 8px; border-radius: 8px; color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 13px; cursor: pointer; }
.nm-ob-link:hover { color: var(--dsw-alias-label-primary); background: var(--nm-hover); }
.nm-ob-link.nm-inline { padding: 0 2px; font-size: 12px; text-decoration: underline; text-underline-offset: 2px; }
.nm-ob-link.nm-inline:hover { background: transparent; }
.nm-ob-link:disabled { opacity: 0.5; cursor: default; }
.nm-ob-error { font-size: 13px; color: var(--dsw-alias-state-error-primary, #d2453d); }
.nm-code { position: relative; display: flex; gap: 8px; justify-content: center; cursor: text; }
.nm-code-input { position: absolute; inset: 0; width: 100%; opacity: 0; border: 0; font-size: 16px; }
.nm-code-box { width: 46px; height: 54px; border-radius: 12px; background: var(--nm-field); border: 1px solid var(--nm-field-border); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 600; transition: border-color 120ms; }
.nm-code:focus-within .nm-code-caret { border-color: var(--nm-blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--nm-blue) 25%, transparent); }
.nm-ob-slide-wrap { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.nm-ob-pager { position: absolute; top: 16px; right: 18px; display: flex; gap: 6px; }
html[data-platform='darwin'] .nm-ob-pager { top: 14px; }
.nm-ob-pager-btn { width: 30px; height: 30px; border: 0; border-radius: 50%; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.nm-ob-pager-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
.nm-ob-pager-btn:disabled { opacity: 0.35; cursor: default; }
.nm-ob-slide { width: min(400px, calc(100vw - 48px)); gap: 14px; }
.nm-ob-card { width: 100%; box-sizing: border-box; border-radius: 16px; background: var(--nm-card); padding: 2px 14px; text-align: left; box-shadow: 0 0 0 1px var(--nm-divider); }
.nm-ob-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--nm-divider); }
.nm-ob-row:last-child { border-bottom: 0; }
.nm-ob-row-icon { width: 34px; height: 34px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); flex: none; }
.nm-ob-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.nm-ob-row-title { font-size: 14px; font-weight: 500; }
.nm-ob-row-sub { font-size: 12.5px; color: var(--dsw-alias-label-tertiary); }
.nm-ob-path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
.nm-ob-granted { width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, #2f9e5f 22%, transparent); color: #2f9e5f; flex: none; }
.nm-ob-granted.nm-ob-pending { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-dimmed); }
.nm-art { display: block; margin: 0 auto 4px; }
.nm-art-back { fill: var(--dsw-alias-bg-layer-2); }
.nm-art-mid { fill: var(--dsw-alias-bg-layer-3); }
.nm-art-front { fill: var(--nm-card); stroke: var(--nm-divider); }
.nm-art-dot { fill: var(--dsw-alias-label-dimmed); }
.nm-art-line { fill: var(--dsw-alias-bg-layer-3); }
.nm-art-cursor { fill: var(--dsw-alias-label-primary); }
.nm-art-accent { fill: var(--nm-accent); }
.nm-art-link { stroke: var(--nm-accent); stroke-width: 2.5; stroke-dasharray: 4 6; stroke-linecap: round; }

/* ---- menus we draw ---------------------------------------------------- */
.nm-menu { position: fixed; z-index: 80; min-width: 200px; padding: 6px; border-radius: 12px; background: var(--dsw-alias-bg-layer-3, var(--nm-base)); color: var(--dsw-alias-label-primary); box-shadow: 0 12px 40px rgba(0,0,0,0.28), 0 0 0 1px var(--nm-divider); display: flex; flex-direction: column; gap: 1px; }
.nm-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; text-align: left; padding: 8px 10px; border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 13.5px; cursor: pointer; }
.nm-menu-item:hover, .nm-menu-item:focus-visible { background: var(--nm-hover); outline: none; }
.nm-menu-item svg { color: var(--dsw-alias-label-secondary); flex: none; }
.nm-menu-item-label { flex: 1; min-width: 0; }
.nm-menu-sep { height: 1px; margin: 4px 6px; background: var(--nm-divider); }
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
    root.removeAttribute('data-nm-muse')
    root.style.removeProperty('--nm-accent')
  }
}
