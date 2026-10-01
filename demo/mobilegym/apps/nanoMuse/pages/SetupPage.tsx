import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { dragonIdle, IcBack, IcChat, IcHands, IcKey, IcReach, IcRetry } from '../res/icons';
import { parseServerInput, useNanoMuseStore } from '../state';
import { useNanoMuseGestures } from '../hooks/useNanoMuseGestures';
import { NANOMUSE_CONFIG } from '../data';
import { DemoError, fetchDemoInfo, startDemoSession, type DemoInfo, type DemoProvider } from '../demo';
import { fmt, useNanoMuseStrings } from '../res/strings';

/**
 * The first page — the Android app's welcome page (ui/onboarding/FirstRunSetup.kt), with the
 * same face, title, line, three rows and pill. On the hosted showcase (`demoGateway` set at
 * build time) the pill starts a private Muse on the showcase's server — on its own the first
 * time, a tap after that — and "I have my own API key" opens the three fields for one's own
 * model. "Connect your own nanoMuse" leads to the form for a server of one's own: paste the
 * link `nanomuse serve` prints (it carries the token), or the address and token separately.
 * The token is checked by opening the server's WebSocket once — the same thing the
 * notification bridge does — so no CORS setup is needed. In a normal checkout that form is
 * the whole page.
 */
export default function SetupPage() {
  const current = useNanoMuseStore((s) => s.serverUrl);
  const demo = useNanoMuseStore((s) => s.demo);
  const gateway = NANOMUSE_CONFIG.demoGateway;
  const [own, setOwn] = useState(!gateway || Boolean(current && !demo));

  if (gateway && !own) {
    return <WelcomePage gateway={gateway} autoStart={!current} onOwnServer={() => setOwn(true)} />;
  }
  return <OwnServerPage onBack={gateway ? () => setOwn(false) : undefined} />;
}

type Phase = 'idle' | 'starting' | 'failed';

/** The welcome page with a Muse on the showcase server behind its pill. */
function WelcomePage({
  gateway,
  autoStart,
  onOwnServer,
}: {
  gateway: string;
  autoStart: boolean;
  onOwnServer: () => void;
}) {
  const configure = useNanoMuseStore((s) => s.configure);
  const { go } = useNanoMuseGestures();
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
      const session = await startDemoSession(gateway, withProvider);
      configure(session.serverUrl, session.token, { id: session.id, expiresAt: session.expiresAt, byok: session.byok });
      go('muse.open');
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
  const filled = Boolean(provider.base_url.trim() && provider.api_key.trim() && provider.model.trim());

  return (
    <Page
      hero={<FaceDisc />}
      title={s.setup_title}
      subtitle={s.welcome_tagline}
      message={message}
      primary={
        <Pill
          busy={phase === 'starting'}
          disabled={ownKey && !filled}
          onClick={() => void start(ownKey ? provider : undefined)}
        >
          {phase === 'starting' ? s.hosted_starting : phase === 'failed' ? s.hosted_retry : s.setup_start}
        </Pill>
      }
      secondary={
        canOwnKey ? (
          <TextButton onClick={() => setOwnKey(!ownKey)}>{ownKey ? s.hosted_showcase_model : s.setup_own_key}</TextButton>
        ) : null
      }
      finePrint={
        ownKey
          ? s.hosted_key_fine_print
          : minutes
            ? fmt(s.hosted_fine_print, minutes)
            : s.hosted_fine_print_a_while
      }
      link={<TextLink onClick={onOwnServer}>{s.setup_own_server}</TextLink>}
    >
      {ownKey ? (
        <div className="flex flex-col gap-2.5">
          <Field
            type="url"
            value={provider.base_url}
            onChange={(v) => setProvider({ ...provider, base_url: v })}
            placeholder={s.hosted_base_url}
          />
          <Field
            type="text"
            value={provider.model}
            onChange={(v) => setProvider({ ...provider, model: v })}
            placeholder={s.hosted_model}
          />
          <Field
            type="password"
            value={provider.api_key}
            onChange={(v) => setProvider({ ...provider, api_key: v })}
            placeholder={s.hosted_api_key}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <FeatureRow icon={<IcChat size={20} />} title={s.welcome_feat_chat} subtitle={s.welcome_feat_chat_sub} />
          <FeatureRow icon={<IcHands size={20} />} title={s.welcome_feat_hands} subtitle={s.welcome_feat_hands_sub} />
          <FeatureRow icon={<IcReach size={20} />} title={s.welcome_feat_reach} subtitle={s.welcome_feat_reach_sub} />
        </div>
      )}
    </Page>
  );
}

/** The form for a nanoMuse of one's own: the link `nanomuse serve` prints, or address + token. */
function OwnServerPage({ onBack }: { onBack?: () => void }) {
  const current = useNanoMuseStore((s) => s.serverUrl);
  const currentToken = useNanoMuseStore((s) => s.token);
  const demo = useNanoMuseStore((s) => s.demo);
  const configure = useNanoMuseStore((s) => s.configure);
  const { go } = useNanoMuseGestures();
  const s = useNanoMuseStrings();

  // a hosted session's address is not something to type back
  const [address, setAddress] = useState(current && !demo ? current : 'http://127.0.0.1:8787');
  const [token, setToken] = useState(demo ? '' : currentToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
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
    <Page
      onBack={onBack}
      hero={
        <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center" style={{ background: 'var(--nm-fill)' }}>
          <IcKey size={28} />
        </div>
      }
      title={s.setup_title_own}
      subtitle={s.setup_sub_own}
      message={error}
      primary={
        <Pill busy={busy} onClick={() => void submit()}>
          {busy ? s.setup_connecting : s.setup_connect}
        </Pill>
      }
      finePrint={s.setup_own_fine_print}
    >
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <Field type="url" value={address} onChange={setAddress} placeholder="http://127.0.0.1:8787/?token=…" label={s.setup_address} />
        <Field type="text" value={token} onChange={setToken} placeholder={s.setup_token_hint} label={s.setup_token} />
        <button type="submit" className="hidden" />
      </form>
    </Page>
  );
}

// ---- the pieces of the Android app's Page composable

/** Title, line, content, and the column at the bottom: the pill, a text button, fine print. */
function Page({
  hero,
  title,
  subtitle,
  children,
  message,
  primary,
  secondary,
  finePrint,
  link,
  onBack,
}: {
  hero: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
  message?: string;
  primary: ReactNode;
  secondary?: ReactNode;
  finePrint?: string;
  link?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <div
      className="h-full w-full flex flex-col bg-app-bg text-app-text pt-10"
      data-status-bar-foreground="dark"
      style={{ ['--nm-fill' as string]: '#f1f1f4', ['--nm-disc' as string]: '#f1efeb' }}
    >
      {onBack && (
        <button type="button" onClick={onBack} className="self-start ml-2 mt-1 p-2 rounded-full text-app-text active:bg-black/5" aria-label="back">
          <IcBack size={24} />
        </button>
      )}
      <div className="flex-1 overflow-y-auto px-6">
        <div className={`${onBack ? 'mt-2' : 'mt-8'} mb-5 flex flex-col items-center text-center`}>
          {hero}
          <h1 className="mt-5 text-[24px] font-semibold tracking-tight leading-tight">{title}</h1>
          <p className="mt-2 text-[14px] text-app-text-muted leading-snug">{subtitle}</p>
        </div>
        {children}
        {message && <p className="mt-4 text-[13px] text-rose-600 leading-snug">{message}</p>}
      </div>
      <div className="px-6 pb-7 pt-3 flex flex-col items-center gap-2">
        {primary}
        {secondary}
        {finePrint && <p className="text-[12px] text-app-text-muted text-center leading-snug">{finePrint}</p>}
        {link}
      </div>
    </div>
  );
}

/** The dragon's face at rest on its warm disc — AgentAvatarDisc(mood = IDLE, 104.dp). */
function FaceDisc() {
  return (
    <div className="w-[104px] h-[104px] rounded-full overflow-hidden flex items-center justify-center" style={{ background: 'var(--nm-disc)' }}>
      <img src={dragonIdle} alt="" width={104} height={104} className="w-full h-full object-cover" draggable={false} />
    </div>
  );
}

function FeatureRow({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <div className="w-10 h-10 rounded-full flex-none flex items-center justify-center text-app-text" style={{ background: 'var(--nm-fill)' }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-medium leading-snug">{title}</p>
        <p className="text-[13px] text-app-text-muted leading-[17px]">{subtitle}</p>
      </div>
    </div>
  );
}

/** The action pill: MuseTones.action, 50dp, fully round. */
function Pill({ busy, disabled, onClick, children }: { busy?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      className="w-full h-[50px] rounded-full bg-app-primary text-app-on-primary text-[16px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60"
    >
      {busy && <IcRetry size={18} className="animate-spin" />}
      {children}
    </button>
  );
}

function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="h-10 px-3 text-[14px] font-medium text-app-primary">
      {children}
    </button>
  );
}

function TextLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mt-1 text-[12.5px] text-app-text-muted underline underline-offset-2">
      {children}
    </button>
  );
}

function Field({
  type,
  value,
  onChange,
  placeholder,
  label,
}: {
  type: 'url' | 'text' | 'password';
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label?: string;
}) {
  const input = (
    <input
      type={type}
      inputMode={type === 'url' ? 'url' : undefined}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-12 w-full rounded-2xl bg-app-surface border border-app-border px-4 text-[15px] outline-none focus:border-app-primary"
    />
  );
  if (!label) return input;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-app-text-muted">{label}</span>
      {input}
    </label>
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
