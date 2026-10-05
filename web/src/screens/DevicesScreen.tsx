import { Check, Globe, Hand, MessageSquare, Monitor, Smartphone, Square, Wifi } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { PageBar } from "../components/BackBar";
import { CloudCard } from "../components/CloudCard";
import { MuseCaption, MuseCard, MuseDivider, MuseRow, MuseSwitchRow } from "../components/MuseList";
import { useT } from "../i18n";
import { useStore } from "../store";
import type { HandsStatus, HubDevice, HubView } from "../types";
import { cx, relativeTime } from "../util";

/**
 * Devices — the same screen as on the phone (docs/every-device.md), drawn the way the
 * Android app draws its Devices section: the account, then a card for this device (reachable,
 * operable, its name), a card of your other devices with an online dot and an "Ask" that opens
 * a chat addressed to it, and on a computer the card for its own hands.
 */
export function DevicesScreen() {
  const { state, dispatch, openThread, setTab, toast } = useStore();
  const t = useT();
  const hub = state.hub;
  const hands = state.hands;

  const reload = async () => {
    try {
      const [h, hs] = await Promise.all([api.hub(), api.hands()]);
      dispatch({ type: "ws", msg: { kind: "hub", hub: h } });
      dispatch({ type: "ws", msg: { kind: "hands_state", hands: hs } });
    } catch {
      /* offline; the live socket fills it in */
    }
  };
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = async (d: HubDevice) => {
    try {
      const r = await api.askDevice(d.id);
      dispatch({ type: "ws", msg: { kind: "thread", thread: r.thread } });
      openThread(r.thread.id);
      setTab("chat");
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const forget = (d: HubDevice) => {
    if (!window.confirm(t("Forget {name}? It can join again by signing in.", { name: d.name }))) return;
    void api.forgetDevice(d.id).then((h) => dispatch({ type: "ws", msg: { kind: "hub", hub: h } })).catch((e: Error) => toast(e.message));
  };

  const others = (hub?.devices ?? []).filter((d) => !d.this && d.kind !== "web");
  const signedIn = !!hub?.account.signed_in;

  return (
    <div className="flex h-full flex-col">
      <PageBar title={t("Devices")} />
      <div className="flex-1 overflow-y-auto pb-8 pt-2">
        <div className="px-4 pb-3">
          <CloudCard account={hub?.account ?? null} onChange={() => void reload()} />
        </div>

        {hub && <ThisDeviceCard hub={hub} onChange={() => void reload()} />}

        {/* your other devices */}
        <MuseCard className="mt-3">
          {others.length === 0 ? (
            <p className="p-4 text-[13px] leading-[18px] text-muted">
              {!signedIn
                ? t("Sign in above to see them.")
                : hub?.state !== "connected"
                  ? hubStateLabel(hub?.state ?? "", t)
                  : hub?.account.hint
                    ? t("None yet — sign in on your phone as {hint}, the account this device uses.", { hint: hub.account.hint })
                    : t("None yet — open nanoMuse on your phone and sign in with the same account.")}
              {signedIn && hub?.state === "connected" && (
                <>
                  {" "}
                  <a href="https://nanomuse.cn/dl/" target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline-offset-2 hover:underline">
                    {t("Get the phone app")}
                  </a>
                </>
              )}
            </p>
          ) : (
            others.map((d, i) => (
              <div key={d.id}>
                {i > 0 && <MuseDivider />}
                <MuseRow
                  icon={kindIcon(d.kind, 22)}
                  label={d.name}
                  value={[d.os || "", d.online ? t("online") : d.last_seen ? t("last seen {when}", { when: relativeTime(d.last_seen) }) : t("offline")].filter(Boolean).join(" · ")}
                  onClick={d.online ? () => void ask(d) : () => forget(d)}
                  trailing={
                    <span className="flex shrink-0 items-center gap-2.5">
                      {d.online && (
                        <span className="flex items-center gap-1 text-[14px] font-medium text-accent">
                          <MessageSquare size={14} /> {t("Ask")}
                        </span>
                      )}
                      <span className={cx("h-2.5 w-2.5 rounded-full", d.online ? "bg-[#2fb344]" : "bg-muted/35")} />
                    </span>
                  }
                />
              </div>
            ))
          )}
        </MuseCard>
        <MuseCaption>{t("A chat addressed to a device runs there; you see every step here and answer its approvals.")}</MuseCaption>

        {hands && !hands.reason?.includes("phone") && <HandsCard hands={hands} onChange={() => void reload()} />}
      </div>
    </div>
  );
}

function ThisDeviceCard({ hub, onChange }: { hub: HubView; onChange: () => void }) {
  const { dispatch, toast } = useStore();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(hub.device.name);
  const [busy, setBusy] = useState(false);
  const signedIn = hub.account.signed_in;

  const update = async (body: { enabled?: boolean; remote_control?: boolean; name?: string }) => {
    setBusy(true);
    try {
      const h = await api.updateHub(body);
      dispatch({ type: "ws", msg: { kind: "hub", hub: h } });
      onChange();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const status = !signedIn
    ? t("Signed out")
    : !hub.enabled
      ? t("Off")
      : hub.state === "connected"
        ? t("Connected")
        : hub.state === "refused"
          ? t("Refused")
          : t("Connecting…");

  return (
    <MuseCard>
      <p className="p-4 text-[13px] leading-[18px] text-muted">{t("Devices signed in to the same account see each other; one can ask another to do something where it is.")}</p>
      <MuseDivider inset={16} />
      <MuseSwitchRow label={t("Join the hub")} value={status} checked={hub.enabled && signedIn} disabled={!signedIn || busy} onChange={(v) => void update({ enabled: v })} />
      <MuseCaption className="pb-3 pt-0">{signedIn ? t("Reachable by your other devices while this runs.") : t("Sign in first.")}</MuseCaption>
      <MuseDivider inset={16} />
      <MuseSwitchRow label={t("My other devices may operate it")} checked={hub.remote_control} disabled={busy} onChange={(v) => void update({ remote_control: v })} />
      <MuseCaption className="pb-3 pt-0">{t("They can run commands, read files and see its screen here; each step still goes through the Sentinel.")}</MuseCaption>
      <MuseDivider inset={16} />
      {editing ? (
        <form
          className="flex items-center gap-2 px-4 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            void update({ name: draft.trim() }).then(() => setEditing(false));
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={60}
            autoFocus
            aria-label={t("This device's name")}
            placeholder={t("A name your other devices will see")}
            className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label={t("Save")} className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-fg disabled:opacity-40">
            <Check size={16} />
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="flex w-full items-center gap-3.5 px-4 py-3 text-left hover:bg-surface-2/60">
          <Monitor size={22} className="shrink-0 text-fg" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] leading-4 text-muted">{t("This device's name")}</span>
            <span className="block truncate text-[16px] leading-[21px]">{hub.device.name}</span>
          </span>
          <span className="text-muted/70">›</span>
        </button>
      )}
      {(hub.state === "refused" || hub.state === "disconnected") && hub.detail && (
        <div className="mx-4 mb-3 rounded-xl bg-amber-500/12 px-3 py-2 text-[12.5px] text-amber-700 dark:text-amber-300">{hub.detail}</div>
      )}
    </MuseCard>
  );
}

function HandsCard({ hands, onChange }: { hands: HandsStatus; onChange: () => void }) {
  const { dispatch, toast, state } = useStore();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const museName = state.profile?.name ?? "nanoMuse";

  const set = async (body: { enabled?: boolean; backend?: string; mode?: string }) => {
    setBusy(true);
    try {
      const h = await api.setHands(body);
      dispatch({ type: "ws", msg: { kind: "hands_state", hands: h } });
      onChange();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const status = hands.task_active ? t("Working") : hands.enabled ? (hands.available ? t("On") : t("Unavailable")) : t("Off");

  return (
    <>
      <MuseCard className="mt-3">
        <MuseSwitchRow icon={<Hand size={22} />} label={t("Hands on this computer")} value={status} checked={hands.enabled} disabled={busy} onChange={(v) => void set({ enabled: v })} />
        <MuseCaption className="pb-3 pt-0">
          {hands.task_active
            ? hands.task_text || t("On the screen now")
            : hands.available
              ? t("It looks at a screenshot and clicks by position; paying, sending and deleting ask you first.")
              : hands.reason || t("Nothing can drive this screen yet.")}
        </MuseCaption>
        <MuseDivider inset={16} />
        <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-muted">
          <span>{t("Driver")}:</span>
          {(["auto", "desktop", "pyautogui", "xdotool"] as const).map((b) => (
            <button
              key={b}
              type="button"
              disabled={busy}
              onClick={() => void set({ backend: b })}
              className={cx("rounded-full px-2.5 py-1", (hands.backend ?? "auto") === b || (b === "auto" && !hands.backend) ? "bg-fg text-bg" : "bg-surface-2 text-fg")}
            >
              {b}
            </button>
          ))}
        </div>
        {(hands.device?.platform === "darwin" || hands.window?.available) && (
          <>
            <MuseDivider inset={16} />
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-[13px] text-muted">
              <span>{t("Where")}:</span>
              {(["auto", "window", "screen"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={busy}
                  onClick={() => void set({ mode: m })}
                  className={cx("rounded-full px-2.5 py-1", (hands.mode ?? "auto") === m ? "bg-fg text-bg" : "bg-surface-2 text-fg")}
                >
                  {m === "auto" ? t("Auto") : m === "window" ? t("One window") : t("Whole screen")}
                </button>
              ))}
            </div>
            <MuseCaption className="pb-3 pt-0">
              {hands.window?.active && hands.window.app
                ? t("Working in {app}'s window; the mouse stays yours.", { app: hands.window.app })
                : hands.window?.reason && (hands.mode ?? "auto") !== "screen"
                  ? t("On the whole screen for now: {reason}", { reason: hands.window.reason })
                  : t("One window: the hands work inside the app they were given, send clicks and keys to it alone and leave your mouse alone. Whole screen: the system mouse, like other platforms. Auto picks one window as soon as an app is named.")}
            </MuseCaption>
          </>
        )}
        {hands.task_active && (
          <>
            <MuseDivider inset={16} />
            <MuseRow icon={<Square size={18} fill="currentColor" />} label={t("Stop the hands")} onClick={() => void api.stopHands().catch((e: Error) => toast(e.message))} chevron={false} />
          </>
        )}
      </MuseCard>
      {hands.enabled && hands.device?.platform === "darwin" && (
        <MuseCaption>{t("On a Mac, allow nanoMuse under System Settings → Privacy & Security → Accessibility and Screen Recording when macOS asks; without them clicks do nothing and the screenshot is black. The first action in each app asks you once — \"Let {name} use Safari?\" — and the answer is kept under Permissions.", { name: museName })}</MuseCaption>
      )}
    </>
  );
}

export function kindIcon(kind: string, size = 18): ReactNode {
  switch (kind) {
    case "phone":
      return <Smartphone size={size} />;
    case "computer":
      return <Monitor size={size} />;
    case "web":
      return <Globe size={size} />;
    default:
      return <Wifi size={size} />;
  }
}

export function hubStateLabel(state: string, t: (s: string) => string): string {
  switch (state) {
    case "connected":
      return t("On the hub");
    case "connecting":
    case "disconnected":
      return t("Connecting to the hub…");
    case "refused":
      return t("The hub refused this device — sign in again.");
    case "signed_out":
      return t("Not signed in.");
    case "off":
    case "stopped":
      return t("The hub is off on this device.");
    default:
      return state;
  }
}
