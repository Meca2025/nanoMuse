import { Check, ExternalLink, MessageSquare, QrCode, RefreshCw, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  channelsApi,
  type ChannelField,
  type ChannelInfo,
  type ChannelsView,
  type LoginSession,
  type PendingPairing,
} from "../channels-api";
import { PageBar } from "../components/BackBar";
import { inputCls, primaryBtn, secondaryBtn } from "../components/Form";
import { MuseCaption, MuseCard, MuseDivider, MuseRow, MuseSectionLabel, MuseSwitchRow } from "../components/MuseList";
import { useLocale } from "../i18n";
import { useStore } from "../store";
import { cx } from "../util";

/**
 * Chat apps (「聊天入口」) — your nanoMuse inside Feishu, DingTalk, WeCom or Telegram
 * (docs/channels.md). One card per app: the switch, its credentials (secrets are written and
 * never shown again), who may talk to it, the chats that are paired and which of them get
 * what the Muse does on its own. Codes people were shown when they first wrote to the bot
 * wait at the top for a yes or a no.
 *
 * The strings live here rather than in i18n/zh-CN.ts so the screen can land without
 * touching the shared dictionary; `tr()` picks the Chinese line by the app's locale.
 */

const ZH: Record<string, string> = {
  "Chat apps": "聊天入口",
  "Talk to your Muse from the chat apps you already use. Nothing needs a public address: each app keeps a long connection open.":
    "在你已经在用的聊天软件里和 Muse 对话。不需要公网地址：每个应用各自保持一条长连接。",
  "Waiting for a yes": "等待通过",
  "{name} wrote to the bot. Approve to let them talk to your Muse.": "{name} 给机器人发了消息。通过后对方就能和 Muse 对话。",
  Approve: "通过",
  Deny: "拒绝",
  "Code {code}": "配对码 {code}",
  Off: "关闭",
  "Needs settings": "还缺设置",
  "Not installed": "未安装",
  "Connecting…": "连接中…",
  Connected: "已连接",
  Error: "出错",
  Missing: "缺少",
  "Switched on": "已开启",
  "Install on the computer running nanoMuse, then switch it on again:": "在运行 nanoMuse 的电脑上安装，再重新开启：",
  "Saved.": "已保存。",
  Save: "保存",
  Saving: "保存中",
  "Set; leave blank to keep": "已设置，留空则保持不变",
  "Clear the saved value": "清除已保存的值",
  "In groups, reply": "在群里回复",
  "only when @-mentioned": "只在被 @ 时",
  "to every message": "每条消息",
  "Always allowed (ids, one per line)": "免配对的 ID（每行一个）",
  "People listed here never need a pairing code. A lone * lets anyone in; do that only on a bot nobody else can reach.":
    "列在这里的人不需要配对码。单独一个 * 表示放行所有人，只在别人找不到的机器人上这样做。",
  "Paired chats": "已配对的聊天",
  "Nobody yet. Write to the bot from the app; a pairing code comes back, approve it here.":
    "还没有人。在聊天软件里给机器人发条消息，会收到配对码，在这里通过即可。",
  "Deliver here": "推送到这里",
  "Chats with “deliver here” on also get what the Muse does on its own: check-ins, reminders, the results of background work, and the questions it needs answered.":
    "开了「推送到这里」的聊天还会收到 Muse 主动做的事：问候、提醒、后台任务的结果，以及需要你回答的问题。",
  "Remove {name}? They will need a new pairing code.": "移除 {name}？对方需要重新配对。",
  Remove: "移除",
  "Send a test message": "发送测试消息",
  Sending: "发送中",
  "Create the bot by QR code": "扫码创建机器人",
  "Open in Feishu": "在飞书里打开",
  "Scan with Feishu, confirm the new bot, and the App ID and Secret are saved for you.":
    "用飞书扫码，确认创建机器人，App ID 和 Secret 会自动保存。",
  "Lark (international) instead of 飞书": "用 Lark（国际版）而不是飞书",
  "Waiting for the scan…": "等待扫码…",
  "The bot was created and is connecting.": "机器人已创建，正在连接。",
  "The login did not finish ({error}).": "登录没有完成（{error}）。",
  Cancel: "取消",
  "Set up": "设置步骤",
  "Open the console": "打开控制台",
  "Then write to the bot from the app. The first message gets a pairing code; approve it here or run": "然后在聊天软件里给机器人发消息。第一条消息会收到配对码，在这里通过，或运行",
  "Each chat is one conversation of your Muse; its replies stream back as they are written.":
    "每个聊天对应 Muse 的一个会话；回复会边写边发回来。",
  // Feishu steps
  "In the Feishu developer console create a custom app and add the Bot capability.": "在飞书开放平台创建企业自建应用，添加「机器人」能力。",
  "Permissions: im:message, im:message.p2p_msg:readonly, im:message.group_at_msg:readonly, im:resource.":
    "权限：im:message、im:message.p2p_msg:readonly、im:message.group_at_msg:readonly、im:resource。",
  "Events & callbacks: subscription mode Long connection; add im.message.receive_v1; callback mode Long connection; add card.action.trigger.":
    "事件与回调：订阅方式选「长连接」，添加 im.message.receive_v1；回调方式选「长连接」，添加 card.action.trigger。",
  "Copy App ID and App Secret from Credentials & Basic Info, then publish a version.": "在「凭证与基础信息」复制 App ID 和 App Secret，然后发布版本。",
  // DingTalk steps
  "In the DingTalk developer console create an internal app and add the Robot capability.": "在钉钉开放平台创建企业内部应用，添加「机器人」能力。",
  "Set the message receive mode to Stream.": "消息接收模式选「Stream 模式」。",
  "Copy Client ID (AppKey) and Client Secret (AppSecret) from Credentials & Basic Info.": "在「凭证与基础信息」复制 Client ID（AppKey）和 Client Secret（AppSecret）。",
  "Add the robot send-message permission and publish the version.": "添加机器人发消息权限，发布版本。",
  // WeCom steps
  "In the WeCom admin console open Intelligent robot and create a robot in API mode with a long connection.":
    "在企业微信管理后台打开「智能机器人」，创建 API 模式、长连接的机器人。",
  "Copy the Bot ID and Secret.": "复制 Bot ID 和 Secret。",
  "Add the robot to the chats where it should listen.": "把机器人加到需要它在的聊天里。",
  // Telegram steps
  "In Telegram talk to @BotFather, send /newbot and copy the token.": "在 Telegram 里找 @BotFather，发送 /newbot，复制 token。",
  "Direct messages work at once. For a group, add the bot to it; with Group Privacy on it only hears @-mentions and replies.":
    "私聊立即可用。群聊需要先把机器人拉进群；开着 Group Privacy 时它只听 @ 和回复。",
  "If api.telegram.org is out of reach from this computer, set a proxy below.": "如果这台电脑连不上 api.telegram.org，在下面填一个代理。",
};

type Vars = Record<string, string | number>;

function useTr(): (key: string, vars?: Vars) => string {
  const locale = useLocale();
  return (key, vars) => {
    let text = locale === "zh-CN" ? (ZH[key] ?? key) : key;
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
    return text;
  };
}

const STEPS: Record<string, string[]> = {
  feishu: [
    "In the Feishu developer console create a custom app and add the Bot capability.",
    "Permissions: im:message, im:message.p2p_msg:readonly, im:message.group_at_msg:readonly, im:resource.",
    "Events & callbacks: subscription mode Long connection; add im.message.receive_v1; callback mode Long connection; add card.action.trigger.",
    "Copy App ID and App Secret from Credentials & Basic Info, then publish a version.",
  ],
  dingtalk: [
    "In the DingTalk developer console create an internal app and add the Robot capability.",
    "Set the message receive mode to Stream.",
    "Copy Client ID (AppKey) and Client Secret (AppSecret) from Credentials & Basic Info.",
    "Add the robot send-message permission and publish the version.",
  ],
  wecom: [
    "In the WeCom admin console open Intelligent robot and create a robot in API mode with a long connection.",
    "Copy the Bot ID and Secret.",
    "Add the robot to the chats where it should listen.",
  ],
  telegram: [
    "In Telegram talk to @BotFather, send /newbot and copy the token.",
    "Direct messages work at once. For a group, add the bot to it; with Group Privacy on it only hears @-mentions and replies.",
    "If api.telegram.org is out of reach from this computer, set a proxy below.",
  ],
};

const ICONS: Record<string, ReactNode> = {
  telegram: <Send size={20} />,
};

function stateLabel(tr: (k: string) => string, c: ChannelInfo): string {
  const s = c.status.state;
  if (s === "off") return tr("Off");
  if (s === "unconfigured") return tr("Needs settings");
  if (s === "missing_sdk") return tr("Not installed");
  if (s === "connecting") return tr("Connecting…");
  if (s === "connected") return tr("Connected");
  return tr("Error");
}

function Dot({ state }: { state: ChannelInfo["status"]["state"] }) {
  const color =
    state === "connected" ? "bg-emerald-500" : state === "error" ? "bg-red-500" : state === "connecting" ? "bg-amber-400" : "bg-border";
  return <span aria-hidden className={cx("inline-block h-2 w-2 rounded-full", color)} />;
}

export function ChannelsScreen() {
  const { toast } = useStore();
  const tr = useTr();
  const [view, setView] = useState<ChannelsView | null>(null);

  const reload = async () => {
    try {
      setView(await channelsApi.view());
    } catch (e) {
      toast((e as Error).message);
    }
  };
  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 5000);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (work: () => Promise<ChannelsView>, done?: string) => {
    try {
      setView(await work());
      if (done) toast(done);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageBar
        title={tr("Chat apps")}
        description={tr("Talk to your Muse from the chat apps you already use. Nothing needs a public address: each app keeps a long connection open.")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        {view && view.pending.length > 0 && (
          <>
            <MuseSectionLabel>{tr("Waiting for a yes")}</MuseSectionLabel>
            <MuseCard>
              {view.pending.map((p, i) => (
                <div key={p.code}>
                  {i > 0 && <MuseDivider inset={16} />}
                  <PendingRow
                    p={p}
                    label={view.channels.find((c) => c.name === p.channel)?.label ?? p.channel}
                    onApprove={() => run(() => channelsApi.approve(p.code))}
                    onDeny={() => run(() => channelsApi.deny(p.code))}
                  />
                </div>
              ))}
            </MuseCard>
          </>
        )}
        {view?.channels.map((c) => <ChannelCard key={c.name} c={c} run={run} reload={reload} />)}
        {view && (
          <MuseCaption>{tr("Each chat is one conversation of your Muse; its replies stream back as they are written.")}</MuseCaption>
        )}
      </div>
    </div>
  );
}

function PendingRow({ p, label, onApprove, onDeny }: { p: PendingPairing; label: string; onApprove: () => void; onDeny: () => void }) {
  const tr = useTr();
  const who = p.sender_name || p.sender_id;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px]">{tr("{name} wrote to the bot. Approve to let them talk to your Muse.", { name: `${who} · ${label}` })}</p>
        <p className="text-[13px] text-muted">{tr("Code {code}", { code: p.code })}</p>
      </div>
      <button type="button" className={cx(primaryBtn, "px-3 py-2")} onClick={onApprove} aria-label={tr("Approve")}>
        <Check size={16} /> {tr("Approve")}
      </button>
      <button type="button" className={cx(secondaryBtn, "px-3 py-2")} onClick={onDeny} aria-label={tr("Deny")}>
        <X size={16} />
      </button>
    </div>
  );
}

function ChannelCard({
  c,
  run,
  reload,
}: {
  c: ChannelInfo;
  run: (work: () => Promise<ChannelsView>, done?: string) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const tr = useTr();
  const { toast } = useStore();
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  // secret fields the person asked to clear (an emptied input otherwise keeps the saved value)
  const [cleared, setCleared] = useState<string[]>([]);
  const [allow, setAllow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [steps, setSteps] = useState(false);
  const [login, setLogin] = useState<LoginSession | null>(null);
  const [loginNote, setLoginNote] = useState("");
  const [lark, setLark] = useState(false);
  const pollRef = useRef<number | null>(null);

  const dirty = Object.keys(edits).length > 0 || allow !== null;
  const allowText = allow ?? c.allow_from.join("\n");

  const save = async () => {
    setSaving(true);
    try {
      const body: { settings?: Record<string, string>; allow_from?: string[] } = {};
      const settings: Record<string, string> = {};
      for (const [key, value] of Object.entries(edits)) {
        const field = c.fields.find((f) => f.key === key);
        if (field?.kind === "secret" && value === "" && !cleared.includes(key)) continue;
        settings[key] = value;
      }
      if (Object.keys(settings).length) body.settings = settings;
      if (allow !== null) body.allow_from = allow.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      await run(() => channelsApi.update(c.name, body), tr("Saved."));
      setEdits({});
      setCleared([]);
      setAllow(null);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await channelsApi.test(c.name);
      toast(r.detail);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const stopPolling = () => {
    if (pollRef.current !== null) window.clearTimeout(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPolling, []);

  const beginLogin = async () => {
    setLoginNote("");
    try {
      const session = await channelsApi.loginBegin(c.name, lark ? "lark" : "feishu");
      setLogin(session);
      const started = Date.now();
      const poll = async () => {
        try {
          const r = await channelsApi.loginPoll(c.name, session.device_code);
          if (r.status === "succeeded") {
            setLogin(null);
            setLoginNote(tr("The bot was created and is connecting."));
            await reload();
            return;
          }
          if (r.status === "failed" || Date.now() - started > session.expires_in * 1000) {
            setLogin(null);
            setLoginNote(tr("The login did not finish ({error}).", { error: r.error ?? "expired" }));
            return;
          }
        } catch (e) {
          setLogin(null);
          setLoginNote((e as Error).message);
          return;
        }
        pollRef.current = window.setTimeout(() => void poll(), Math.max(2, session.interval) * 1000);
      };
      pollRef.current = window.setTimeout(() => void poll(), Math.max(2, session.interval) * 1000);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const cancelLogin = () => {
    stopPolling();
    setLogin(null);
  };

  const missing = c.fields.filter((f) => f.required && (f.kind === "secret" ? !f.has_value : !f.value)).map((f) => f.label);

  return (
    <>
      <MuseSectionLabel>{c.label}</MuseSectionLabel>
      <MuseCard>
        <MuseRow
          icon={ICONS[c.name] ?? <MessageSquare size={20} />}
          label={c.label}
          value={stateLabel(tr, c)}
          trailing={<Dot state={c.status.state} />}
          onClick={() => setOpen((v) => !v)}
        />
        <MuseDivider />
        <MuseSwitchRow
          label={tr("Switched on")}
          checked={c.enabled}
          disabled={!c.sdk_available && !c.enabled}
          onChange={(v) => void run(() => channelsApi.update(c.name, { enabled: v }))}
        />
        {c.status.state === "error" && c.status.detail && (
          <p className="px-4 pb-3 text-[13px] leading-[18px] text-red-600 dark:text-red-400">{c.status.detail}</p>
        )}
        {c.status.state === "unconfigured" && (
          <p className="px-4 pb-3 text-[13px] leading-[18px] text-muted">
            {tr("Missing")}: {c.status.detail || missing.join(", ")}
          </p>
        )}
        {!c.sdk_available && (
          <div className="px-4 pb-3 text-[13px] leading-[18px] text-muted">
            {tr("Install on the computer running nanoMuse, then switch it on again:")}
            <code className="mt-1 block select-all rounded-lg bg-surface-2 px-2 py-1 text-[12.5px] text-fg">{c.install}</code>
          </div>
        )}
        {(open || c.enabled) && (
          <>
            <MuseDivider inset={16} />
            <div className="space-y-3 px-4 py-3">
              {c.fields.map((f) => (
                <FieldInput
                  key={f.key}
                  f={f}
                  value={edits[f.key]}
                  onChange={(v) => {
                    setEdits((e) => ({ ...e, [f.key]: v }));
                    if (v !== "") setCleared((list) => list.filter((k) => k !== f.key));
                  }}
                  onClear={() => {
                    setEdits((e) => ({ ...e, [f.key]: "" }));
                    setCleared((list) => (list.includes(f.key) ? list : [...list, f.key]));
                  }}
                />
              ))}
              <label className="block">
                <span className="mb-1 block text-[13px] text-muted">{tr("In groups, reply")}</span>
                <select
                  className={inputCls}
                  value={c.group_policy}
                  onChange={(e) => void run(() => channelsApi.update(c.name, { group_policy: e.target.value as "mention" | "open" }))}
                >
                  <option value="mention">{tr("only when @-mentioned")}</option>
                  <option value="open">{tr("to every message")}</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[13px] text-muted">{tr("Always allowed (ids, one per line)")}</span>
                <textarea className={cx(inputCls, "min-h-[56px] font-mono text-[13px]")} value={allowText} onChange={(e) => setAllow(e.target.value)} rows={2} />
                <span className="mt-1 block text-[12.5px] leading-[17px] text-muted">
                  {tr("People listed here never need a pairing code. A lone * lets anyone in; do that only on a bot nobody else can reach.")}
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primaryBtn} disabled={!dirty || saving} onClick={() => void save()}>
                  {saving ? tr("Saving") : tr("Save")}
                </button>
                <button type="button" className={secondaryBtn} disabled={testing || c.status.state !== "connected"} onClick={() => void test()}>
                  <RefreshCw size={14} className={testing ? "animate-spin" : ""} /> {testing ? tr("Sending") : tr("Send a test message")}
                </button>
                {c.name === "feishu" && !login && (
                  <button type="button" className={secondaryBtn} onClick={() => void beginLogin()}>
                    <QrCode size={14} /> {tr("Create the bot by QR code")}
                  </button>
                )}
                <button type="button" className={secondaryBtn} onClick={() => setSteps((v) => !v)} aria-expanded={steps}>
                  {tr("Set up")}
                </button>
              </div>
              {c.name === "feishu" && !login && (
                <label className="flex items-center gap-2 text-[13px] text-muted">
                  <input type="checkbox" checked={lark} onChange={(e) => setLark(e.target.checked)} />
                  {tr("Lark (international) instead of 飞书")}
                </label>
              )}
              {login && (
                <div className="rounded-2xl bg-surface-2 p-3 text-center">
                  {login.qr_png ? (
                    <img src={`data:image/png;base64,${login.qr_png}`} alt="QR" className="mx-auto h-44 w-44 rounded-lg bg-white p-1" />
                  ) : null}
                  <p className="mt-2 text-[13px] text-muted">{tr("Scan with Feishu, confirm the new bot, and the App ID and Secret are saved for you.")}</p>
                  <p className="text-[13px] text-muted">{tr("Waiting for the scan…")}</p>
                  <div className="mt-2 flex justify-center gap-2">
                    <a href={login.url} target="_blank" rel="noreferrer" className={cx(secondaryBtn, "px-3 py-1.5")}>
                      <ExternalLink size={14} /> {tr("Open in Feishu")}
                    </a>
                    <button type="button" className={cx(secondaryBtn, "px-3 py-1.5")} onClick={cancelLogin}>
                      {tr("Cancel")}
                    </button>
                  </div>
                </div>
              )}
              {loginNote && <p className="text-[13px] text-muted">{loginNote}</p>}
              {steps && (
                <div className="rounded-2xl bg-surface-2 p-3 text-[13.5px] leading-[19px]">
                  <ol className="list-decimal space-y-1 pl-5">
                    {(STEPS[c.name] ?? []).map((s) => (
                      <li key={s}>{tr(s)}</li>
                    ))}
                  </ol>
                  <p className="mt-2 text-muted">
                    {tr("Then write to the bot from the app. The first message gets a pairing code; approve it here or run")}{" "}
                    <code className="rounded bg-surface px-1">nanomuse channels approve &lt;code&gt;</code>
                  </p>
                  {c.console_url && (
                    <a href={c.console_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline">
                      <ExternalLink size={14} /> {tr("Open the console")}
                    </a>
                  )}
                </div>
              )}
            </div>
            <MuseDivider inset={16} />
            <p className="px-4 pt-3 text-[13px] text-muted">{tr("Paired chats")}</p>
            {c.paired.length === 0 ? (
              <p className="px-4 pb-3 pt-1 text-[13px] leading-[18px] text-muted">
                {tr("Nobody yet. Write to the bot from the app; a pairing code comes back, approve it here.")}
              </p>
            ) : (
              c.paired.map((p) => (
                <div key={p.sender_id} className="flex items-center">
                  <div className="min-w-0 flex-1">
                    <MuseSwitchRow
                      label={p.sender_name || p.sender_id}
                      value={tr("Deliver here")}
                      checked={p.deliver}
                      onChange={(v) => void run(() => channelsApi.setDeliver(c.name, p.sender_id, v))}
                    />
                  </div>
                  <button
                    type="button"
                    className="mr-3 rounded-full p-2 text-muted hover:bg-surface-2"
                    aria-label={tr("Remove")}
                    onClick={() => {
                      if (!window.confirm(tr("Remove {name}? They will need a new pairing code.", { name: p.sender_name || p.sender_id }))) return;
                      void run(() => channelsApi.removeChat(c.name, p.sender_id));
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </>
        )}
      </MuseCard>
      {(open || c.enabled) && c.paired.length > 0 && (
        <MuseCaption>
          {tr("Chats with “deliver here” on also get what the Muse does on its own: check-ins, reminders, the results of background work, and the questions it needs answered.")}
        </MuseCaption>
      )}
    </>
  );
}

function FieldInput({
  f,
  value,
  onChange,
  onClear,
}: {
  f: ChannelField;
  value: string | undefined;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const tr = useTr();
  if (f.kind === "choice") {
    return (
      <label className="block">
        <span className="mb-1 block text-[13px] text-muted">{f.label}</span>
        <select className={inputCls} value={value ?? String(f.value ?? f.default)} onChange={(e) => onChange(e.target.value)}>
          {f.choices.map((ch) => (
            <option key={ch} value={ch}>
              {ch}
            </option>
          ))}
        </select>
        {f.help && <span className="mt-1 block text-[12.5px] text-muted">{f.help}</span>}
      </label>
    );
  }
  const secret = f.kind === "secret";
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] text-muted">
        {f.label}
        {f.required ? " *" : ""}
      </span>
      <div className="flex gap-2">
        <input
          type={secret ? "password" : "text"}
          autoComplete="off"
          className={inputCls}
          value={value ?? (secret ? "" : String(f.value ?? ""))}
          placeholder={secret && f.has_value ? tr("Set; leave blank to keep") : f.help}
          onChange={(e) => onChange(e.target.value)}
        />
        {secret && f.has_value && (
          <button type="button" className={cx(secondaryBtn, "shrink-0 px-3")} onClick={onClear} title={tr("Clear the saved value")} aria-label={tr("Clear the saved value")}>
            <X size={14} />
          </button>
        )}
      </div>
      {f.help && !secret && <span className="mt-1 block text-[12.5px] text-muted">{f.help}</span>}
    </label>
  );
}
