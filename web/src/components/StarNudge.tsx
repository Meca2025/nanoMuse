import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import type { CloudConfig } from "../types";
import { cx } from "../util";
import { REPO_URL } from "./CommunityNotice";
import { primaryBtn, secondaryBtn } from "./Form";

/**
 * The ask for a star, at the moments it is fair to make it: when the free allowance was just
 * claimed (the account page after signing in), after the first task the agent finished, and
 * when the allowance is used up (a row among the ways on). Each moment is asked once in this
 * browser; going to GitHub from any of them ends them all. A card where the moment is, never
 * a dialog.
 */
export type StarMoment = "signed_in" | "first_task";

const STARRED_KEY = "nm.star.starred";
const momentKey = (m: StarMoment) => `nm.star.${m}`;

const read = (k: string) => {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
const write = (k: string) => {
  try {
    localStorage.setItem(k, "1");
  } catch {
    /* private mode: the ask may come back; it is still only a card */
  }
};

/** Still worth asking at this moment: not asked before, and the person has not gone to star it. */
export const starDue = (m: StarMoment): boolean => !read(STARRED_KEY) && !read(momentKey(m));
/** The card was shown (or waved away): the moment is spent. */
export const starShown = (m: StarMoment): void => write(momentKey(m));
/** The person has been to GitHub from one of the asks. */
export const starred = (): boolean => read(STARRED_KEY);

/** Off to GitHub, and no more asking anywhere. */
export function openStar(repoUrl?: string): void {
  write(STARRED_KEY);
  window.open(repoUrl || REPO_URL, "_blank", "noopener,noreferrer");
}

/**
 * The relay's public figures (relay 0.15, `/api/cloud/config`): the allowance a new account
 * gets, the invite bonus, the repository — read once per page load and shared, so the copy
 * prints what the relay's operator set today rather than a number baked into the build.
 * Empty until it answers, and from an older relay; callers keep their fallbacks.
 */
let cached: CloudConfig | null = null;
let pending: Promise<CloudConfig> | null = null;
export function useCloudConfig(): CloudConfig {
  const [cfg, setCfg] = useState<CloudConfig>(cached ?? {});
  useEffect(() => {
    if (cached) return;
    pending ??= api
      .cloudConfig()
      .then((c) => (cached = c && typeof c === "object" ? c : {}))
      .catch(() => (cached = {}));
    let live = true;
    pending.then((c) => live && setCfg(c));
    return () => {
      live = false;
    };
  }, []);
  return cfg;
}

/** One card: the star, a line saying why, "Star on GitHub" and "Not now". */
export function StarNudge({ text, onDone, className }: { text: string; onDone: () => void; className?: string }) {
  const t = useT();
  const cfg = useCloudConfig();
  return (
    <section className={cx("rounded-[22px] border border-amber-400/40 bg-amber-50/70 p-4 dark:bg-amber-400/[0.08]", className)}>
      <div className="flex items-start gap-2.5">
        <Star size={18} className="mt-0.5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-snug">{t("Star nanoMuse on GitHub")}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-fg/85">{text}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-7">
        <button
          type="button"
          className={cx(primaryBtn, "!w-auto !py-1.5 !px-3.5 text-[13px]")}
          onClick={() => {
            openStar(cfg.repo_url);
            onDone();
          }}
        >
          {t("Star on GitHub")}
        </button>
        <button type="button" className={cx(secondaryBtn, "!w-auto !py-1.5 !px-3.5 text-[13px]")} onClick={onDone}>
          {t("Not now")}
        </button>
      </div>
    </section>
  );
}

/**
 * The card for a moment, shown once: `due` says the moment has come (the account was just
 * seen signed in; a task just finished). Marks the moment spent as soon as it is drawn.
 */
export function StarNudgeOnce({ moment, text, className, due = true }: { moment: StarMoment; text: string; className?: string; due?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!due || open || !starDue(moment)) return;
    starShown(moment);
    setOpen(true);
  }, [due, moment, open]);
  if (!open) return null;
  return <StarNudge text={text} onDone={() => setOpen(false)} className={className} />;
}
