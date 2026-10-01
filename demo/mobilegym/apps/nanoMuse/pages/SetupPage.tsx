import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IcLauncher, IcLink, IcRetry } from '../res/icons';
import { parseServerInput, useNanoMuseStore } from '../state';
import { useNanoMuseGestures } from '../hooks/useNanoMuseGestures';
import { NANOMUSE_CONFIG } from '../data';
import { DemoError, fetchDemoInfo, startDemoSession, type DemoInfo, type DemoProvider } from '../demo';
import { fmt, useNanoMuseStrings } from '../res/strings';

/**
 * Connect the phone to a nanoMuse server.
 *
 * On the hosted showcase (`demoGateway` set at build time) the page first offers a private
 * Muse on the showcase's server — started on its own the first time, one tap after that — with
 * the option of using your own model key. Below that, or on its own in a normal checkout, is
 * the form for your own server: paste the link `nanomuse serve` prints (it carries the token),
 * or type the address and token separately. The token is checked by opening the server's
 * WebSocket once — the same thing the notification bridge does — so no CORS setup is needed.
 */
export default function SetupPage() {
  const current = useNanoMuseStore((s) => s.serverUrl);
  const currentToken = useNanoMuseStore((s) => s.token);
  const configure = useNanoMuseStore((s) => s.configure);
  const gui = useNanoMuseStore((s) => s.gui);
  const setGui = useNanoMuseStore((s) => s.setGui);
  const { go } = useNanoMuseGestures();
  const demo = useNanoMuseStore((s) => s.demo);
  const gateway = NANOMUSE_CONFIG.demoGateway;
  const s = useNanoMuseStrings();

  // the form is for your own server; a hosted session's address is not something to type back
  const [address, setAddress] = useState(current && !demo ? current : 'http://127.0.0.1:8787');
  const [token, setToken] = useState(demo ? '' : currentToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseServerInput(address);
    const finalToken = (parsed.token || token).trim();
    if (!parsed.serverUrl) {
      setError(s.setup_need_address);
      return;
    }
    setBusy(true);
    setError('');
    const result = await probe(parsed.serverUrl, finalToken);
    setBusy(false);
    if (result !== 'ok') {
      setError(result === 'unauthorized' ? s.setup_refused : fmt(s.setup_unreachable, parsed.serverUrl));
      return;
    }
    configure(parsed.serverUrl, finalToken);
    go('muse.open');
  };

  return (
    <div className="h-full w-full flex flex-col bg-app-bg text-app-text pt-10" data-status-bar-foreground="dark">
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="mt-8 mb-8 flex flex-col items-center text-center">
          <div
            className="w-20 h-20 rounded-[24px] flex items-center justify-center shadow-lg mb-5"
            style={{ background: 'linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)' }}
          >
            <IcLauncher size={40} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{gateway ? s.setup_title_hosted : s.setup_title_own}</h1>
          <p className="mt-2 text-[14px] text-app-text-muted leading-snug">{gateway ? s.setup_sub_hosted : s.setup_sub_own}</p>
        </div>

        {gateway && (
          <HostedDemo
            gateway={gateway}
            autoStart={!current}
            onReady={(serverUrl, sessionToken, demo) => {
              configure(serverUrl, sessionToken, demo);
              go('muse.open');
            }}
          />
        )}

        {gateway && (
          <div className="my-6 flex items-center gap-3 text-[12px] text-app-text-muted">
            <div className="h-px flex-1 bg-app-border" />
            {s.setup_or_own}
            <div className="h-px flex-1 bg-app-border" />
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-app-text-muted">{s.setup_address}</span>
            <input
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="http://127.0.0.1:8787/?token=…"
              className="h-12 rounded-2xl bg-app-surface border border-app-border px-4 text-[15px] outline-none focus:border-app-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-app-text-muted">{s.setup_token}</span>
            <input
              type="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={s.setup_token_hint}
              className="h-12 rounded-2xl bg-app-surface border border-app-border px-4 text-[15px] outline-none focus:border-app-primary"
            />
          </label>

          {error && <p className="text-[13px] text-rose-600 leading-snug">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className={`mt-2 h-12 rounded-2xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60 ${
              gateway
                ? 'bg-app-surface border border-app-border text-app-text'
                : 'bg-app-primary text-app-on-primary'
            }`}
          >
            <IcLink size={18} />
            {busy ? s.setup_connecting : s.setup_connect}
          </button>
        </form>

        <label className="mt-6 rounded-2xl bg-app-surface border border-app-border p-4 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={gui}
            onChange={(e) => setGui(e.target.checked)}
            className="mt-1 h-4 w-4 accent-app-primary"
          />
          <span className="text-[13px] leading-relaxed text-app-text-muted">
            <span className="font-medium text-app-text block mb-0.5">{s.setup_gui_title}</span>
            {s.setup_gui_detail}
          </span>
        </label>

        <div className="mt-4 rounded-2xl bg-app-surface border border-app-border p-4 text-[13px] text-app-text-muted leading-relaxed">
          <p className="font-medium text-app-text mb-1">{s.setup_computer_title}</p>
          <p>{s.setup_computer_detail}</p>
        </div>
      </div>
    </div>
  );
}

type Phase = 'idle' | 'starting' | 'failed';

/** The card for a Muse on the showcase server, with the option of your own model key. */
function HostedDemo({
  gateway,
  autoStart,
  onReady,
}: {
  gateway: string;
  autoStart: boolean;
  onReady: (serverUrl: string, token: string, demo: { id: string; expiresAt: number; byok: boolean }) => void;
}) {
  const s = useNanoMuseStrings();
  const [info, setInfo] = useState<DemoInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [ownKey, setOwnKey] = useState(false);
  const [provider, setProvider] = useState<DemoProvider>({
    base_url: 'https://api.deepseek.com',
    api_key: '',
    model: 'deepseek-flash',
  });
  const started = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchDemoInfo(gateway)
      .then((i) => alive && setInfo(i))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [gateway]);

  const start = async (withProvider?: DemoProvider) => {
    setPhase('starting');
    setMessage('');
    try {
      const s = await startDemoSession(gateway, withProvider);
      onReady(s.serverUrl, s.token, { id: s.id, expiresAt: s.expiresAt, byok: s.byok });
    } catch (err) {
      setPhase('failed');
      if (err instanceof DemoError) {
        const known = (s as Record<string, string>)[`demo_${err.code}`];
        setMessage(known ?? err.message);
        // no demo key on this server: the visitor has to bring one
        if (err.code === 'no_model') setOwnKey(true);
      } else {
        setMessage(s.hosted_failed);
      }
    }
  };

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void start();
    }
    // the first visit starts on its own; after that it is a tap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const minutes = info ? Math.round(info.session_ttl_s / 60) : null;
  const canOwnKey = info?.byok ?? true;
  const ready = !ownKey || (provider.base_url.trim() && provider.api_key.trim() && provider.model.trim());

  return (
    <div className="rounded-2xl bg-app-surface border border-app-border p-4 flex flex-col gap-3">
      <div>
        <p className="font-medium text-app-text">{s.hosted_title}</p>
        <p className="mt-0.5 text-[13px] text-app-text-muted leading-relaxed">
          {minutes ? fmt(s.hosted_minutes, minutes) : s.hosted_a_while}
          {s.hosted_then_gone}
          {info?.demo_model ? fmt(s.hosted_thinks_with, info.demo_model) : ''}
          {info ? fmt(s.hosted_in_use, info.active_sessions, info.max_sessions) : ''}
        </p>
      </div>

      {canOwnKey && (
        <label className="flex items-start gap-3 cursor-pointer text-[13px] text-app-text-muted leading-relaxed">
          <input
            type="checkbox"
            checked={ownKey}
            onChange={(e) => setOwnKey(e.target.checked)}
            className="mt-1 h-4 w-4 accent-app-primary"
          />
          <span>
            <span className="font-medium text-app-text block mb-0.5">{s.hosted_own_key}</span>
            {s.hosted_own_key_detail}
          </span>
        </label>
      )}

      {ownKey && (
        <div className="flex flex-col gap-2">
          <input
            type="url"
            inputMode="url"
            autoCapitalize="off"
            spellCheck={false}
            value={provider.base_url}
            onChange={(e) => setProvider({ ...provider, base_url: e.target.value })}
            placeholder={s.hosted_base_url}
            className="h-11 rounded-xl bg-app-bg border border-app-border px-3 text-[14px] outline-none focus:border-app-primary"
          />
          <input
            type="text"
            autoCapitalize="off"
            spellCheck={false}
            value={provider.model}
            onChange={(e) => setProvider({ ...provider, model: e.target.value })}
            placeholder={s.hosted_model}
            className="h-11 rounded-xl bg-app-bg border border-app-border px-3 text-[14px] outline-none focus:border-app-primary"
          />
          <input
            type="password"
            autoCapitalize="off"
            spellCheck={false}
            value={provider.api_key}
            onChange={(e) => setProvider({ ...provider, api_key: e.target.value })}
            placeholder={s.hosted_api_key}
            className="h-11 rounded-xl bg-app-bg border border-app-border px-3 text-[14px] outline-none focus:border-app-primary"
          />
          {info && info.byok_hosts.length > 0 && (
            <p className="text-[11.5px] text-app-text-muted leading-snug">
              {fmt(s.hosted_providers, info.byok_hosts.join(', '))}
            </p>
          )}
        </div>
      )}

      {message && <p className="text-[13px] text-rose-600 leading-snug">{message}</p>}

      <button
        type="button"
        disabled={phase === 'starting' || !ready}
        onClick={() => void start(ownKey ? provider : undefined)}
        className="h-12 rounded-2xl bg-app-primary text-app-on-primary font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60"
      >
        {phase === 'starting' ? (
          <>
            <IcRetry size={18} className="animate-spin" />
            {s.hosted_starting}
          </>
        ) : (
          <>
            <IcLauncher size={18} />
            {phase === 'failed' ? s.hosted_retry : s.hosted_start}
          </>
        )}
      </button>
    </div>
  );
}

/** Open the server's WebSocket once: `hello` means reachable and the token is good. */
function probe(serverUrl: string, token: string): Promise<'ok' | 'unauthorized' | 'unreachable'> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(serverUrl);
    } catch {
      resolve('unreachable');
      return;
    }
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    url.search = token ? `?token=${encodeURIComponent(token)}` : '';
    let done = false;
    let ws: WebSocket | null = null;
    const finish = (r: 'ok' | 'unauthorized' | 'unreachable') => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // ignore
      }
      resolve(r);
    };
    const timer = setTimeout(() => finish('unreachable'), 6000);
    try {
      ws = new WebSocket(url.toString());
    } catch {
      finish('unreachable');
      return;
    }
    ws.onmessage = () => finish('ok');
    ws.onclose = (ev) => finish(ev.code === 4401 ? 'unauthorized' : 'unreachable');
    ws.onerror = () => {
      /* onclose follows */
    };
  });
}
