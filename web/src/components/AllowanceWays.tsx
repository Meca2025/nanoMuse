import { Copy, ExternalLink, KeyRound, Loader2, Share2, Sparkles, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import { useStore } from "../store";
import { cx } from "../util";
import { primaryBtn, secondaryBtn } from "./Form";

/**
 * What the relay says beside a `429 allowance_exhausted` (and what `/v1/me.spend` carries):
 * the numbers and where the three ways on lead. Every field is optional so a card can be
 * drawn from an older relay's reply too.
 */
export interface AllowanceInfo {
  left?: number | null;
  grant?: number;
  invite_url?: string;
  invite_bonus_cny?: number;
  contribute_bonus_available?: boolean;
  contribute_bonus_cny?: number;
  own_key_docs?: string;
}

export const OWN_KEY_DOCS = "https://nanomuse.cn/own-key";
/** The preset the Connections page opens with when someone comes here for their own key. */
const PRESET_HINT = "nm.connections.preset";

/** Send the person to Connections with 阿里云百炼 (the recommended own-key provider) preselected. */
export function openOwnKeySetup(setTab: (tab: "connections") => void, preset = "qwen"): void {
  try {
    sessionStorage.setItem(PRESET_HINT, preset);
  } catch {
    /* private mode: the page still opens, on the current preset */
  }
  setTab("connections");
}

/** The preset a card asked Connections to open with, once. */
export function takePresetHint(): string | null {
  try {
    const v = sessionStorage.getItem(PRESET_HINT);
    if (v) sessionStorage.removeItem(PRESET_HINT);
    return v;
  } catch {
    return null;
  }
}

/**
 * The three ways on when the free allowance is (nearly) spent: one's own model key
 * (阿里云百炼 first — free quota for new accounts, one key for chat, pictures and video),
 * inviting a friend, joining the co-creation programme. Sign-in and the devices keep
 * working whichever is chosen: the allowance only gates the model.
 */
export function AllowanceWays({
  info,
  exhausted,
  compact,
  onChanged,
}: {
  info: AllowanceInfo;
  /** true = the pool is spent (the card leads with that); false = the 80 % heads-up */
  exhausted: boolean;
  /** inside the chat: tighter spacing, no big title */
  compact?: boolean;
  /** after the co-creation bonus was taken (the account page reloads) */
  onChanged?: () => void;
}) {
  const t = useT();
  const { toast, setTab } = useStore();
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const inviteBonus = info.invite_bonus_cny ?? 5;
  const contributeBonus = info.contribute_bonus_cny ?? 10;
  const docs = info.own_key_docs || OWN_KEY_DOCS;
  const link = info.invite_url || "";

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t("Copied"));
    } catch {
      toast(text);
    }
  };
  const share = async () => {
    const text = t("Try nanoMuse with me — a fully open-source personal agent, free to use. Sign up with my link: {link}", { link });
    const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ text });
        return;
      } catch {
        /* cancelled — fall through to the clipboard */
      }
    }
    await copy(text);
  };
  const join = async () => {
    setJoining(true);
    try {
      await api.cloudContribute(true);
      setJoined(true);
      toast(t("Joined — ¥{bonus} added to your allowance.", { bonus: contributeBonus.toFixed(0) }));
      onChanged?.();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const lead = exhausted
    ? t("The free allowance is used up.")
    : t("Nearly used up: ¥{left} of ¥{grant} left.", { left: (info.left ?? 0).toFixed(2), grant: (info.grant ?? 0).toFixed(0) });

  return (
    <div className={cx("space-y-2.5", !compact && "pt-1")}>
      <div>
        <div className={cx("font-semibold", compact ? "text-[13.5px]" : "text-[15px]")}>{lead}</div>
        <div className="mt-0.5 text-[12.5px] text-muted">{t("Three ways on — your sign-in and your devices keep working either way.")}</div>
      </div>

      <Way icon={<KeyRound size={16} />} tone="bg-accent/12 text-accent" title={t("Use your own model key")}>
        <p className="text-[12.5px] text-muted">
          {t("Alibaba Cloud Bailian (阿里云百炼) is a good start: a new account comes with a free quota, set-up takes about two minutes, and one key covers chat, pictures and video.")}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openOwnKeySetup(setTab)} className={cx(primaryBtn, "inline-flex items-center gap-1.5 py-2")}>
            <KeyRound size={14} /> {t("Set it up")}
          </button>
          <a href={docs} target="_blank" rel="noopener noreferrer" className={cx(secondaryBtn, "inline-flex items-center gap-1.5")}>
            <ExternalLink size={14} /> {t("Step-by-step guide")}
          </a>
        </div>
      </Way>

      <Way icon={<Users size={16} />} tone="bg-violet-500/12 text-violet-600 dark:text-violet-300" title={t("Invite a friend: +¥{bonus} for each new person who signs up with your link.", { bonus: inviteBonus.toFixed(0) })}>
        {link ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void share()} className={cx(secondaryBtn, "inline-flex items-center gap-1.5")}>
              <Share2 size={14} /> {t("Share the link")}
            </button>
            <button type="button" onClick={() => void copy(link)} className={cx(secondaryBtn, "inline-flex items-center gap-1.5")}>
              <Copy size={14} /> {t("Copy the link")}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setTab("account")} className={cx(secondaryBtn, "inline-flex items-center gap-1.5")}>
            <Share2 size={14} /> {t("Your invite link is under Account")}
          </button>
        )}
      </Way>

      {(info.contribute_bonus_available || joined) && contributeBonus > 0 && (
        <Way icon={<Sparkles size={16} />} tone="bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" title={t("Join the co-creation programme: +¥{bonus}, once.", { bonus: contributeBonus.toFixed(0) })}>
          <p className="text-[12.5px] text-muted">
            {t("Your conversations (messages and replies; pictures as a marker) help train the community's own open model. Never required — leave and delete what you gave at any time.")}
          </p>
          {joined ? (
            <div className="text-[12.5px] font-medium text-emerald-700 dark:text-emerald-300">{t("Joined — ¥{bonus} added to your allowance.", { bonus: contributeBonus.toFixed(0) })}</div>
          ) : (
            <button type="button" disabled={joining} onClick={() => void join()} className={cx(secondaryBtn, "inline-flex items-center gap-1.5")}>
              {joining ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {t("Join")}
            </button>
          )}
        </Way>
      )}
    </div>
  );
}

function Way({ icon, tone, title, children }: { icon: ReactNode; tone: string; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-surface-2/60 p-3">
      <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", tone)}>{icon}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-[13px] font-medium leading-snug">{title}</div>
        {children}
      </div>
    </div>
  );
}
