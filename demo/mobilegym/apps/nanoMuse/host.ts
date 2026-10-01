import { NANOMUSE_CONFIG } from './data';
import { endDemoSession } from './demo';
import { useNanoMuseStore, type DemoRecord, type LinkState } from './state';

/**
 * The phone as a guest of a page.
 *
 * The showcase site puts the simulator in a frame and wraps a page around it — what the Muse
 * can do here, a few things to try, how long the session has. Same origin, so that page talks
 * to this app through `window.__NANOMUSE__` on the frame's window (the way MobileGym itself
 * exposes `__OS__` and `__SIM_INPUT__`) and hears from it through `subscribe`:
 *
 *   open()           bring the nanoMuse app to the front
 *   draft(text)      open it and put `text` in the chat's composer — sending is the person's tap
 *   reset()          end the hosted session and start a fresh Muse
 *   state()          where things stand: configured, link, the hosted session, the web app
 *   subscribe(fn)    fn(state) now and on every change; returns the unsubscribe
 *
 * The web app inside the phone is on another origin (the session's hostname); the draft goes
 * to it with postMessage, which it accepts from its parent window only, and it says
 * `nanomuse:ready` when it has a composer to put the text in — a draft handed over before
 * that waits.
 */

export type WebState = 'closed' | 'loading' | 'ready';

export interface HostState {
  /** A server is configured (hosted or your own). */
  configured: boolean;
  link: LinkState;
  /** The hosted showcase session, when this phone is on one. */
  demo: DemoRecord | null;
  /** The web app in the frame. */
  web: WebState;
  /** The agent's name, as the web app reported it ("" until then). */
  name: string;
  /** Whether a hosted showcase is available at all (set at build time). */
  hosted: boolean;
}

type Listener = (state: HostState) => void;

const listeners = new Set<Listener>();
let frame: HTMLIFrameElement | null = null;
let web: WebState = 'closed';
let name = '';
let queued: string | null = null;

function current(): HostState {
  const s = useNanoMuseStore.getState();
  return {
    configured: !!s.serverUrl,
    link: s.link,
    demo: s.demo,
    web,
    name,
    hosted: !!NANOMUSE_CONFIG.demoGateway,
  };
}

function notify() {
  const state = current();
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('[nanoMuse host] listener failed', err);
    }
  }
}

function webOrigin(): string {
  try {
    return new URL(useNanoMuseStore.getState().serverUrl).origin;
  } catch {
    return '*';
  }
}

function post(text: string) {
  frame?.contentWindow?.postMessage({ type: 'nanomuse:draft', text }, webOrigin());
}

/** MusePage mounts and unmounts the web app's frame here. */
export function attachFrame(el: HTMLIFrameElement | null) {
  frame = el;
  web = el ? 'loading' : 'closed';
  if (!el) name = '';
  notify();
}

function openApp() {
  const os = (window as unknown as { __OS__?: { launchApp?: (id: string) => void } }).__OS__;
  os?.launchApp?.(NANOMUSE_CONFIG.appId);
}

function draft(text: string) {
  const clean = String(text ?? '').slice(0, 4000);
  if (!clean) return;
  openApp();
  if (web === 'ready') post(clean);
  else queued = clean;
}

async function reset() {
  const s = useNanoMuseStore.getState();
  if (s.demo && NANOMUSE_CONFIG.demoGateway) {
    await endDemoSession(NANOMUSE_CONFIG.demoGateway, s.demo.id, s.token);
  }
  queued = null;
  s.disconnect();
  openApp();
}

function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  try {
    fn(current());
  } catch (err) {
    console.error('[nanoMuse host] listener failed', err);
  }
  return () => {
    listeners.delete(fn);
  };
}

export const host = { open: openApp, draft, reset, state: current, subscribe };

/**
 * Called once by `state.ts` after the store exists (the two modules import each other, so
 * nothing here may touch the store while modules are still being evaluated).
 */
export function installHost() {
  window.addEventListener('message', (ev: MessageEvent) => {
    if (!frame || ev.source !== frame.contentWindow) return;
    const data = ev.data as { type?: unknown; name?: unknown } | null;
    if (!data || data.type !== 'nanomuse:ready') return;
    web = 'ready';
    name = typeof data.name === 'string' ? data.name : '';
    if (queued) {
      post(queued);
      queued = null;
    }
    notify();
  });
  useNanoMuseStore.subscribe((s, prev) => {
    if (s.serverUrl !== prev.serverUrl || s.link !== prev.link || s.demo !== prev.demo) notify();
  });
  (window as unknown as { __NANOMUSE__?: typeof host }).__NANOMUSE__ = host;
}
